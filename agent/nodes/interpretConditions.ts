import type { SurfAgentStateType, InterpretedSpot } from "../state"
import type { SpotConditions } from "@/lib/shared/types"
import type { Spot } from "@/lib/shared/spots"
import { getSpotById } from "@/lib/shared/spots"
import { scoreSpot, toScoringInput } from "@/lib/shared/scoring"
import type { User } from "@/types/user/User"

function windLabel(spot: Spot, windDir: number, windSpeedKmh: number): InterpretedSpot["windLabel"] {
  const offshoreDir = (spot.orientation + 180) % 360
  let diff = Math.abs(offshoreDir - windDir)
  if (diff > 180) diff = 360 - diff
  if (diff < 45) return "offshore"
  if (diff < 90) return "cross"
  return "onshore"
}

function windStrengthLabel(kmh: number): InterpretedSpot["windStrengthLabel"] {
  if (kmh < 12) return "light"
  if (kmh < 25) return "moderate"
  return "strong"
}

function waveSizeLabel(m: number): InterpretedSpot["waveSizeLabel"] {
  if (m < 0.3) return "flat"
  if (m < 0.8) return "small"
  if (m < 1.8) return "medium"
  return "large"
}

function swellQualityLabel(height: number, period: number): InterpretedSpot["swellQualityLabel"] {
  const power = height * period
  if (power < 3) return "poor"
  if (power < 8) return "ok"
  if (power < 15) return "good"
  return "excellent"
}

function envScoreFromConditions(conditions: SpotConditions, spot: Spot, user: User): number {
  const input = toScoringInput(conditions, spot, user)
  const result = scoreSpot(input)
  return Math.round(result.score * 10) / 10
}

export function interpretConditions(
  state: SurfAgentStateType
): Partial<SurfAgentStateType> {
  const interpretedBySpot: Record<string, InterpretedSpot> = {}
  const spots = state.spots ?? []
  const user = state.user?.rawUser
  const hourlies = state.hourliesBySpot ?? {}
  const forecast3h = state.forecast3hBySpot ?? {}

  for (const s of spots) {
    const spot = getSpotById(s.spotId)
    if (!spot || !user) continue

    const conditions = hourlies[s.spotId]
    const blocks = forecast3h[s.spotId] ?? []
    const best3h = blocks.length > 0 ? blocks[0] : null

    let nowText: string | undefined
    let forecastText: string | undefined
    let envQualityScoreNow: number | undefined
    let envQualityScoreBest3h: number | undefined
    const hazards: string[] = []

    if (conditions) {
      const wh = conditions.waveHeight
      const period = conditions.swellPeriod
      const windKmh = conditions.windSpeed10m ?? conditions.windSpeed ?? 0
      const windDirLabel = windLabel(spot, conditions.windDirection, windKmh)
      const windS = windStrengthLabel(windKmh)
      const waveL = waveSizeLabel(wh)
      const swellL = swellQualityLabel(conditions.swellHeight, period)
      nowText = `${waveL} waves (~${wh.toFixed(1)}m), ${period}s period. ${windS} ${windDirLabel} wind. Swell ${swellL}.`

      // Base env score from shared scoring
      const baseScore = envScoreFromConditions(conditions, spot, user)
      let adjustedScore = baseScore

      // Extra wind-quality adjustments (generic, no spot hardcoding)
      if (windS === "strong") {
        if (windDirLabel === "onshore") {
          adjustedScore *= user.skill === "advanced" ? 0.6 : 0.4
          hazards.push("Strong onshore wind")
        } else if (windDirLabel === "cross") {
          adjustedScore *= user.skill === "advanced" ? 0.7 : 0.5
          hazards.push("Strong cross wind")
        } else {
          // strong offshore: still penalize a bit
          adjustedScore *= 0.85
          hazards.push("Very strong offshore wind")
        }
      } else if (windS === "moderate" && windDirLabel === "onshore") {
        adjustedScore *= user.skill === "advanced" ? 0.8 : 0.6
        hazards.push("Onshore wind")
      }

      const riskTol = user.preferences?.riskTolerance ?? "medium"
      if (riskTol === "low" && wh > 1.6) {
        adjustedScore *= 0.93
        if (wh > 2.2) hazards.push("Chunky waves for a low-risk preference")
      }

      envQualityScoreNow = Math.max(0, Math.min(10, Math.round(adjustedScore * 10) / 10))

      if (wh > 2.5 && user.skill === "beginner") hazards.push("Wave height high for beginners")
    } else {
      nowText = "No live conditions."
    }

    if (best3h && typeof best3h.waveHeight === "number") {
      const wh = best3h.waveHeight as number
      const period = (best3h.swellPeriod as number) ?? 0
      forecastText = `Best window: ~${wh.toFixed(1)}m, ${period}s period.`
      envQualityScoreBest3h = typeof best3h.score === "number" ? (best3h.score as number) : undefined
    }

    interpretedBySpot[s.spotId] = {
      nowText,
      forecastText,
      windLabel: conditions ? windLabel(spot, conditions.windDirection, conditions.windSpeed10m ?? 0) : undefined,
      windStrengthLabel: conditions ? windStrengthLabel(conditions.windSpeed10m ?? 0) : undefined,
      waveSizeLabel: conditions ? waveSizeLabel(conditions.waveHeight) : undefined,
      swellQualityLabel: conditions ? swellQualityLabel(conditions.swellHeight, conditions.swellPeriod) : undefined,
      envQualityScoreNow,
      envQualityScoreBest3h,
      hazards: hazards.length > 0 ? hazards : undefined,
    }
  }

  return { interpretedBySpot }
}
