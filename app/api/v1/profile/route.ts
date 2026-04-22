import { NextResponse } from "next/server"
import { z } from "zod"
import { requireDeviceAuth } from "@/lib/auth/deviceAuth"
import { getClientIp, rateLimit } from "@/lib/auth/rateLimit"
import { getDeviceProfileByDeviceId } from "@/lib/db/services/deviceProfileService"
import { toPublicDeviceProfile } from "@/lib/transfer/publicDeviceProfile"

export const runtime = "nodejs"

const QuerySchema = z.object({
  deviceId: z.string().min(1).max(200),
})

export async function GET(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit({ key: `profile_get:${ip}`, limit: 60, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const u = new URL(req.url)
  const parsed = QuerySchema.safeParse({ deviceId: u.searchParams.get("deviceId") ?? "" })
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid query"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  const { deviceId } = parsed.data

  try {
    const profileDoc = await requireDeviceAuth(req, deviceId)
    if (!profileDoc || (profileDoc as any).userId == null) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Refresh from DB to avoid returning stale in-memory state.
    const fresh = await getDeviceProfileByDeviceId(deviceId)
    if (!fresh) {
      return NextResponse.json({ error: "Device profile not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, profile: toPublicDeviceProfile(fresh as any) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed"
    const status = /unauthorized|missing device auth|invalid device auth|not initialized/i.test(msg) ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
