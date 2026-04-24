import type { SurfAgentStateType, AgentDecision, ForecastWindow } from "../state"
import { agentConfig } from "../config"
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import { SURF_INTERPRETATION_GUIDE } from "@/lib/agent/surfInterpretationGuide"
import {
  UNSET_MAX_DISTANCE_KM,
  UNSET_MAX_WAVE_HEIGHT_M,
  isActiveUserMax,
} from "@/lib/shared/preferenceBounds"
import {
  applyForecastPlannerNoNowOverride,
  isForecastBlockSessionNow,
} from "../utils/forecastNoNowSession"
import { isPlausibleNowForForecast } from "../utils/plausibleNowSession"
import type { SpotConditions } from "@/lib/shared/types"

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 3) + "..."
}

function hoursSince(tsIso: string, now: Date): number | null {
  const t = Date.parse(tsIso)
  if (Number.isNaN(t)) return null
  return (now.getTime() - t) / (60 * 60 * 1000)
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/** use ireland local time for push windows */
const PUSH_WINDOW_TZ = "Europe/Dublin"

function formatWindowRangeDisplay(start: Date, end: Date): string {
  const sDay = start.toLocaleDateString("en-IE", { timeZone: PUSH_WINDOW_TZ, day: "numeric", month: "short" })
  const eDay = end.toLocaleDateString("en-IE", { timeZone: PUSH_WINDOW_TZ, day: "numeric", month: "short" })
  const sameDay = sDay === eDay
  const startStr = start.toLocaleString("en-IE", {
    timeZone: PUSH_WINDOW_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const endOpts: Intl.DateTimeFormatOptions = {
    timeZone: PUSH_WINDOW_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }
  if (!sameDay) {
    endOpts.weekday = "short"
    endOpts.day = "numeric"
    endOpts.month = "short"
  }
  const endStr = end.toLocaleString("en-IE", endOpts)
  return `${startStr} – ${endStr}`
}

function formatRelativeLead(hoursUntilStart: number | undefined): string {
  if (hoursUntilStart == null || !Number.isFinite(hoursUntilStart)) return "upcoming"
  if (hoursUntilStart < 1) return "starting soon"
  if (hoursUntilStart < 18) return `in ~${Math.max(1, Math.round(hoursUntilStart))} h`
  if (hoursUntilStart < 40) return "tomorrow"
  if (hoursUntilStart < 72) return "in a day or two"
  return `in ~${Math.round(hoursUntilStart / 24)} days`
}

function toKnots(kmh: number): number {
  return kmh / 1.852
}

function toMph(kmh: number): number {
  return kmh * 0.621371
}

function toMs(kmh: number): number {
  return kmh / 3.6
}

function toFeet(meters: number): number {
  return meters * 3.28084
}

function normalizeWindUnit(raw: string | undefined): "kmh" | "kn" | "mph" | "ms" {
  const v = String(raw ?? "").toLowerCase().trim()
  if (v.includes("knot") || v === "kn" || v === "kts") return "kn"
  if (v.includes("mph")) return "mph"
  if (v === "ms" || v.includes("m/s")) return "ms"
  return "kmh"
}

function formatWindSpeed(kmh: number | undefined, unitRaw: string | undefined): string {
  if (kmh == null || !Number.isFinite(kmh)) return "n/a"
  const unit = normalizeWindUnit(unitRaw)
  if (unit === "kn") return `${Math.round(toKnots(kmh))} kn`
  if (unit === "mph") return `${Math.round(toMph(kmh))} mph`
  if (unit === "ms") return `${toMs(kmh).toFixed(1)} m/s`
  return `${Math.round(kmh)} km/h`
}

function formatWaveHeight(meters: number | undefined, unitRaw: string | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "n/a"
  const unit = String(unitRaw ?? "").toLowerCase().trim()
  if (unit.includes("ft")) return `${toFeet(meters).toFixed(1)} ft`
  return `${meters.toFixed(1)} m`
}

function getSpotName(state: SurfAgentStateType, spotId: string, fallback?: string): string {
  const fromCandidate = state.topCandidates
    ?.find((c) => c.spotId === spotId)
    ?.summary?.split(",")[0]
    ?.replace(/^Spot:\s*/i, "")
    ?.trim()
  return fromCandidate || fallback || "this break"
}

function buildWindowTechLine(state: SurfAgentStateType, chosen: ForecastWindow): string {
  const units = state.user?.rawUser?.units
  return [
    `waves ${formatWaveHeight(chosen.waveHeight, units?.waveHeight)}`,
    `swell ${formatWaveHeight(chosen.swellHeight, units?.waveHeight)} @ ${chosen.swellPeriod?.toFixed(1) ?? "n/a"}s`,
    `wind ${formatWindSpeed(chosen.windSpeed10m, units?.windSpeed)}`,
  ].join(" · ")
}

function buildNowTechLine(state: SurfAgentStateType, spotId: string): string {
  const units = state.user?.rawUser?.units
  const row = state.hourliesBySpot?.[spotId] as SpotConditions | undefined | null
  return [
    `waves ${formatWaveHeight(row?.waveHeight, units?.waveHeight)}`,
    `swell ${formatWaveHeight(row?.swellHeight, units?.waveHeight)} @ ${row?.swellPeriod?.toFixed(1) ?? "n/a"}s`,
    `wind ${formatWindSpeed(row?.windSpeed10m ?? row?.windSpeed, units?.windSpeed)}`,
  ].join(" · ")
}

function buildSnappedWindowPushCopy(
  state: SurfAgentStateType,
  chosen: ForecastWindow,
): { title: string; message: string } {
  const name = chosen.spotName?.trim() || "this break"
  const timeRange = formatWindowRangeDisplay(chosen.start, chosen.end)
  const lead = formatRelativeLead(chosen.hoursUntilStart)
  const skill = state.user?.skillLevel ?? "surfer"
  const travel = chosen.distanceKm != null ? `, about ${Math.round(chosen.distanceKm)} km away` : ""
  const why = `good match for your ${skill} profile (${lead}${travel})`
  const details = buildWindowTechLine(state, chosen)
  const title = `Surf ${name} - ${timeRange}`
  return { title, message: truncate(`${why}\n${details}`, 220) }
}

function buildNowPushCopy(state: SurfAgentStateType, spotId: string): { title: string; message: string } {
  const skill = state.user?.skillLevel ?? "surfer"
  const top = state.topCandidates?.find((c) => c.spotId === spotId)
  const spotName = getSpotName(state, spotId)
  const travel = top?.distanceKm != null ? `, about ${Math.round(top.distanceKm)} km away` : ""
  const why = `good match for your ${skill} profile right now${travel}`
  const details = buildNowTechLine(state, spotId)
  return {
    title: `Surf ${spotName} - now`,
    message: truncate(`${why}\n${details}`, 220),
  }
}

function computeReasoningNeed(state: SurfAgentStateType, args: {
  hasWindows: boolean
  memoryConflict: boolean
  top1?: { distanceKm?: number }
}): number {
  const raw = state.user?.rawUser
  const prefs = raw?.preferences
  const strictness = prefs?.notifyStrictness === "strict" ? 1 : 0
  const risk =
    prefs?.riskTolerance === "low" ? 1 : prefs?.riskTolerance === "medium" ? 0.5 : 0
  const maxWaveM = isActiveUserMax(prefs?.maxWaveHeightFt)
    ? prefs!.maxWaveHeightFt! * 0.3048
    : UNSET_MAX_WAVE_HEIGHT_M
  // smaller cap → more nuance; bigger cap → low nuance
  const comfort = clamp01((3 - maxWaveM) / 2)
  const rawMaxDist = state.user?.rawUser?.preferences?.maxDistanceKm
  const maxDist = isActiveUserMax(rawMaxDist) ? rawMaxDist : UNSET_MAX_DISTANCE_KM
  const distancePref = clamp01(maxDist / 80)
  const memory = args.memoryConflict ? 1 : 0
  const windows = args.hasWindows ? 1 : 0
  const r =
    0.25 * strictness +
    0.2 * risk +
    0.2 * comfort +
    0.15 * distancePref +
    0.1 * memory +
    0.1 * windows
  return clamp01(r)
}

const DecisionSchema = z.object({
  notify: z.boolean(),
  spotId: z.string().nullable(),
  when: z.enum(["now", "window"]).nullable(),
  windowStart: z.string().nullable(),
  windowEnd: z.string().nullable(),
  title: z.string().nullable(),
  message: z.string().nullable(),
  rationale: z.string().nullable(),
  whyNotOthers: z.array(z.string()).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
})

const TinyGateSchema = z.object({
  action: z.enum(["stop", "decide_now", "use_full"]),
  spotId: z.string().nullable(),
  rationale: z.string().nullable(),
})

export async function llmDecisionAndExplanation(
  state: SurfAgentStateType
): Promise<Partial<SurfAgentStateType>> {
  const candidates = state.topCandidates ?? []
  const user = state.user
  const mode = state.mode
  const skill = user?.skillLevel ?? "beginner"
  const validSpotIds = candidates.map((c) => c.spotId)
  const windows = state.forecastWindows ?? []
  const minToCallLlm = agentConfig.decisionGate.minScoreToCallLlm
  const rawPrefs = state.user?.rawUser?.preferences
  const userNote =
    typeof rawPrefs?.freeText === "string" && rawPrefs.freeText.trim().length > 0
      ? rawPrefs.freeText.trim()
      : null
  const userNoteLine = userNote ? `\nUser note: ${truncate(userNote, 240)}` : ""
  const retryFeedback = state.review?.issues?.length
    ? `\n\nPrevious attempt was rejected. Issues: ${state.review.issues.join("; ")}. You MUST use spotId from the valid list below (exact string, e.g. a 24-char hex ID), NOT the spot name. Fix and return a new decision.`
    : ""

  // call llm only when at least one option passes threshold
  const maxSuitability = candidates.reduce(
    (m, c) => (c.userSuitability > m ? c.userSuitability : m),
    0
  )
  const hasGoodWindow = windows.some((w) => w.userSuitability >= minToCallLlm)
  if (maxSuitability < minToCallLlm && !hasGoodWindow) {
    const decision: AgentDecision = {
      notify: false,
      message: "No suitable surf windows found.",
      rationale: "All spots scored below internal thresholds for this user.",
    }
    return { decision }
  }

  const now = new Date()
  const timeContext = now.toISOString()

  // obvious-winner shortcut to skip llm
  // only for now decisions
  const sorted = [...candidates].sort((a, b) => b.userSuitability - a.userSuitability)
  const top1 = sorted[0]
  const top2 = sorted[1]
  const lead = top1 && top2 ? top1.userSuitability - top2.userSuitability : Infinity
  const recentlyNotifiedSpotIds = new Set(
    (state.lastNotifications ?? [])
      .filter((n) => {
        const h = hoursSince(n.timestamp, now)
        return h != null && h >= 0 && h <= agentConfig.reasoning.recentNotificationHours
      })
      .map((n) => n.spotId)
  )
  const memoryConflict = top1?.spotId ? recentlyNotifiedSpotIds.has(top1.spotId) : false
  const hasAnyGoodWindow = windows.some((w) => w.userSuitability >= agentConfig.reasoning.strongCandidateMinSuitability)

  const reasoningNeed = computeReasoningNeed(state, {
    hasWindows: mode === "FORECAST_PLANNER" && windows.length > 0,
    memoryConflict,
    top1,
  })

  const blockNowForForecast = isForecastBlockSessionNow(state, now).block

  if (
    top1 &&
    !hasAnyGoodWindow &&
    !memoryConflict &&
    top1.userSuitability >= agentConfig.reasoning.strongCandidateMinSuitability &&
    lead >= agentConfig.reasoning.strongCandidateMinLead &&
    reasoningNeed < agentConfig.reasoning.budget.low &&
    !(mode === "FORECAST_PLANNER" && blockNowForForecast) &&
    (mode !== "FORECAST_PLANNER" || isPlausibleNowForForecast(state, top1.spotId))
  ) {
    const nameMatch = candidates.find((c) => c.spotId === top1.spotId)?.summary
    const spotLabel = nameMatch ? nameMatch.split(",")[0]?.replace(/^Spot:\s*/i, "")?.trim() : undefined
    const decision: AgentDecision = {
      notify: true,
      spotId: top1.spotId,
      when: "now",
      title: spotLabel ? `Surf looks best at ${spotLabel}` : "Surf looks best right now",
      message: spotLabel
        ? `If you want a session today, ${spotLabel} is the best option right now based on your preferences.`
        : "One spot stands out as the best option right now based on your preferences.",
      rationale: `We scored spots from live conditions (waves + wind) and your settings. This spot was clearly the best match and ahead of the alternatives, so it’s worth a notification now.`,
      confidence: 0.8,
    }
    return { decision: applyForecastPlannerNoNowOverride(state, decision, now) }
  }

  // only spend tokens when trade-offs exist
  const closeRace = top1 && top2 ? lead < agentConfig.reasoning.strongCandidateMinLead : false
  const tradeoffNeeded = closeRace || memoryConflict || (mode === "FORECAST_PLANNER" && windows.length > 0)

  // cheap tiny gate for medium reasoning need
  // jump to full prompt when reasoning need is high
  if (tradeoffNeeded && reasoningNeed < agentConfig.reasoning.budget.high) {
    const tinyLlm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 })
    const tiny = tinyLlm.withStructuredOutput(TinyGateSchema)

    const hasWindows = mode === "FORECAST_PLANNER" && windows.length > 0
    const windowRule = hasWindows
      ? `\nIMPORTANT: Forecast windows exist. Do NOT choose action="decide_now". Choose only action="stop" or action="use_full" so the full window-aware reasoning can decide timing.`
      : ""
    const tinyPrompt = `Decide whether we should notify a user about surf, without spending many tokens.\n\nCurrent time: ${timeContext}. Mode: ${mode}.\nUser preferences: riskTolerance=${rawPrefs?.riskTolerance ?? "unknown"}, notifyStrictness=${rawPrefs?.notifyStrictness ?? "unknown"}, maxWaveHeightFt=${rawPrefs?.maxWaveHeightFt ?? "unknown"}, maxDistanceKm=${state.user?.maxDistanceKm ?? "unknown"}.${userNoteLine}\n\nDeterministic scoring summary:\n- top1 suitability: ${top1?.userSuitability ?? 0}\n- top2 suitability: ${top2?.userSuitability ?? 0}\n- lead (top1-top2): ${Number.isFinite(lead) ? lead.toFixed(1) : "n/a"}\n- has forecast windows: ${windows.length > 0}\n- recently notified top1 spot: ${memoryConflict}\n\nValid spotIds: ${validSpotIds.join(", ")}\n\nReturn:\n- action="stop" if we should not notify.\n- action="decide_now" if notifying now is straightforward; include spotId.\n- action="use_full" if we need the full candidate/window context to choose well.${windowRule}\n\nKeep rationale short and non-technical.`

    const gate = await tiny.invoke(tinyPrompt)
    if (gate.action === "stop") {
      const decision: AgentDecision = {
        notify: false,
        message: "No surf notification sent.",
        rationale: gate.rationale ?? "Not worth notifying based on the available signals.",
      }
      return { decision }
    }
    if (
      gate.action === "decide_now" &&
      !(mode === "FORECAST_PLANNER" && windows.length > 0) &&
      !(mode === "FORECAST_PLANNER" && blockNowForForecast) &&
      gate.spotId &&
      validSpotIds.includes(gate.spotId) &&
      (mode !== "FORECAST_PLANNER" || isPlausibleNowForForecast(state, gate.spotId))
    ) {
      const chosen = candidates.find((c) => c.spotId === gate.spotId)
      const spotLabel = chosen?.summary
        ? chosen.summary.split(",")[0]?.replace(/^Spot:\s*/i, "")?.trim()
        : undefined
      const distText =
        chosen?.distanceKm != null ? ` about ${Math.round(chosen.distanceKm)}km away` : ""
      const decision: AgentDecision = {
        notify: true,
        spotId: gate.spotId,
        when: "now",
        title: spotLabel ? `Surf looks best at ${spotLabel}` : "Surf looks best right now",
        message: spotLabel
          ? `${spotLabel} looks like the best call right now${distText}.`
          : `One spot stands out as the best call right now.`,
        rationale:
          gate.rationale ??
          `Based on the current conditions and your preferences, this is the strongest option right now.`,
        confidence: 0.7,
      }
      return { decision: applyForecastPlannerNoNowOverride(state, decision, now) }
    }
    // else: fall through to full prompt
  }

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 })
  const structured = llm.withStructuredOutput(DecisionSchema)

  const maxChars = agentConfig.prompt.summaryMaxChars
  const windowSpotIds = [...new Set(windows.map((w) => w.spotId))]
  const windowsSection =
    mode === "FORECAST_PLANNER" && windows.length
      ? `

Upcoming windows (each line includes distance, time-of-day, lead time; optional "forecast confidence" < 1 means further out and less certain—prefer these over "now" when they are the better, realistic plan):
${windows.map((w) => `- ${truncate(w.summary, maxChars)}`).join("\n")}

SpotIds that have at least one upcoming window in the data above (use ONLY these for when="window"):
${windowSpotIds.join(", ")}`
      : ""

  const lastNotifs = state.lastNotifications ?? []
  const lastNotifsText =
    lastNotifs.length > 0
      ? `\nRecent notifications sent to this user: ${lastNotifs.map((n) => `${n.spotId} (${n.timestamp})`).join("; ")}. Prefer not to re-notify the same spot soon unless conditions are clearly better.`
      : ""

  const prompt = `You are a surf notification agent. Decide whether to notify the user about surf conditions.

${SURF_INTERPRETATION_GUIDE}

User skill: ${skill}. Mode: ${mode}. Current time: ${timeContext}.${lastNotifsText}${userNoteLine}

The candidate and window scores below were computed deterministically from surf conditions (wave height, period, wind, etc.).

Valid spotIds (you MUST set spotId to one of these exact strings when notifying; do NOT use the spot name):
${validSpotIds.join(", ")}

Top candidates (use only this data; do not invent):
${candidates.map((c) => `- ${truncate(c.summary, maxChars)}`).join("\n")}

${windowsSection}

Notification timing: consider distance, lead time, and time of day when choosing a window—prefer options that give the user enough time to get there and that fit typical schedules.

FORECAST_PLANNER — local time and "now":
- If any candidate line says the time of day is "night" (roughly 21:00–05:00 local at the break) or "evening" in a way that is too late for a spontaneous session, you MUST NOT set when="now". Pick the best future window from the list (when="window") or set notify=false. Never ask the user to go surfing immediately in the last hours of the day; suggest a morning or daytime window the next day instead.
- When in doubt in FORECAST mode after dark, prefer a window starting tomorrow morning or midday over "now".

Decision rules (FORECAST_PLANNER — realism first):
- Prefer notify=true with when="window" and spotId from the "SpotIds that have at least one upcoming window" list, using the best-matching future window. That is the default, trustworthy recommendation.
- Only use when="now" for a top candidate that is a short drive away and the time of day still allows a same-day session (morning through afternoon); do not use "now" for evening or night, or for far-away spots—use a future window or notify=false.
- If when="window", spotId MUST be one of the window spotIds listed above (not only the generic valid list). windowStart/windowEnd should match an interval you infer from the window lines.
- For FORECAST_PLANNER, only set when="now" if local time of day is plausibly still surfable the same day (e.g. morning/afternoon) and a same-day session is realistic; if summaries say "night", use a window, not "now".
- Otherwise, if current conditions are good enough and a spontaneous session is still realistic, set notify=true, when="now", and spotId to the best current candidate.
- If nothing is worth notifying, set notify=false, set spotId to null, and explain in rationale; set whyNotOthers as short bullets.
- In rationale: when you chose one time over another (e.g. "now" vs a future window, or one window over others), briefly explain why (e.g. "Afternoon window has better conditions and enough lead time; 6am window is too far and too early."). Use whyNotOthers for short bullets on why you did not pick other options.
- When notify=true: you MUST provide a short non-empty title and a clear non-empty message.
  - The title and message MUST refer to the SAME break as spotId (find the name in Top candidates for that id). Do not mix up two different breaks.
  - The message MUST mention the spot name (from the summaries) and whether it's for now vs a future window.
  - The message MUST be user-facing and simple: 1–2 short sentences.
  - The message SHOULD include timing (preferred): a time-of-day label from the summaries, a specific window time (e.g. "16:00–18:00"), or relative timing (e.g. "in ~3h"), especially for when="window".
  - Do NOT include any explicit ratings or scoring like "10/10" or "8 out of 10", and do NOT use internal terms like "score", "rating", "confidence", "suitability", "envScore", or "userSuitability".
  - Avoid generic hype like "perfect weather" unless explicitly supported by the inputs (we do not have weather data).
  - Put detailed justification (why this spot vs others, waves/wind trade-offs, guardrails) in rationale. It's OK if the message mentions just one or two concrete user-facing detail (like timing).

Return only structured fields. For dates, use ISO strings for windowStart/windowEnd.${retryFeedback}`

  const raw = await structured.invoke(prompt)
  const decision: AgentDecision = {
    notify: raw.notify,
    spotId: raw.spotId ?? undefined,
    when: raw.when === "window" ? "next_window" : (raw.when ?? "now"),
    windowStart: raw.windowStart ? new Date(raw.windowStart) : undefined,
    windowEnd: raw.windowEnd ? new Date(raw.windowEnd) : undefined,
    title: raw.title ?? undefined,
    message: raw.message ?? undefined,
    rationale: raw.rationale ?? undefined,
    whyNotOthers: raw.whyNotOthers ?? undefined,
    confidence: raw.confidence ?? undefined,
  }

  // snap chosen window to a real computed row
  // avoids invented times
  if (decision.notify && decision.when === "next_window") {
    const windowsForSpot = (state.forecastWindows ?? []).filter((w) => w.spotId === decision.spotId)
    if (windowsForSpot.length === 0) {
      decision.notify = false
      decision.spotId = undefined
      decision.when = undefined
      decision.windowStart = undefined
      decision.windowEnd = undefined
      decision.title = undefined
      decision.message =
        "We could not match that choice to a forecast window in our data, so no notification is sent."
      decision.rationale =
        "The model picked a window timing that is not in the computed forecast list for that spot, or the spot has no window rows. Prefer when=window only for spotIds listed under upcoming windows."
      decision.whyNotOthers = undefined
    } else {
      const exact =
        decision.windowStart &&
        windowsForSpot.find((w) => w.start.getTime() === decision.windowStart!.getTime())
      const chosen = exact ?? windowsForSpot.sort((a, b) => b.userSuitability - a.userSuitability)[0]
      decision.windowStart = chosen.start
      decision.windowEnd = chosen.end
      // rebuild push copy after snapping
      const copy = buildSnappedWindowPushCopy(state, chosen)
      decision.title = copy.title
      decision.message = copy.message
    }
  }

  // clear notify fields when notify is false
  if (!decision.notify) {
    decision.spotId = undefined
    decision.when = undefined
    decision.windowStart = undefined
    decision.windowEnd = undefined
    decision.title = undefined
    // keep message: notify=false paths often set a short user-facing explanation
  }

  // fill missing title or message from deterministic data
  const titleBlank = !decision.title || decision.title.trim().length === 0
  const messageBlank = !decision.message || decision.message.trim().length === 0
  if (decision.notify && decision.spotId && (titleBlank || messageBlank)) {
    const chosen = candidates.find((c) => c.spotId === decision.spotId)
    const spotLabel = chosen?.summary
      ? chosen.summary.split(",")[0]?.replace(/^Spot:\s*/i, "")?.trim()
      : undefined
    const distText = chosen?.distanceKm != null ? ` (~${Math.round(chosen.distanceKm)}km away)` : ""
    if (titleBlank) {
      decision.title = spotLabel ? `Surf looks best at ${spotLabel}` : "Surf looks best"
    }
    if (messageBlank) {
      if (decision.when === "next_window" && decision.windowStart) {
        decision.message = spotLabel
          ? `A good window is coming up at ${spotLabel}${distText}.`
          : "A better surf window is coming up soon."
      } else {
        decision.message = spotLabel
          ? `${spotLabel} looks like the best call right now${distText}.`
          : `One spot stands out as the best call right now.`
      }
    }
  }

  const afterNoNow = applyForecastPlannerNoNowOverride(state, decision, now)
  if (afterNoNow.notify && afterNoNow.spotId) {
    if (afterNoNow.when === "next_window" && afterNoNow.windowStart) {
      const chosen = (state.forecastWindows ?? []).find(
        (w) =>
          w.spotId === afterNoNow.spotId &&
          w.start.getTime() === afterNoNow.windowStart!.getTime(),
      )
      if (chosen) {
        const copy = buildSnappedWindowPushCopy(state, chosen)
        afterNoNow.title = copy.title
        afterNoNow.message = copy.message
      }
    } else {
      const copy = buildNowPushCopy(state, afterNoNow.spotId)
      afterNoNow.title = copy.title
      afterNoNow.message = copy.message
    }
  }
  return { decision: afterNoNow }
}
