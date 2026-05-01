import type { SurfAgentStateType, AgentDecision, ForecastWindow } from "../state"
import { agentConfig } from "../config"
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import { SURF_INTERPRETATION_GUIDE } from "@/lib/agent/surfInterpretationGuide"
import {
  UNSET_MAX_DISTANCE_KM,
  UNSET_MAX_WAVE_HEIGHT_M,
  isActiveUserMax,
  isActiveUserMin,
} from "@/lib/shared/preferenceBounds"
import {
  applyForecastPlannerNoNowOverride,
  isForecastBlockSessionNow,
} from "../utils/forecastNoNowSession"
import { isPlausibleNowForForecast } from "../utils/plausibleNowSession"
import type { SpotConditions } from "@/lib/shared/types"
import { getSpotById, type Spot } from "@/lib/shared/spots"
import { formatTimeOfDayForPrompt, type TimeOfDayLabel } from "../utils/notificationContext"
import { resolvedMaxDistanceKm } from "../utils/preferenceRanking"
import { formatLlmPrefsSummary } from "../utils/preferencePrompt"
import { normaliseExternalSpotId } from "@/lib/shared/spotIdInput"
import { windSpeedKmhForSurf } from "@/lib/shared/scoring"

/** aligns with Expo/Web Push practical limits after sanitization (two lines) */
const PUSH_MESSAGE_BODY_MAX = 240

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 3) + "..."
}

