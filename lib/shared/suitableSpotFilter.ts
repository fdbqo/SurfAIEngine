import type { Spot } from "./spots/Spot"
import type { SpotConditions } from "./types"
import type { User } from "@/types/user/User"
import { UNSET_MAX_WAVE_HEIGHT_M, UNSET_MAX_WIND_KMH, isActiveUserMax } from "./preferenceBounds"

export type UnsuitableResult = { unsuitable: boolean; reason?: string }

// Rule-based unsuitable filter (conditions only)
export function isDefinitelyUnsuitable(
  spot: Spot,
  conditions: SpotConditions,
  user: User
): UnsuitableResult {
  const { skill, preferences } = user
  // `null`/missing = no user wave ceiling ("any" in the wizard) — do not fall back to
  // skill-based 1.2m/2.5m caps, or "any" would still filter large waves.
  const maxWave = isActiveUserMax(preferences?.maxWaveHeightFt)
    ? preferences.maxWaveHeightFt * 0.3048
    : UNSET_MAX_WAVE_HEIGHT_M
  const maxWindKmh = isActiveUserMax(preferences?.maxWindSpeedKnots)
    ? preferences.maxWindSpeedKnots * 1.852
    : UNSET_MAX_WIND_KMH
  const windKmh = conditions.windSpeed10m
  const waveHeight = conditions.waveHeight

  switch (skill) {
    case "beginner":
      if (waveHeight > maxWave) return { unsuitable: true, reason: `Wave height ${waveHeight.toFixed(1)}m above max comfortable ${maxWave}m for beginners` }
      if (windKmh > maxWindKmh) {
        const cap = `${maxWindKmh.toFixed(0)} km/h`
        return { unsuitable: true, reason: `Wind ${windKmh.toFixed(0)} km/h too strong (cap ${cap})` }
      }
      return { unsuitable: false }

    case "intermediate":
      if (waveHeight > maxWave) return { unsuitable: true, reason: `Wave height ${waveHeight.toFixed(1)}m above max comfortable ${maxWave.toFixed(1)}m` }
      return { unsuitable: false }

    case "advanced":
      return { unsuitable: false }

    default:
      return { unsuitable: false }
  }
}
