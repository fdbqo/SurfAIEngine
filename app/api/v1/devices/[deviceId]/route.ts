import { NextResponse } from "next/server"
import mongoose from "mongoose"
import connectDB from "@/lib/db/connect"
import { requireDeviceAuth } from "@/lib/auth/deviceAuth"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ deviceId: string }> }

export async function DELETE(req: Request, context: RouteContext) {
  const { deviceId: encoded } = await context.params
  const targetDeviceId = decodeURIComponent(encoded)

  const callerDeviceId = req.headers.get("x-device-id")?.trim()

  let callerProfile: any
  try {
    // Prefer authenticating the *caller* device, so we can enforce "same userId owns target device".
    // Fallback: allow token that is specifically for the target device (older clients).
    callerProfile = await requireDeviceAuth(req, callerDeviceId || targetDeviceId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 })
  }

  const userId = typeof callerProfile?.userId === "string" ? callerProfile.userId.trim() : null
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await connectDB()

    // Only allow deleting devices that belong to the authenticated userId.
    const owned = await mongoose.connection.collection("deviceprofiles").findOne({
      deviceId: targetDeviceId,
      $expr: { $eq: [{ $trim: { input: "$userId" } }, userId] },
    })
    if (!owned) {
      // GDPR-safe: if already deleted OR not owned, return 404 (client treats as already deleted).
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Best-effort: remove any legacy PushSubscription rows that match this device's webpush endpoints.
    const targets = await mongoose.connection.collection("devicetargets").find({ deviceId: targetDeviceId }).project({ endpoint: 1 }).toArray()
    const endpoints = targets
      .map((t: any) => (typeof t?.endpoint === "string" ? t.endpoint : null))
      .filter((x: string | null): x is string => !!x)

    const [deviceTargetsRes, legacySubsRes, transferCodesRes, deviceProfileRes] = await Promise.all([
      mongoose.connection.collection("devicetargets").deleteMany({ deviceId: targetDeviceId }),
      endpoints.length > 0 ? mongoose.connection.collection("pushsubscriptions").deleteMany({ endpoint: { $in: endpoints } }) : Promise.resolve(null),
      mongoose.connection.collection("transfercodes").deleteMany({ usedByDeviceId: targetDeviceId }),
      mongoose.connection.collection("deviceprofiles").deleteOne({ deviceId: targetDeviceId }),
    ])

    if ((deviceProfileRes?.deletedCount ?? 0) === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      deleted: {
        deviceProfiles: deviceProfileRes?.deletedCount ?? 0,
        deviceTargets: deviceTargetsRes?.deletedCount ?? 0,
        pushSubscriptions: (legacySubsRes as any)?.deletedCount ?? 0,
        transferCodes: transferCodesRes?.deletedCount ?? 0,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

