import { NextResponse } from "next/server"
import { z } from "zod"
import { runSurfAgent } from "@/agent"
import type { AgentDecision, AgentReview, NotificationGuardResult } from "@/agent"
import type { ScoredSpot, CandidateSummary, RunLogEntry } from "@/agent/state"
import { sanitizeLastNotificationsInput } from "@/lib/shared/spotIdInput"

export const maxDuration = 60

const RunGraphBodySchema = z.object({
  userId: z.string().min(1).max(200).optional().default("test-user-1"),
  mode: z.enum(["LIVE_NOTIFY", "FORECAST_PLANNER"]).optional().default("FORECAST_PLANNER"),
  lastNotifications: z
    .array(z.object({ spotId: z.string(), timestamp: z.string() }))
    .optional()
    .default([])
    .transform(sanitizeLastNotificationsInput),
})

export type RunGraphResponse = {
  decision: AgentDecision | null | undefined
  guard: NotificationGuardResult | null | undefined
  review: AgentReview | null | undefined
  scored: ScoredSpot[] | undefined
  topCandidates: CandidateSummary[] | undefined
  trace: string[]
  runLog: RunLogEntry[]
  durationMs?: number
}

export type RunGraphErrorResponse = {
  error: string
  code: "VALIDATION_ERROR" | "GRAPH_ERROR"
}

function buildTrace(result: Awaited<ReturnType<typeof runSurfAgent>>): string[] {
  return [
    result.user && "loadUserContext",
    result.spotIds?.length && "selectSpots",
    result.hourliesBySpot && "fetchDataForSpots",
    result.interpretedBySpot && "interpretConditions",
    result.scored && "scoreSpots",
    result.topCandidates && "decideCandidateSet",
    result.decision && "llmDecisionAndExplanation",
    result.review && "selfReviewAndValidation",
    result.guard && "notificationGuard",
    "outputDecision",
  ].filter(Boolean) as string[]
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}))
    const parsed = RunGraphBodySchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid request body"
      return NextResponse.json(
        { error: msg, code: "VALIDATION_ERROR" } satisfies RunGraphErrorResponse,
        { status: 400 }
      )
    }
    const { userId, mode, lastNotifications } = parsed.data

    const start = Date.now()
    const result = await runSurfAgent({ userId, mode, lastNotifications })
    const durationMs = Date.now() - start

    const trace = buildTrace(result)
    const runLog: RunLogEntry[] =
      result.runLog && result.runLog.length > 0
        ? result.runLog
        : trace.map((summary, i) => ({
            step: i + 1,
            ts: new Date().toISOString(),
            summary,
            ...(i === trace.length - 1 && result.decision && { detail: { notify: result.decision.notify } }),
          }))

    console.info("run-graph", {
      userId,
      mode,
      stepCount: trace.length,
      durationMs,
      "decision.notify": result.decision?.notify,
      "guard.allowed": result.guard?.allowed,
    })

    const response: RunGraphResponse = {
      decision: result.decision,
      guard: result.guard,
      review: result.review,
      scored: result.scored,
      topCandidates: result.topCandidates,
      trace,
      runLog,
      durationMs,
    }
    return NextResponse.json(response)
  } catch (err) {
    console.error("Agent graph run error:", err)
    const message = err instanceof Error ? err.message : "Agent graph run failed"
    return NextResponse.json(
      { error: message, code: "GRAPH_ERROR" } satisfies RunGraphErrorResponse,
      { status: 500 }
    )
  }
}
