import type { Spot } from "./spots/Spot"
import type { SpotConditions } from "./types"
import type { User } from "@/types/user/User"

export type UnsuitableResult = { unsuitable: boolean; reason?: string }

// Rule-based unsuitable filter (conditions only)
export function isDefinitelyUnsuitable(
  spot: Spot,
  conditions: SpotConditions,
  user: User
): UnsuitableResult {
  const { skill, preferences } = user
  const maxWave =
    typeof preferences?.maxWaveHeightFt === "number"
      ? preferences.maxWaveHeightFt * 0.3048
      : skill === "beginner"
        ? 1.2
        : skill === "intermediate"
          ? 2.5
          : 99
  const maxWindKmh =
    typeof preferences?.maxWindSpeedKnots === "number"
      ? preferences.maxWindSpeedKnots * 1.852
      : null
  const windKmh = conditions.windSpeed10m
  const waveHeight = conditions.waveHeight

  switch (skill) {
    case "beginner":
      if (waveHeight > maxWave) return { unsuitable: true, reason: `Wave height ${waveHeight.toFixed(1)}m above max comfortable ${maxWave}m for beginners` }
      if (maxWindKmh != null ? windKmh > maxWindKmh : windKmh > 18) {
        const cap = maxWindKmh != null ? `${maxWindKmh.toFixed(0)} km/h` : "18 km/h"
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