/** Same rules as external APIs: trim + 24-char hex only (structured enum already constrains values). */
function normaliseLlmSpotId(spotId: string | null | undefined): string | undefined {
  return normaliseExternalSpotId(spotId)
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

/** Push footer copy: wordier lead ("in ~10 hours") for the third line */
function formatRelativeLeadFriendly(hoursUntilStart: number | undefined): string {
  if (hoursUntilStart == null || !Number.isFinite(hoursUntilStart)) return "soon"
  if (hoursUntilStart < 1) return "starting soon"
  if (hoursUntilStart < 48) {
    const h = Math.max(1, Math.round(hoursUntilStart))
    return `in ~${h} hour${h === 1 ? "" : "s"}`
  }
  if (hoursUntilStart < 72) return "tomorrow"
  const d = Math.max(2, Math.round(hoursUntilStart / 24))
  return `in ~${d} days`
}

function toKnots(kmh: number): number {
  return kmh / 1.852
}

function toFeet(meters: number): number {
  return meters * 3.28084
}

function getSpotName(state: SurfAgentStateType, spotId: string, fallback?: string): string {
  const fromCandidate = state.topCandidates
    ?.find((c) => c.spotId === spotId)
    ?.summary?.split(",")[0]
    ?.replace(/^Spot:\s*/i, "")
    ?.trim()
  return fromCandidate || fallback || "this break"
}

function windRelationWord(spot: Spot, windDirDeg: number): "offshore" | "onshore" | "cross" {
  const offshoreDir = (spot.orientation + 180) % 360
  let diff = Math.abs(offshoreDir - windDirDeg)
  if (diff > 180) diff = 360 - diff
  if (diff < 45) return "offshore"
  if (diff < 90) return "cross"
  return "onshore"
}

function windStrengthWord(kmh: number): "calm" | "light" | "moderate" | "strong" {
  if (kmh < 6) return "calm"
  if (kmh < 12) return "light"
  if (kmh < 25) return "moderate"
  return "strong"
}

function waveSizeWord(meters: number): "flat" | "small" | "medium" | "head-high" {
  if (meters < 0.35) return "flat"
  if (meters < 0.85) return "small"
  if (meters < 1.75) return "medium"
  return "head-high"
}

function waveCategoryTitle(meters: number): string {
  const w = waveSizeWord(meters)
  if (w === "head-high") return "Head-high"
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/** Line 1: wind / surface quality (no wave numbers). Pass surf-relevant wind km/h (2 m for live, 10 m for forecast windows). */
function buildPushWindConditionsLine(args: {
  spotId: string
  windSpeedKmh?: number
  windDirection?: number
}): string {
  const spot = getSpotById(args.spotId)
  const ws = args.windSpeedKmh
  const wd = args.windDirection
  if (!spot || ws == null || !Number.isFinite(ws) || wd == null || !Number.isFinite(wd)) {
    return "Forecast looks good for this window"
  }
  const rel = windRelationWord(spot, wd)
  const str = windStrengthWord(ws)
  if (str === "calm") return "Clean conditions with almost no wind"
  const adj = str === "light" ? "light" : str === "moderate" ? "moderate" : "strong"
  if (rel === "offshore") return `Clean conditions with ${adj} offshore wind`
  if (rel === "cross") return `Clean conditions with ${adj} cross-shore wind`
  return `${adj.charAt(0).toUpperCase() + adj.slice(1)} onshore wind — expect some bump on the face`
}

/** Line 2: human wave size + approximate range in user units */
function buildPushWaveSizeLine(waveHeightM: number | undefined, waveUnitRaw: string | undefined): string {
  if (waveHeightM == null || !Number.isFinite(waveHeightM)) return "Waves look workable"
  const cat = waveCategoryTitle(waveHeightM)
  const unit = String(waveUnitRaw ?? "").toLowerCase()
  if (unit.includes("ft")) {
    const ft = toFeet(waveHeightM)
    const low = Math.max(1, Math.round(ft - 0.75))
    const high = Math.max(low + 1, Math.round(ft + 0.75))
    return `${cat} waves (around ${low}\u2013${high} ft)`
  }
  const low = Math.max(0.3, Math.round((waveHeightM - 0.2) * 10) / 10)
  const high = Math.max(low + 0.2, Math.round((waveHeightM + 0.25) * 10) / 10)
  return `${cat} waves (around ${low}\u2013${high} m)`
}

/** Line 3: distance · relative timing */
function buildPushDistanceLeadFooter(distanceKm: number | undefined, hoursUntilStart: number | undefined): string {
  const distRound = distanceKm != null && Number.isFinite(distanceKm) ? Math.round(distanceKm) : null
  const dist = distRound != null ? `~${distRound} km away` : null
  const lead = formatRelativeLeadFriendly(hoursUntilStart)
  return [dist, lead].filter(Boolean).join(" · ")
}

function buildPushDistanceNowFooter(distanceKm: number | undefined): string {
  const distRound = distanceKm != null && Number.isFinite(distanceKm) ? Math.round(distanceKm) : null
  if (distRound != null) return `~${distRound} km away · now`
  return "Looks favourable · now"
}

function buildPushThreeLineBody(lines: [string, string, string]): string {
  const body = lines.map((l) => l.trim()).join("\n")
  return body.length <= PUSH_MESSAGE_BODY_MAX ? body : truncate(body, PUSH_MESSAGE_BODY_MAX)
}

/**
 * Short clauses comparing this window / moment to saved prefs (distance, wave min/max, wind,
 * swell period, break-type toggles, notify strictness, risk). No generic skill-only closer.
 */
function buildPreferenceAlignmentPhrase(
  state: SurfAgentStateType,
  ctx: {
    spotId: string
    distanceKm?: number
    waveHeightM?: number
    windKmh?: number
    swellPeriodS?: number
  },
): string {
  const userCtx = state.user
  const prefs = userCtx?.rawUser?.preferences
  if (!userCtx || !prefs) return "Lines up with your saved preferences."

  type Bit = { weight: number; text: string }
  const bits: Bit[] = []

  const maxDist = userCtx.maxDistanceKm
  if (isActiveUserMax(maxDist) && ctx.distanceKm != null && Number.isFinite(ctx.distanceKm) && maxDist! > 0) {
    const r = ctx.distanceKm / maxDist!
    const text =
      r <= 0.45
        ? "Much closer than your max drive distance."
        : r <= 0.85
          ? "Inside your saved drive-distance limit."
          : "Toward the upper end of your drive-distance limit."
    bits.push({ weight: 1, text })
  }

  const maxWaveFt = prefs.maxWaveHeightFt
  if (isActiveUserMax(maxWaveFt) && ctx.waveHeightM != null && Number.isFinite(ctx.waveHeightM)) {
    const maxM = maxWaveFt * 0.3048
    if (maxM > 0) {
      const r = ctx.waveHeightM / maxM
      const text =
        r <= 0.55
          ? "Waves sit well under your max height."
          : r <= 0.92
            ? "Waves stay inside your max height."
            : "Near your upper wave-height limit."
      bits.push({ weight: 2, text })
    }
  }

  const minWaveFt = prefs.minWaveHeightFt
  if (isActiveUserMin(minWaveFt) && ctx.waveHeightM != null && Number.isFinite(ctx.waveHeightM)) {
    const minM = minWaveFt * 0.3048
    if (ctx.waveHeightM >= minM) bits.push({ weight: 3, text: "Above the minimum size you set." })
  }

  const maxWindKn = prefs.maxWindSpeedKnots
  if (isActiveUserMax(maxWindKn) && ctx.windKmh != null && Number.isFinite(ctx.windKmh)) {
    const kn = toKnots(ctx.windKmh)
    const text =
      kn <= maxWindKn * 0.75
        ? "Wind stays under your speed cap."
        : kn <= maxWindKn
          ? "Wind still within your speed cap."
          : null
    if (text) bits.push({ weight: 4, text })
  }

  const minPeriod = prefs.minSwellPeriodSec
  if (
    isActiveUserMin(minPeriod) &&
    ctx.swellPeriodS != null &&
    Number.isFinite(ctx.swellPeriodS) &&
    ctx.swellPeriodS >= minPeriod!
  ) {
    bits.push({ weight: 5, text: "Swell period clears your minimum." })
  }

  const spot = getSpotById(ctx.spotId)
  if (spot) {
    if (prefs.reefAllowed === false && spot.type !== "reef") {
      bits.push({
        weight: 6,
        text:
          spot.type === "beach"
            ? "Beach break fits your no-reef setting."
            : "Non-reef spot fits your saved preference.",
      })
    }
    if (prefs.sandAllowed === false && spot.type !== "beach") {
      bits.push({ weight: 6, text: "Matches your preference away from sand beaches." })
    }
  }

  if (prefs.notifyStrictness === "strict") {
    bits.push({ weight: 7, text: "Clears the tighter bar you set for alerts." })
  }

  const risk = prefs.riskTolerance ?? userCtx.riskTolerance
  if (risk === "high" && ctx.waveHeightM != null && ctx.waveHeightM >= 1.15) {
    bits.push({ weight: 8, text: "Enough size for your higher risk tolerance." })
  } else if (risk === "low" && ctx.waveHeightM != null && ctx.waveHeightM <= 0.85) {
    bits.push({ weight: 8, text: "Keeps size mellow for your lower risk tolerance." })
  }

  if (bits.length === 0) return "Lines up with your saved preferences."

  bits.sort((a, b) => a.weight - b.weight)
  return bits.slice(0, 2).map((b) => b.text.replace(/\.$/, "")).join(" · ") + "."
}

function buildSnappedWindowPushCopy(
  state: SurfAgentStateType,
  chosen: ForecastWindow,
): { title: string; message: string } {
  const name = chosen.spotName?.trim() || "this break"
  const timeRange = formatWindowRangeDisplay(chosen.start, chosen.end)
  const units = state.user?.rawUser?.units
  const line1 = buildPushWindConditionsLine({
    spotId: chosen.spotId,
    windSpeedKmh: chosen.windSpeed10m,
    windDirection: chosen.windDirection,
  })
  const line2 = buildPushWaveSizeLine(chosen.waveHeight, units?.waveHeight)
  const line3 = buildPushDistanceLeadFooter(chosen.distanceKm, chosen.hoursUntilStart)
  const title = `Surf ${name} — ${timeRange}`
  const message = buildPushThreeLineBody([line1, line2, line3])
  return { title, message }
}

function buildNowPushCopy(state: SurfAgentStateType, spotId: string): { title: string; message: string } {
  const top = state.topCandidates?.find((c) => c.spotId === spotId)
  const spotName = getSpotName(state, spotId)
  const row = state.hourliesBySpot?.[spotId] as SpotConditions | undefined | null
  const units = state.user?.rawUser?.units
  const line1 = buildPushWindConditionsLine({
    spotId,
    windSpeedKmh: row ? windSpeedKmhForSurf(row) : undefined,
    windDirection: row?.windDirection,
  })
  const line2 = buildPushWaveSizeLine(row?.waveHeight, units?.waveHeight)
  const line3 = buildPushDistanceNowFooter(top?.distanceKm)
  return {
    title: `Surf ${spotName} — now`,
    message: buildPushThreeLineBody([line1, line2, line3]),
  }
}

function buildAlignedRationale(state: SurfAgentStateType, decision: AgentDecision): string | undefined {
  if (!decision.notify || !decision.spotId) return decision.rationale

  const prefs = state.user?.rawUser?.preferences
  const strictText = prefs?.notifyStrictness === "strict" ? " (strict alerts)" : ""
  const spotId = decision.spotId
  const spotName = getSpotName(state, spotId)

  if (decision.when === "next_window" && decision.windowStart) {
    const chosen = (state.forecastWindows ?? []).find(
      (w) => w.spotId === spotId && w.start.getTime() === decision.windowStart!.getTime(),
    )
    const lead = chosen?.hoursUntilStart != null ? formatRelativeLead(chosen.hoursUntilStart) : "upcoming"
    const tod =
      chosen?.timeOfDayLabel != null && String(chosen.timeOfDayLabel).length > 0
        ? formatTimeOfDayForPrompt(chosen.timeOfDayLabel as TimeOfDayLabel)
        : null
    const whenText = tod ? `${tod} window (${lead})` : `${lead} window`
    const prefPhrase = buildPreferenceAlignmentPhrase(state, {
      spotId,
      distanceKm: chosen?.distanceKm,
      waveHeightM: chosen?.waveHeight,
      windKmh: chosen?.windSpeed10m,
      swellPeriodS: chosen?.swellPeriod,
    })
    return `${spotName}: best ${whenText} based on your saved preferences${strictText}. ${prefPhrase}`
  }

  const scored = (state.scored ?? []).find((s) => s.spotId === spotId)
  const reasons = Array.isArray(scored?.reasons) ? scored!.reasons.slice(0, 2).join("; ") : null
  const row = state.hourliesBySpot?.[spotId] as SpotConditions | undefined | null
  const prefPhrase = buildPreferenceAlignmentPhrase(state, {
    spotId,
    distanceKm: scored?.distanceKm,
    waveHeightM: row?.waveHeight,
    windKmh: row ? windSpeedKmhForSurf(row) : undefined,
    swellPeriodS: row?.swellPeriod,
  })
  return `${spotName}: best match right now based on your saved preferences${strictText}. ${
    reasons ? `Why: ${reasons}. ` : ""
  }${prefPhrase}`
}

function computeReasoningNeed(state: SurfAgentStateType, args: {
  hasWindows: boolean
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
  const maxDist = resolvedMaxDistanceKm(state.user?.maxDistanceKm, prefs?.maxDistanceKm) ?? UNSET_MAX_DISTANCE_KM
  const distancePref = clamp01(maxDist / 80)
  const windows = args.hasWindows ? 1 : 0
  const r =
    0.25 * strictness +
    0.2 * risk +
    0.2 * comfort +
    0.15 * distancePref +
    0.2 * windows
  return clamp01(r)
}

/** Constrain spotId at parse time so the model cannot emit invented / corrupted hex strings. */
function spotIdSchemaForLlm(allowedSpotIds: readonly string[]) {
  const uniq = [
    ...new Set(allowedSpotIds.filter((id) => typeof id === "string" && id.trim().length > 0)),
  ]
  if (uniq.length === 0) return z.string().nullable()
  return z.enum(uniq as [string, ...string[]]).nullable()
}

function buildDecisionSchema(allowedSpotIds: readonly string[]) {
  return z.object({
    notify: z.boolean(),
    spotId: spotIdSchemaForLlm(allowedSpotIds),
    when: z.enum(["now", "window"]).nullable(),
    windowStart: z.string().nullable(),
    windowEnd: z.string().nullable(),
    title: z.string().nullable(),
    message: z.string().nullable(),
    rationale: z.string().nullable(),
    whyNotOthers: z.array(z.string()).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
  })
}

function buildTinyGateSchema(allowedSpotIds: readonly string[]) {
  return z.object({
    action: z.enum(["stop", "decide_now", "use_full"]),
    spotId: spotIdSchemaForLlm(allowedSpotIds),
    rationale: z.string().nullable(),
  })
}

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
  const hasAnyGoodWindow = windows.some((w) => w.userSuitability >= agentConfig.reasoning.strongCandidateMinSuitability)

  const reasoningNeed = computeReasoningNeed(state, {
    hasWindows: mode === "FORECAST_PLANNER" && windows.length > 0,
    top1,
  })

  const blockNowForForecast = isForecastBlockSessionNow(state, now).block

  if (
    top1 &&
    !hasAnyGoodWindow &&
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
  const tradeoffNeeded = closeRace || (mode === "FORECAST_PLANNER" && windows.length > 0)

  // cheap tiny gate for medium reasoning need
  // jump to full prompt when reasoning need is high
  if (tradeoffNeeded && reasoningNeed < agentConfig.reasoning.budget.high) {
    const tinyLlm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 })
    const tinyGateAllowlist = [...new Set(validSpotIds)]
    const tiny = tinyLlm.withStructuredOutput(buildTinyGateSchema(tinyGateAllowlist))

    const hasWindows = mode === "FORECAST_PLANNER" && windows.length > 0
    const windowRule = hasWindows
      ? `\nIMPORTANT: Forecast windows exist. Do NOT choose action="decide_now". Choose only action="stop" or action="use_full" so the full window-aware reasoning can decide timing.`
      : ""
    const tinyPrompt = `Decide whether we should notify a user about surf, without spending many tokens.\n\nCurrent time: ${timeContext}. Mode: ${mode}.\nUser preferences (saved): ${formatLlmPrefsSummary(state)}.${userNoteLine}\n\nDeterministic scoring summary:\n- top1 suitability: ${top1?.userSuitability ?? 0}\n- top2 suitability: ${top2?.userSuitability ?? 0}\n- lead (top1-top2): ${Number.isFinite(lead) ? lead.toFixed(1) : "n/a"}\n- has forecast windows: ${windows.length > 0}\n\nValid spotIds: ${validSpotIds.join(", ")}\n\nReturn:\n- action="stop" if we should not notify.\n- action="decide_now" if notifying now is straightforward; include spotId.\n- action="use_full" if we need the full candidate/window context to choose well.${windowRule}\n\nKeep rationale short and non-technical.`

    const gate = await tiny.invoke(tinyPrompt)
    if (gate.action === "stop") {
      const decision: AgentDecision = {
        notify: false,
        message: "No surf notification sent.",
        rationale: gate.rationale ?? "Not worth notifying based on the available signals.",
      }
      return { decision }
    }
    const gatedSpotId = normaliseLlmSpotId(gate.spotId)
    if (
      gate.action === "decide_now" &&
      !(mode === "FORECAST_PLANNER" && windows.length > 0) &&
      !(mode === "FORECAST_PLANNER" && blockNowForForecast) &&
      gatedSpotId &&
      validSpotIds.includes(gatedSpotId) &&
      (mode !== "FORECAST_PLANNER" || isPlausibleNowForForecast(state, gatedSpotId))
    ) {
      const chosen = candidates.find((c) => c.spotId === gatedSpotId)
      const spotLabel = chosen?.summary
        ? chosen.summary.split(",")[0]?.replace(/^Spot:\s*/i, "")?.trim()
        : undefined
      const distText =
        chosen?.distanceKm != null ? ` about ${Math.round(chosen.distanceKm)}km away` : ""
      const decision: AgentDecision = {
        notify: true,
        spotId: gatedSpotId,
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

  const maxChars = agentConfig.prompt.summaryMaxChars
  const windowsSorted =
    mode === "FORECAST_PLANNER" && windows.length > 0
      ? [...windows].sort((a, b) => b.userSuitability - a.userSuitability)
      : windows
  const windowSpotIds = [...new Set(windowsSorted.map((w) => w.spotId))]
  const structuredSpotAllowlist = [...new Set([...validSpotIds, ...windowSpotIds])]
  const structured = llm.withStructuredOutput(buildDecisionSchema(structuredSpotAllowlist))
  const windowsSection =
    mode === "FORECAST_PLANNER" && windowsSorted.length
      ? `

Upcoming windows (sorted best-first by deterministic quality for this user; each line includes distance, time-of-day, lead time; optional "forecast confidence" < 1 means further out and less certain):
${windowsSorted.map((w) => `- ${truncate(w.summary, maxChars)}`).join("\n")}

SpotIds that have at least one upcoming window in the data above (use ONLY these for when="window"):
${windowSpotIds.join(", ")}`
      : ""

  const lastNotifs = state.lastNotifications ?? []
  const lastNotifsText =
    lastNotifs.length > 0
      ? `\nRecent notifications (background only—the backend enforces frequency limits): ${lastNotifs.map((n) => `${n.spotId} (${n.timestamp})`).join("; ")}. Do NOT avoid a spot or window solely because it appears here. Choose the option that best matches surf conditions for this user's preferences (see window lines and candidate lines).`
      : ""

  const prompt = `You are a surf notification agent. Decide whether to notify the user about surf conditions.

${SURF_INTERPRETATION_GUIDE}

User skill: ${skill}. Mode: ${mode}. Current time: ${timeContext}.
User preferences (saved): ${formatLlmPrefsSummary(state)}.${lastNotifsText}${userNoteLine}

The candidate and window scores below were computed deterministically from surf conditions (wave height, period, wind, etc.).

${
  windowsSorted.length > 0
    ? `Window-eligible spotIds (when="window" ONLY — copy exactly from this list; each id has at least one row under Upcoming windows):
${windowSpotIds.join(", ")}

Live-candidate spotIds (when="now" ONLY — copy exactly from this list):
${validSpotIds.join(", ")}
`
    : `Valid spotIds (when notifying; copy exactly; do NOT use the spot name):
${validSpotIds.join(", ")}
`
}

Top candidates (use only this data; do not invent):
${candidates.map((c) => `- ${truncate(c.summary, maxChars)}`).join("\n")}

${windowsSection}

Notification timing: prioritize **better surf** (waves, wind, swell as reflected in each window line). **Tomorrow morning or midday with stronger conditions is preferable to a weaker window only because it is sooner.** Treat reasonable lead time as helpful for planning, not a reason to pick marginal surf.

FORECAST_PLANNER — local time and "now":
- If any candidate line says the time of day is "night" (roughly 21:00–05:00 local at the break) or "evening" in a way that is too late for a spontaneous session, you MUST NOT set when="now". Pick the best future window from the list (when="window") or set notify=false. Never ask the user to go surfing immediately in the last hours of the day; suggest a morning or daytime window the next day instead.
- When in doubt in FORECAST mode after dark, prefer a window starting tomorrow morning or midday over "now".

Decision rules (FORECAST_PLANNER — conditions first):
- Prefer notify=true with when="window" and spotId from the "SpotIds that have at least one upcoming window" list, choosing the **future window that best matches conditions for this user**. The window list is sorted with strongest matches first—start from the top when picking unless you set notify=false with a clear rationale.
- Only use when="now" for a top candidate that is a short drive away and the time of day still allows a same-day session (morning through afternoon); do not use "now" for evening or night, or for far-away spots—use a future window or notify=false.
- If when="window", spotId MUST be one of the window spotIds listed above (not only the generic valid list). windowStart/windowEnd should match an interval you infer from the window lines.
- For FORECAST_PLANNER, only set when="now" if local time of day is plausibly still surfable the same day (e.g. morning/afternoon) and a same-day session is realistic; if summaries say "night", use a window, not "now".
- Otherwise, if current conditions are good enough and a spontaneous session is still realistic, set notify=true, when="now", and spotId to the best current candidate.
- If nothing is worth notifying, set notify=false, set spotId to null, and explain in rationale; set whyNotOthers as short bullets.
- In rationale: when you chose one time over another (e.g. "now" vs a future window, or one window over others), briefly explain why in terms of surf quality and timing (e.g. "Tomorrow morning's window lines up better with swell and wind than this afternoon's weaker fetch."). Use whyNotOthers for short bullets on why you did not pick other options.
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
    spotId: normaliseLlmSpotId(raw.spotId),
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
    const allWindows = state.forecastWindows ?? []
    let windowsForSpot = allWindows.filter((w) => w.spotId === decision.spotId)

    // Model might pick a top candidate that has no surviving forecast rows (trimming/filters) or a padded/wrong id.
    // Recover: (1) best window among top candidates ∩ forecast list; (2) else best window globally (still deterministic).
    if (windowsForSpot.length === 0) {
      const candidateIds = new Set(candidates.map((c) => c.spotId))
      let recoverPool = allWindows.filter((w) => candidateIds.has(w.spotId))
      if (recoverPool.length === 0 && allWindows.length > 0) {
        recoverPool = [...allWindows]
      }
      if (recoverPool.length > 0) {
        const best = [...recoverPool].sort((a, b) => b.userSuitability - a.userSuitability)[0]
        decision.spotId = best.spotId
        windowsForSpot = allWindows.filter((w) => w.spotId === decision.spotId)
      }
    }

    if (windowsForSpot.length === 0) {
      decision.notify = false
      decision.spotId = undefined
      decision.when = undefined
      decision.windowStart = undefined
      decision.windowEnd = undefined
      decision.title = undefined
      decision.message =
        allWindows.length === 0
          ? "No forecast windows are available right now, so no notification is sent."
          : "We could not match that choice to a forecast window in our data, so no notification is sent."
      decision.rationale =
        allWindows.length === 0
          ? "The forecast window list was empty for this run—nothing to snap the recommendation to."
          : "No overlapping forecast rows could be resolved after validating spotId and recovery candidates."
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
      const rows = (state.forecastWindows ?? []).filter((w) => w.spotId === afterNoNow.spotId)
      let chosen =
        rows.find((w) => w.start.getTime() === afterNoNow.windowStart!.getTime()) ??
        rows.sort((a, b) => b.userSuitability - a.userSuitability)[0]
      if (!chosen && (state.forecastWindows ?? []).length > 0) {
        chosen = [...(state.forecastWindows ?? [])].sort((a, b) => b.userSuitability - a.userSuitability)[0]
        afterNoNow.spotId = chosen.spotId
      }
      if (chosen) {
        afterNoNow.windowStart = chosen.start
        afterNoNow.windowEnd = chosen.end
        const copy = buildSnappedWindowPushCopy(state, chosen)
        afterNoNow.title = copy.title
        afterNoNow.message = copy.message
      }
    } else {
      const copy = buildNowPushCopy(state, afterNoNow.spotId)
      afterNoNow.title = copy.title
      afterNoNow.message = copy.message
    }
    // Keep rationale aligned with the final snapped/overridden `spotId`.
    afterNoNow.rationale = buildAlignedRationale(state, afterNoNow)
  }
  return { decision: afterNoNow }
}
