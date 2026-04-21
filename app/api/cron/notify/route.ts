import { NextResponse } from "next/server"
import { cronTickNotify } from "@/lib/notifications/notifications"

export const runtime = "nodejs"

function cronSecretOk(req: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return true
  const url = new URL(req.url)
  if (url.searchParams.get("secret")?.trim() === expected) return true
  const auth = req.headers.get("authorization")
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim()
    if (token === expected) return true
  }
  return false
}

export async function GET(req: Request) {
  const started = Date.now()
  if (!cronSecretOk(req)) {
    console.warn("[cron/notify] unauthorized", { path: new URL(req.url).pathname })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const url = new URL(req.url)
  const mode = (url.searchParams.get("mode") as "LIVE_NOTIFY" | "FORECAST_PLANNER" | null) ?? "FORECAST_PLANNER"
  console.info("[cron/notify] start", { mode, at: new Date().toISOString() })
  try {
    const out = await cronTickNotify(mode)
    const durationMs = Date.now() - started
    console.info("[cron/notify] done", {
      mode,
      durationMs,
      processed: out.processed,
      mockProcessed: out.mockProcessed,
      userIds: out.userIds,
    })
    return NextResponse.json({ ...out, durationMs })
  } catch (err) {
    const durationMs = Date.now() - started
    console.error("[cron/notify] error", { mode, durationMs, err: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

