import crypto from "crypto"
import connectDB from "@/lib/db/connect"
import { TransferCodeModel } from "@/lib/db/models/TransferCode"
import { DeviceProfileModel } from "@/lib/db/models/DeviceProfile"
import { getDeviceProfileByDeviceId, getDeviceProfileByUserId } from "@/lib/db/services/deviceProfileService"
import { getOrInitSchedule } from "@/lib/notifications/notifications"
import mongoose from "mongoose"
import { toPublicDeviceProfile, type PublicDeviceProfile } from "@/lib/transfer/publicDeviceProfile"

function requireSecret(): string {
  const s = process.env.TRANSFER_CODE_SECRET?.trim() || process.env.DEVICE_AUTH_SECRET?.trim()
  if (process.env.NODE_ENV === "production" && !s) {
    throw new Error("TRANSFER_CODE_SECRET must be set in production")
  }
  // Best-effort in dev.
  return s || "dev-transfer-secret"
}

function hashCode(code: string): string {
  return crypto.createHmac("sha256", requireSecret()).update(code).digest("hex")
}

function generateCode(): string {
  // 10 bytes => 20 hex chars => 4-4-4-4-4 groups (user friendly).
  const hex = crypto.randomBytes(10).toString("hex").toUpperCase()
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}`
}

export async function createTransferCode(args: { sourceUserId: string; ttlMinutes?: number }) {
  await connectDB()
  const code = generateCode()
  const codeHash = hashCode(code)
  const ttlMin = Math.max(1, Math.min(60, args.ttlMinutes ?? 10))
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000)

  await TransferCodeModel.create({
    codeHash,
    sourceUserId: args.sourceUserId,
    expiresAt,
  })

  return { code, expiresAt }
}

export async function redeemTransferCode(args: {
  code: string
  targetDeviceId: string
  targetUserId?: string
}) {
  await connectDB()
  const codeHash = hashCode(args.code.trim().toUpperCase())
  const now = new Date()

  const session = await mongoose.startSession()
  try {
    let canonicalUserId: string | null = null

    await session.withTransaction(async () => {
      const doc = await TransferCodeModel.findOne({ codeHash }).session(session)
      if (!doc) throw new Error("Invalid transfer code")
      if (doc.usedAt) throw new Error("Transfer code already used")
      if (doc.expiresAt.getTime() <= now.getTime()) throw new Error("Transfer code expired")

      canonicalUserId = doc.sourceUserId

      // Mark used first (prevents race-y double-claims).
      doc.usedAt = now
      doc.usedByDeviceId = args.targetDeviceId
      await doc.save({ session })

      // Copy preferences from the source user's latest profile into the target device's profile.
      const sourceProfile = await getDeviceProfileByUserId(doc.sourceUserId)
      if (!sourceProfile) throw new Error("Source user has no device profile to transfer")

      await DeviceProfileModel.updateOne(
        { deviceId: args.targetDeviceId },
        {
          $set: {
            userId: doc.sourceUserId,
            onboardingCompleted: sourceProfile.onboardingCompleted,
            units: sourceProfile.units,
            skill: sourceProfile.skill,
            preferences: sourceProfile.preferences ?? {},
            notificationSettings: sourceProfile.notificationSettings,
            usualLocation: sourceProfile.usualLocation,
            homeRegion: sourceProfile.homeRegion,
            usualRegions: sourceProfile.usualRegions,
            // keep location continuity when transferring account setup
            lastLocation: (sourceProfile as any).lastLocation,
          },
        },
        { upsert: true, session },
      )

      // Re-key this device's push targets to the canonical userId, even if the client
      // didn't pass currentUserId (prevents "transfer succeeded in app" drift in DB).
      await mongoose.connection.collection("devicetargets").updateMany(
        { deviceId: args.targetDeviceId, userId: { $ne: doc.sourceUserId } },
        { $set: { userId: doc.sourceUserId } },
        { session },
      )

      // Best-effort legacy webpush model migration: only when client tells us the prior userId.
      if (args.targetUserId && args.targetUserId !== doc.sourceUserId) {
        await mongoose.connection.collection("pushsubscriptions").updateMany(
          { userId: args.targetUserId },
          { $set: { userId: doc.sourceUserId } },
          { session },
        )
      }

      // Ensure canonical user has a schedule row (safe no-op if exists).
      await getOrInitSchedule(doc.sourceUserId)
    })

    if (!canonicalUserId) throw new Error("Transfer redeem failed")
    const p = (await getDeviceProfileByDeviceId(args.targetDeviceId)) as any
    if (!p) throw new Error("Transfer redeem failed: target profile not found after update")
    const profile: PublicDeviceProfile = toPublicDeviceProfile(p)
    return { ok: true, userId: canonicalUserId, profile }
  } finally {
    session.endSession()
  }
}

