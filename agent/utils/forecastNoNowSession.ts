import type { SurfAgentStateType, AgentDecision, ForecastWindow } from "../state"
import { agentConfig } from "../config"
import { getTimeOfDayLabel, type TimeOfDayLabel, formatTimeOfDayForPrompt } from "./notificationContext"
import type { SpotConditions } from "@/lib/shared/types"

/** Prefer local hour from any loaded hourly (spot-local clock). */
export function getLocalHourFromState(state: SurfAgentStateType): number | null {
  const hourlies = state.hourliesBySpot ?? {}
  for (const c of Object.values(hourlies)) {
    if (c == null) continue
    const row = c as SpotConditions & { localHour?: number }
    if (typeof row.localHour === "number" && row.localHour >= 0 && row.localHour < 24) {
      return row.localHour
    }
  }
  return null
}

function labelFromTopCandidate(state: SurfAgentStateType): string | null {
  const t = state.topCandidates?.[0]?.timeOfDayLabel
  return t ?? null
}

/**
 * In FORECAST_PLANNER, "now" is a poor recommendation when it is already late (night)
 * or evening — user should get a future window, not a same-minute session.
 */
export function isForecastBlockSessionNow(
  state: SurfAgentStateType,
  _now: Date
): { block: false } | { block: true; reason: "night" | "evening" } {
  if (state.mode !== "FORECAST_PLANNER") return { block: false }

  const h = getLocalHourFromState(state)
  if (h != null) {
    const label = getTimeOfDayLabel(h)
    if (label === "night") return { block: true, reason: "night" }
    if (agentConfig.forecastNoNow.alsoBlockEvening && label === "evening") {
      return { block: true, reason: "evening" }
    }
    return { block: false }
  }

  const fallback = labelFromTopCandidate(state)
  if (fallback === "night") return { block: true, reason: "night" }
  if (agentConfig.forecastNoNow.alsoBlockEvening && fallback === "evening") {
    return { block: true, reason: "evening" }
  }
  return { block: false }
}

/**
 * Best future window for a forecast notification when "now" is blocked.
 * Prefers the LLM's chosen spot if it has a strong upcoming window, else best overall.
 */
export function pickBestFutureWindowForOverride(
  state: SurfAgentStateType,
  preferSpotId: string | undefined,
  now: Date
): ForecastWindow | null {
  const windows = state.forecastWindows ?? []
  const minH = 1 / 60
  const future = windows.filter((w) => {
    if (w.hoursUntilStart != null) return w.hoursUntilStart > minH
    return w.start.getTime() > now.getTime() + 5 * 60 * 1000
  })
  if (future.length === 0) return null

  const minSuit = agentConfig.decisionGate.minScoreToCallLlm
  const good = future.filter((w) => w.userSuitability >= minSuit)
  const pool = good.length > 0 ? good : future

  const byScore = (a: ForecastWindow, b: ForecastWindow) =>
    b.userSuitability * (b.forecastConfidence ?? 1) - a.userSuitability * (a.forecastConfidence ?? 1)

  if (preferSpotId) {
    const forSpot = pool.filter((w) => w.spotId === preferSpotId).sort(byScore)
    if (forSpot[0]) return forSpot[0]
  }
  return [...pool].sort(byScore)[0] ?? null
}

/**
 * Replace when=now with a future window, or turn off notify if none exists.
 */
export function applyForecastPlannerNoNowOverride(
  state: SurfAgentStateType,
  decision: AgentDecision,
  now: Date
): AgentDecision {
  if (state.mode !== "FORECAST_PLANNER" || !decision.notify) return decision

  const whenNow = !decision.when || decision.when === "now"
  if (!whenNow) return decision

  const block = isForecastBlockSessionNow(state, now)
  if (block.block === false) return decision

  const w = pickBestFutureWindowForOverride(state, decision.spotId, now)
  if (!w) {
    return {
      notify: false,
      spotId: undefined,
      when: undefined,
      windowStart: undefined,
      windowEnd: undefined,
      title: undefined,
      message: "No suitable upcoming window to suggest (local time is late).",
      rationale: `It is ${block.reason} locally. We avoid recommending an immediate session in forecast mode; there was no good future window in the forecast list.`,
      whyNotOthers: decision.whyNotOthers,
      confidence: 0.6,
    }
  }

  const tod = w.timeOfDayLabel ? formatTimeOfDayForPrompt(w.timeOfDayLabel as TimeOfDayLabel) : "an upcoming"
  const spotLabel = w.spotName
  return {
    ...decision,
    when: "next_window",
    spotId: w.spotId,
    windowStart: w.start,
    windowEnd: w.end,
    title: `Surf window: ${spotLabel}`,
    message: `Better timing than right now: ${spotLabel} looks good ${tod} (forecast). Plan a session for then rather than heading out in the last minute of the day.`,
    rationale: [
      decision.rationale ?? "",
      `Local time is ${block.reason}, so a same-moment "go now" alert was not used; we picked the strongest upcoming forecast window instead.`,
    ]
      .filter(Boolean)
      .join(" "),
    confidence: decision.confidence ?? 0.75,
  }
}
