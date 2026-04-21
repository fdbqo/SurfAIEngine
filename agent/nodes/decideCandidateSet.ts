import type { SurfAgentStateType, CandidateSummary } from "../state"
import { agentConfig } from "../config"
import { getTimeOfDayLabel, formatTimeOfDayForPrompt } from "../utils/notificationContext"

export function decideCandidateSet(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  const scored = state.scored ?? []
  const interpreted = state.interpretedBySpot ?? {}
  const spots = state.spots ?? []
  const hourlies = state.hourliesBySpot ?? {}
  const spotMap = new Map(spots.map((s) => [s.spotId, s]))

  // Use localHour from live conditions when available (MongoDB localTime); otherwise skip time-of-day.
  const firstConditions = Object.values(hourlies).find(Boolean)
  const localHourFromData =
    firstConditions && typeof (firstConditions as { localHour?: number }).localHour === "number"
      ? (firstConditions as { localHour: number }).localHour
      : null
  const timeOfDayNow =
    localHourFromData != null ? getTimeOfDayLabel(localHourFromData) : null

  const sorted = [...scored].sort(
    (a, b) => b.userSuitability - a.userSuitability || b.envScore - a.envScore
  )
  const top = sorted.slice(0, agentConfig.candidates.topN)
  const topCandidates: CandidateSummary[] = top.map((s) => {
    const spot = spotMap.get(s.spotId)
    const name = spot?.name ?? s.spotId
    const interp = interpreted[s.spotId]
    const nowText = interp?.nowText ?? "No summary."
    const hazards = interp?.hazards?.length ? ` Hazards: ${interp.hazards.join(", ")}` : ""
    const distStr = s.distanceKm != null ? `, ${s.distanceKm}km away` : ""
    const timeStr =
      timeOfDayNow != null ? `, time now: ${formatTimeOfDayForPrompt(timeOfDayNow)}` : ""
    const summary = `Spot: ${name}. Env: ${s.envScore}/10, User suitability: ${s.userSuitability}/10${distStr}${timeStr}. Now: ${nowText}${hazards}`
    return {
      spotId: s.spotId,
      summary,
      envScore: s.envScore,
      userSuitability: s.userSuitability,
      distanceKm: s.distanceKm,
      timeOfDayLabel: timeOfDayNow ?? undefined,
    }
  })
  return { topCandidates }
}
