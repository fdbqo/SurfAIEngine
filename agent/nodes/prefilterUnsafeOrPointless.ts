import type { SurfAgentStateType, InterpretedSpot } from "../state"
import { isDefinitelyUnsuitable } from "@/lib/shared/suitableSpotFilter"
import { getSpotById } from "@/lib/shared/spots"
import { isActiveUserMax, isActiveUserMin } from "@/lib/shared/preferenceBounds"

const FLAT_THRESHOLD = 0.2
const EXTREME_WIND_KMH = 35
const FT_TO_M = 0.3048
const KTS_TO_KMH = 1.852

export function prefilterUnsafeOrPointless(
  state: SurfAgentStateType
): Partial<SurfAgentStateType> {
  const spots = state.spots ?? []
  const user = state.user?.rawUser
  const hourlies = state.hourliesBySpot ?? {}
  const interpreted = state.interpretedBySpot ?? {}

  const keptSpots = spots.filter((s) => {
    const spot = getSpotById(s.spotId)
    if (!spot || !user) return false
    const conditions = hourlies[s.spotId]
    if (!conditions) return false
    const prefs = user.preferences
    const unsuitable = isDefinitelyUnsuitable(spot, conditions, user)
    if (unsuitable.unsuitable) return false
    if (conditions.waveHeight < FLAT_THRESHOLD) return false
    const wind = conditions.windSpeed10m ?? conditions.windSpeed ?? 0
    if (wind >= EXTREME_WIND_KMH) return false
    if (prefs?.reefAllowed === false && spot.type === "reef") return false
    if (prefs?.sandAllowed === false && spot.type === "beach") return false
    if (isActiveUserMin(prefs?.minWaveHeightFt)) {
      const minWaveM = prefs.minWaveHeightFt * FT_TO_M
      if (conditions.waveHeight < minWaveM) return false
    }
    if (isActiveUserMax(prefs?.maxWaveHeightFt)) {
      const maxWaveM = prefs.maxWaveHeightFt * FT_TO_M
      if (conditions.waveHeight > maxWaveM) return false
    }
    if (isActiveUserMax(prefs?.maxWindSpeedKnots)) {
      const maxWindKmh = prefs.maxWindSpeedKnots * KTS_TO_KMH
      if (wind > maxWindKmh) return false
    }
    if (isActiveUserMin(prefs?.minSwellPeriodSec)) {
      if (conditions.swellPeriod < prefs.minSwellPeriodSec) return false
    }
    if (user.skill === "beginner" && (spot.type === "reef" || spot.type === "harbour")) return false
    return true
  })

  const newInterpreted: Record<string, InterpretedSpot> = {}
  for (const s of keptSpots) {
    if (interpreted[s.spotId]) newInterpreted[s.spotId] = interpreted[s.spotId]
  }

  return {
    spots: keptSpots,
    spotIds: keptSpots.map((s) => s.spotId),
    interpretedBySpot: newInterpreted,
  }
}
