import { NextResponse } from "next/server"
import { z } from "zod"
import { createTransferCode } from "@/lib/transfer/transfer"
import { requireDeviceAuth } from "@/lib/auth/deviceAuth"
import { getClientIp, rateLimit } from "@/lib/auth/rateLimit"

export const runtime = "nodejs"

const BodySchema = z.object({
  userId: z.string().min(1).max(200),
  deviceId: z.string().min(1).max(200),
  ttlMinutes: z.number().int().min(1).max(60).optional(),
})

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit({ key: `transfer_create:${ip}`, limit: 10, windowMs: 60_000 })
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
    const profile = await requireDeviceAuth(req, parsed.data.deviceId)
    if (!profile || typeof (profile as any).userId !== "string" || (profile as any).userId !== parsed.data.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { code, expiresAt } = await createTransferCode({
      sourceUserId: parsed.data.userId,
      ttlMinutes: parsed.data.ttlMinutes,
    })
    return NextResponse.json({ ok: true, code, expiresAt })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed"
    const status = /unauthorized|missing device auth|invalid device auth|not initialized/i.test(msg) ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

