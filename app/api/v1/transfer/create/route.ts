import { NextResponse } from "next/server"
import { z } from "zod"
import { createTransferCode } from "@/lib/transfer/transfer"

export const runtime = "nodejs"

const BodySchema = z.object({
  userId: z.string().min(1).max(200),
  ttlMinutes: z.number().int().min(1).max(60).optional(),
})

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid request body"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  try {
    const { code, expiresAt } = await createTransferCode({
      sourceUserId: parsed.data.userId,
      ttlMinutes: parsed.data.ttlMinutes,
    })
    return NextResponse.json({ ok: true, code, expiresAt })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

