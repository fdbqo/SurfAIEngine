import { NextResponse } from "next/server"
import { z } from "zod"
import { listActiveDeviceTargetsForUser, sendNotificationToUser } from "@/lib/notifications/notifications"

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
    const targets = await listActiveDeviceTargetsForUser(userId)
    const activeDeviceTargets = {
      webpush: targets.filter((t) => (t as { channel?: string }).channel === "webpush").length,
      expo: targets.filter((t) => (t as { channel?: string }).channel === "expo").length,
    }
    const result = await sendNotificationToUser(userId, {
      title: "Surf AI Engine — push test",
      body: `Push received at ${new Date().toLocaleTimeString()}`,
      url: "/",
    })
    // Visible in Vercel → Project → Logs (Node runtime) and local `next dev` terminal
    // eslint-disable-next-line no-console
    console.info("[push/send-test]", {
      userId,
      activeDeviceTargets,
      sent: result.sent,
      webpush: { sent: result.perChannel.webpush.sent, failures: result.failures.webpush.length },
      expo: { sent: result.perChannel.expo.sent, failures: result.failures.expo.length },
    })
    return NextResponse.json({ ok: true, userId, activeDeviceTargets, ...result })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[push/send-test] error", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

