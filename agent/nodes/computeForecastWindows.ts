import type { SurfAgentStateType, ForecastWindow } from "../state"
import { agentConfig } from "../config"
import { getLocationForDistance } from "../state"
import { getForecast3hForSpot } from "@/lib/db/services/spotConditionsService"
import { getSpotsById } from "@/lib/shared/spots"
import { distanceKm } from "@/lib/shared/geo"
import { distanceScore } from "@/lib/shared/distanceScore"
import { scoreSpot, toScoringInput } from "@/lib/shared/scoring"
import {
  getTimeOfDayLabel,
  getHoursUntil,
  formatTimeOfDayForPrompt,
  getForecastRankingFactor,
} from "../utils/notificationContext"
import { FALLBACK_LOCATION } from "@/lib/shared/defaults"
import { preferenceFitBonus } from "../utils/preferenceRanking"

const { maxWindowsPerSpot, topSpots, wildcardMinScore, maxTotalWindows, daysAhead, fallbackDaysAhead } =
  agentConfig.forecastWindows
const { topN: topScoredToEnsure } = agentConfig.candidates
const { minScoreToCallLlm } = agentConfig.decisionGate

function roundScore1(n: number): number {
  return Math.round(n * 10) / 10
}

function shouldExcludeForecastWindowStart(
  localHour: number,
  timeOfDayLabel: ReturnType<typeof getTimeOfDayLabel>,
): boolean {
  const cfg = agentConfig.forecastWindows
  if (cfg.excludeNightWindowStarts && timeOfDayLabel === "night") return true
  if (cfg.excludeForecastWindowStartHourGte < 24 && localHour >= cfg.excludeForecastWindowStartHourGte) return true
  return false
}

function getForecastDistanceScore(baseDistanceScore: number, hoursUntilStart: number): number {
  const cfg = agentConfig.forecastWindows.distanceSoftening
  if (!Number.isFinite(hoursUntilStart) || hoursUntilStart <= cfg.startHours) return baseDistanceScore
  const span = Math.max(1, cfg.fullHours - cfg.startHours)
  const progress = Math.max(0, Math.min(1, (hoursUntilStart - cfg.startHours) / span))
  const blend = Math.max(0, Math.min(1, cfg.maxBlend)) * progress
  return baseDistanceScore + (1 - baseDistanceScore) * blend
}

