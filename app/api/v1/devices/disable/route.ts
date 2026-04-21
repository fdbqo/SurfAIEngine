import { NextResponse } from "next/server"
import { z } from "zod"
import { disableDeviceTarget } from "@/lib/notifications/notifications"

export const runtime = "nodejs"

const BodySchema = z.union([
  z.object({ channel: z.literal("webpush"), endpoint: z.string().min(10) }),
  z.object({ channel: z.literal("expo"), expoToken: z.string().min(10) }),
])

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid request body"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  try {
    const b = parsed.data as any
    await disableDeviceTarget(b)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

