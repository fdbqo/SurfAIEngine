import { agentConfig } from "../config"
import type { SurfAgentStateType } from "../state"
import { getLocalHourFromState } from "./forecastNoNowSession"
import { getTimeOfDayLabel, type TimeOfDayLabel } from "./notificationContext"

const allowedSet = new Set<string>(agentConfig.plausibleNow.allowedTimeOfDay as unknown as string[])

/**
 * In FORECAST_PLANNER, "go now" should only feel realistic when the user is close enough
 * to reach the break soon and local time is still a sensible part of the day to paddle out.
 * Forecast windows are the default recommendation; "now" is a narrow exception.
 */
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
