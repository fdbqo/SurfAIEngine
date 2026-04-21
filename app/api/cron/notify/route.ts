import { NextResponse } from "next/server"
import { cronTickNotify } from "@/lib/notifications/notifications"

export const runtime = "nodejs"

function cronSecretOk(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return true
  const url = new URL(req.url)
  if (url.searchParams.get("secret") === expected) return true
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ") && auth.slice(7).trim() === expected) return true
  return false
}

export async function GET(req: Request) {
  if (!cronSecretOk(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const url = new URL(req.url)
  const mode = (url.searchParams.get("mode") as "LIVE_NOTIFY" | "FORECAST_PLANNER" | null) ?? "FORECAST_PLANNER"
  const out = await cronTickNotify(mode)
  return NextResponse.json(out)
}