// Build FORECAST_PLANNER windows: top-N per spot, plus strong wildcards, capped globally.
export async function computeForecastWindows(
  state: SurfAgentStateType
): Promise<Partial<SurfAgentStateType>> {
  if (state.mode !== "FORECAST_PLANNER") {
    return {}
  }

  const user = state.user?.rawUser
  const loc = getLocationForDistance(state.user) ?? FALLBACK_LOCATION
  const spotIds = state.spotIds ?? []
  if (!user || spotIds.length === 0) return {}

  const requiredUser = user
  const strictness = requiredUser.preferences?.notifyStrictness ?? "lenient"
  const now = new Date()

  async function buildWindowsForHorizon(horizonDays: number) {
    const windows: Array<ForecastWindow & { adjustedScore: number }> = []
    const forecastResults = await Promise.all(
      spotIds.map(async (spotId) => {
        const blocks = await getForecast3hForSpot(spotId, horizonDays)
        return { spotId, blocks }
      }),
    )

    const spotsById = getSpotsById(spotIds)
    for (const { spotId, blocks } of forecastResults) {
      const spot = spotsById.get(spotId)
      if (!spot) continue
      const distKm = Math.round(distanceKm(loc, { lat: spot.lat, lon: spot.lon }) * 10) / 10
      for (const b of blocks) {
        const windowLocalHour = b.localHour ?? b.windowStart.getUTCHours()
        const timeOfDayLabel = getTimeOfDayLabel(windowLocalHour)
        if (shouldExcludeForecastWindowStart(windowLocalHour, timeOfDayLabel)) {
          continue
        }
        const hoursUntilStart = getHoursUntil(b.windowStart, now)

        const pseudoConditions = {
          spotId,
          swellHeight: b.swellHeight,
          swellPeriod: b.swellPeriod,
          swellDirection: Number.isFinite(b.swellDirection) ? b.swellDirection : spot.orientation,
          waveHeight: b.waveHeight,
          wavePeriod: b.swellPeriod,
          windSpeed: b.windSpeed10m,
          windSpeed10m: b.windSpeed10m,
          windSpeed2m: b.windSpeed10m,
          windDirection: b.windDirection,
          localTime: b.windowStart.toISOString(),
          localHour: windowLocalHour,
        }
        const input = toScoringInput(pseudoConditions, spot, requiredUser)
        const scored = scoreSpot(input)
        const distSc = getForecastDistanceScore(distanceScore(distKm, strictness), hoursUntilStart)
        const envScore = Math.round(scored.score * 10) / 10
        const distanceWeighted = Math.round((scored.score / 10) * distSc * 100) / 100
        const rawUserSuitability10 = Math.min(10, Math.max(0, distanceWeighted * 10 + preferenceFitBonus(requiredUser.preferences, b.waveHeight)))
        const userSuitability = roundScore1(rawUserSuitability10)
        const rankingFactor = getForecastRankingFactor(hoursUntilStart, scored.score)
        const adjustedScore = roundScore1(userSuitability * rankingFactor)

        const timeDesc = `${formatTimeOfDayForPrompt(timeOfDayLabel)}, in ${hoursUntilStart < 0 ? "past" : `${Math.round(hoursUntilStart)}h`}`
        const distDesc = `${distKm}km away`
        const confidenceNote = rankingFactor < 1 ? ` (forecast confidence ${rankingFactor})` : ""
        const summary = `Spot: ${spot.name}, ${b.windowStart.toISOString()}–+3h (${timeDesc}, ${distDesc}), env ${envScore}/10, user ${userSuitability}/10${confidenceNote}`

        windows.push({
          spotId,
          spotName: spot.name,
          start: b.windowStart,
          end: new Date(b.windowStart.getTime() + 3 * 60 * 60 * 1000),
          envScore,
          userSuitability,
          summary,
          distanceKm: distKm,
          hoursUntilStart: Math.round(hoursUntilStart * 10) / 10,
          timeOfDayLabel,
          forecastConfidence: rankingFactor,
          waveHeight: b.waveHeight,
          swellHeight: b.swellHeight,
          swellPeriod: b.swellPeriod,
          windSpeed10m: b.windSpeed10m,
          windDirection: b.windDirection,
          adjustedScore,
        })
      }
    }
    return windows
  }

  let windows = await buildWindowsForHorizon(daysAhead)
  const haveViable = windows.some((w) => w.adjustedScore >= minScoreToCallLlm)
  const fallback = Math.max(daysAhead, Number.isFinite(fallbackDaysAhead) ? fallbackDaysAhead : 0)
  if (!haveViable && fallbackDaysAhead > 0 && fallback > daysAhead) {
    windows = await buildWindowsForHorizon(fallback)
  }

  const bySpot = new Map<string, typeof windows>()
  for (const w of windows) {
    const list = bySpot.get(w.spotId) ?? []
    list.push(w)
    bySpot.set(w.spotId, list)
  }

  for (const list of bySpot.values()) {
    list.sort((a, b) => b.adjustedScore - a.adjustedScore)
  }

  const spotIdsByBest = [...bySpot.keys()].sort((a, b) => {
    const bestA = Math.max(...(bySpot.get(a) ?? []).map((w) => w.adjustedScore))
    const bestB = Math.max(...(bySpot.get(b) ?? []).map((w) => w.adjustedScore))
    return bestB - bestA
  })
  const topSpotIds = spotIdsByBest.slice(0, topSpots)

  const main: typeof windows = []
  for (const spotId of topSpotIds) {
    const list = bySpot.get(spotId) ?? []
    main.push(...list.slice(0, maxWindowsPerSpot))
  }

  const wildcards: typeof windows = []
  for (const spotId of spotIdsByBest.slice(topSpots)) {
    const list = bySpot.get(spotId) ?? []
    const best = list[0]
    if (best && best.adjustedScore >= wildcardMinScore) {
      wildcards.push(best)
    }
  }

  const stripAdjusted = (row: (typeof windows)[number]) => {
    const { adjustedScore: _a, ...w } = row
    return w
  }

  let topWindows = [...main, ...wildcards].map(({ adjustedScore, ...w }) => w).slice(0, maxTotalWindows)

  // Ensure top live candidates also have at least one window row to avoid orphan picks.
  const seenSpot = new Set(topWindows.map((w) => w.spotId))
  const scoredSorted = [...(state.scored ?? [])].sort((a, b) => b.userSuitability - a.userSuitability)
  const ensured: ReturnType<typeof stripAdjusted>[] = []
  for (const s of scoredSorted.slice(0, topScoredToEnsure)) {
    if (seenSpot.has(s.spotId)) continue
    const list = bySpot.get(s.spotId)
    if (!list?.length) continue
    const w = stripAdjusted(list[0])
    ensured.push(w)
    seenSpot.add(s.spotId)
  }
  if (ensured.length > 0) {
    topWindows = [...ensured, ...topWindows].slice(0, maxTotalWindows + ensured.length)
  }

  return { forecastWindows: topWindows }
}

