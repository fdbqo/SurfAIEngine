import { NextResponse } from "next/server"
import { z } from "zod"
import { redeemTransferCode } from "@/lib/transfer/transfer"
import { requireDeviceAuth } from "@/lib/auth/deviceAuth"
import { getClientIp, rateLimit } from "@/lib/auth/rateLimit"

export const runtime = "nodejs"

const BodySchema = z.object({
  code: z.string().min(4).max(64),
  // deviceId is the per-device stable ID; if a client doesn't have one yet, it may pass userId.
  deviceId: z.string().min(1).max(200),
  // optional: helps migrate any pre-existing device targets registered under a different userId
  currentUserId: z.string().min(1).max(200).optional(),
})

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit({ key: `transfer_redeem:${ip}`, limit: 20, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }
  const raw = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid request body"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  try {
    await requireDeviceAuth(req, parsed.data.deviceId)
    const out = await redeemTransferCode({
      code: parsed.data.code,
      targetDeviceId: parsed.data.deviceId,
      targetUserId: parsed.data.currentUserId,
    })
    return NextResponse.json(out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed"
    const status = /unauthorized|missing device auth|invalid device auth|not initialized/i.test(msg) ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

