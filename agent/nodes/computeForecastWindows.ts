import type { SurfAgentStateType, ForecastWindow } from "../state"
import { agentConfig } from "../config"
import { getLocationForDistance } from "../state"
import { getForecast3hForSpot } from "@/lib/db/services/spotConditionsService"
import { getSpotsById } from "@/lib/shared/spots"
import { distanceKm } from "@/lib/shared/geo"
import { scoreSpot, toScoringInput } from "@/lib/shared/scoring"
import {
  getTimeOfDayLabel,
  getHoursUntil,
  formatTimeOfDayForPrompt,
  getFutureDiscountFactor,
} from "../utils/notificationContext"
import { FALLBACK_LOCATION } from "@/lib/shared/defaults"

const { maxWindowsPerSpot, topSpots, wildcardMinScore, maxTotalWindows, daysAhead } =
  agentConfig.forecastWindows
const { topN: topScoredToEnsure } = agentConfig.candidates

// Build multi-window forecast planning only for FORECAST_PLANNER mode.
// Up to N windows per spot, top spots by best window; wildcards for other spots with 1 strong window; cap total.
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

  const now = new Date()
  const windows: Array<ForecastWindow & { adjustedScore: number }> = []

  const forecastResults = await Promise.all(
    spotIds.map(async (spotId) => {
      const blocks = await getForecast3hForSpot(spotId, daysAhead)
      return { spotId, blocks }
    })
  )

  const spotsById = getSpotsById(spotIds)
  for (const { spotId, blocks } of forecastResults) {
    const spot = spotsById.get(spotId)
    if (!spot) continue
    const distKm = Math.round(distanceKm(loc, { lat: spot.lat, lon: spot.lon }) * 10) / 10
    for (const b of blocks) {
      const windowLocalHour = b.localHour ?? b.windowStart.getUTCHours()
      const timeOfDayLabel = getTimeOfDayLabel(windowLocalHour)
      const hoursUntilStart = getHoursUntil(b.windowStart, now)
      const confidence = getFutureDiscountFactor(hoursUntilStart)

      const pseudoConditions = {
        spotId,
        swellHeight: b.swellHeight,
        swellPeriod: b.swellPeriod,
        swellDirection: 270,
        waveHeight: b.waveHeight,
        wavePeriod: b.swellPeriod,
        windSpeed: b.windSpeed10m,
        windSpeed10m: b.windSpeed10m,
        windSpeed2m: b.windSpeed10m,
        windDirection: b.windDirection,
        localTime: b.windowStart.toISOString(),
        localHour: windowLocalHour,
      }
      const input = toScoringInput(pseudoConditions, spot, user)
      const scored = scoreSpot(input)
      const envScore = Math.round(scored.score * 10) / 10
      const userSuitability = envScore
      const adjustedScore = Math.round(userSuitability * confidence * 10) / 10

      const timeDesc = `${formatTimeOfDayForPrompt(timeOfDayLabel)}, in ${hoursUntilStart < 0 ? "past" : `${Math.round(hoursUntilStart)}h`}`
      const distDesc = `${distKm}km away`
      const confidenceNote = confidence < 1 ? ` (forecast confidence ${confidence})` : ""
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
        forecastConfidence: confidence,
        adjustedScore,
      })
    }
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

  // Ensure every top "now" scored spot has at least one forecast row so the LLM can pick
  // when="window" for the same breaks it sees in Top candidates (UX: no orphan snap vetoes).
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

