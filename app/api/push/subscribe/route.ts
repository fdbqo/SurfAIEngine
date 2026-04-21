import { NextResponse } from "next/server"
import { disableDeviceTarget, registerDeviceTarget } from "@/lib/notifications/notifications"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const action = (body as { action?: unknown }).action
  const subscription = (body as { subscription?: unknown }).subscription

  if (action !== "subscribe" && action !== "unsubscribe") {
    return NextResponse.json({ error: "action must be 'subscribe' or 'unsubscribe'" }, { status: 400 })
  }
  if (!subscription || typeof subscription !== "object") {
    return NextResponse.json({ error: "subscription must be an object" }, { status: 400 })
  }

  try {
    const userId = (body as { userId?: unknown }).userId
    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }
    if (action === "subscribe") {
      await registerDeviceTarget({ userId, channel: "webpush", platform: "web", subscription: subscription as PushSubscriptionJSON })
    } else {
      const endpoint = (subscription as PushSubscriptionJSON).endpoint
      await disableDeviceTarget({ channel: "webpush", endpoint })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

