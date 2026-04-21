import { NextResponse } from "next/server"
import { z } from "zod"
import { sendWebPushToUser } from "@/lib/notifications/notifications"

export const runtime = "nodejs"

const BodySchema = z.object({
  userId: z.string().min(1).max(200).optional().default("test-user-1"),
})

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(raw ?? {})
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid request body"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { userId } = parsed.data
    const result = await sendWebPushToUser(userId, {
      title: "Surf AI Engine — push test",
      body: `Push received at ${new Date().toLocaleTimeString()}`,
      url: "/",
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

