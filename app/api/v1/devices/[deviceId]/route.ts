import { NextResponse } from "next/server"
import mongoose from "mongoose"
import connectDB from "@/lib/db/connect"
import { requireDeviceAuth } from "@/lib/auth/deviceAuth"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ deviceId: string }> }

export async function DELETE(req: Request, context: RouteContext) {
  const { deviceId: encoded } = await context.params
  const deviceId = decodeURIComponent(encoded)

  try {
    await requireDeviceAuth(req, deviceId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 })
  }

  try {
    await connectDB()

    // Best-effort: remove any legacy PushSubscription rows that match this device's webpush endpoints.
    const targets = await mongoose.connection.collection("devicetargets").find({ deviceId }).project({ endpoint: 1 }).toArray()
    const endpoints = targets
      .map((t: any) => (typeof t?.endpoint === "string" ? t.endpoint : null))
      .filter((x: string | null): x is string => !!x)

    const [deviceTargetsRes, legacySubsRes, transferCodesRes, deviceProfileRes] = await Promise.all([
      mongoose.connection.collection("devicetargets").deleteMany({ deviceId }),
      endpoints.length > 0 ? mongoose.connection.collection("pushsubscriptions").deleteMany({ endpoint: { $in: endpoints } }) : Promise.resolve(null),
      mongoose.connection.collection("transfercodes").deleteMany({ usedByDeviceId: deviceId }),
      mongoose.connection.collection("deviceprofiles").deleteOne({ deviceId }),
    ])

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

