import { NextResponse } from "next/server"
import { z } from "zod"
import { runAgentAndMaybeNotify } from "@/lib/notifications/notifications"
import { sanitizeLastNotificationsInput } from "@/lib/shared/spotIdInput"

export const runtime = "nodejs"

const BodySchema = z.object({
  userId: z.string().min(1).max(200).optional().default("test-user-1"),
  mode: z.enum(["LIVE_NOTIFY", "FORECAST_PLANNER"]).optional().default("FORECAST_PLANNER"),
  lastNotifications: z
    .array(z.object({ spotId: z.string(), timestamp: z.string() }))
    .optional()
    .default([])
    .transform(sanitizeLastNotificationsInput),
})

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name} env var`)
  return v
}

function truncate(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max - 1) + "…"
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid request body"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { userId, mode, lastNotifications } = parsed.data
    // lastNotifications passed from client is ignored in the orchestrator module (it uses DB history).
    // Keeping it in the schema for compatibility with existing UI.
    void lastNotifications
    const out = await runAgentAndMaybeNotify({ userId, mode })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

