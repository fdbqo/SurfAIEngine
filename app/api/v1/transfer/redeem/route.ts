import { NextResponse } from "next/server"
import { z } from "zod"
import { redeemTransferCode } from "@/lib/transfer/transfer"

export const runtime = "nodejs"

const BodySchema = z.object({
  code: z.string().min(4).max(64),
  // deviceId is the per-device stable ID; if a client doesn't have one yet, it may pass userId.
  deviceId: z.string().min(1).max(200),
  // optional: helps migrate any pre-existing device targets registered under a different userId
  currentUserId: z.string().min(1).max(200).optional(),
})

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid request body"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  try {
    const out = await redeemTransferCode({
      code: parsed.data.code,
      targetDeviceId: parsed.data.deviceId,
      targetUserId: parsed.data.currentUserId,
    })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

