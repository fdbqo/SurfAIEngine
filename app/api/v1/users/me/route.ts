import { NextResponse } from "next/server"
import { z } from "zod"
import mongoose from "mongoose"
import connectDB from "@/lib/db/connect"
import { requireDeviceAuth } from "@/lib/auth/deviceAuth"

export const runtime = "nodejs"

const BodySchema = z
  .object({
    deviceId: z.string().min(1).max(200).optional(),
  })
  .optional()

function deviceIdFrom(req: Request, body: unknown): string | null {
  const fromHeader = req.headers.get("x-device-id")?.trim()
  if (fromHeader) return fromHeader
  const parsed = BodySchema.safeParse(body)
  if (parsed.success && parsed.data?.deviceId) return parsed.data.deviceId
  return null
}

export async function GET(req: Request) {
  const deviceId = req.headers.get("x-device-id")?.trim()
  if (!deviceId) {
    return NextResponse.json({ error: "x-device-id header is required" }, { status: 400 })
  }

  let profile: any
  try {
    profile = await requireDeviceAuth(req, deviceId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 })
  }

  const userId = typeof profile?.userId === "string" ? profile.userId.trim() : null
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({ ok: true, userId, deleted: false })
}

export async function DELETE(req: Request) {
  const raw = await req.json().catch(() => null)
  const deviceId = deviceIdFrom(req, raw)
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required (send x-device-id header or JSON body { deviceId })" }, { status: 400 })
  }

  let profile: any
  try {
    profile = await requireDeviceAuth(req, deviceId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 })
  }

  const userId = typeof profile?.userId === "string" ? profile.userId.trim() : null
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await connectDB()

    // Some historic rows may have whitespace around userId. Match on trimmed userId to ensure full erasure.
    const userIdMatch = { $expr: { $eq: [{ $trim: { input: "$userId" } }, userId] } }

    const deviceIds = await mongoose.connection
      .collection("deviceprofiles")
      .find(userIdMatch)
      .project({ deviceId: 1 })
      .toArray()
      .then((rows) =>
        rows.map((r: any) => (typeof r?.deviceId === "string" ? r.deviceId : null)).filter((x: string | null): x is string => !!x),
      )

    const deletedDevices = deviceIds.length

    await Promise.all([
      // Devices + per-device prefs snapshot
      mongoose.connection.collection("deviceprofiles").deleteMany(userIdMatch),

      // Push target storage (webpush endpoints + expo tokens)
      mongoose.connection.collection("devicetargets").deleteMany(userIdMatch),

      // Legacy push subscription storage
      mongoose.connection.collection("pushsubscriptions").deleteMany(userIdMatch),

      // Notification history + schedule
      mongoose.connection.collection("notificationevents").deleteMany(userIdMatch),
      mongoose.connection.collection("notificationschedules").deleteMany(userIdMatch),

      // Transfer codes (issued by this user, or redeemed by any of their devices)
      mongoose.connection.collection("transfercodes").deleteMany({ $or: [{ sourceUserId: userId }, ...(deviceIds.length ? [{ usedByDeviceId: { $in: deviceIds } }] : [])] }),

      // User row (if present)
      mongoose.connection.collection("users").deleteOne({ id: userId }),
    ])

    return NextResponse.json({ ok: true, deletedDevices })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

