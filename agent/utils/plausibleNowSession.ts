import { agentConfig } from "../config"
import type { SurfAgentStateType } from "../state"
import { getLocalHourFromState } from "./forecastNoNowSession"
import { getTimeOfDayLabel, type TimeOfDayLabel } from "./notificationContext"

const allowedSet = new Set<string>(agentConfig.plausibleNow.allowedTimeOfDay as unknown as string[])

/** now picks in forecast mode should be close and realistic */
export function isPlausibleNowForForecast(state: SurfAgentStateType, spotId: string): boolean {
  const fromScored = state.scored?.find((s) => s.spotId === spotId)
  const fromTop = state.topCandidates?.find((c) => c.spotId === spotId)
  const distKm = fromScored?.distanceKm ?? fromTop?.distanceKm
  if (typeof distKm === "number" && distKm > agentConfig.plausibleNow.maxDistanceKm) {
    return false
  }
  const h = getLocalHourFromState(state)
  if (h == null) return true
  const label: TimeOfDayLabel = getTimeOfDayLabel(h)
  return allowedSet.has(label)
}
