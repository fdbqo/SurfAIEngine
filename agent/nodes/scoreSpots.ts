import type { SurfAgentStateType, ScoredSpot } from "../state"
import { getLocationForDistance } from "../state"
import { getSpotById } from "@/lib/shared/spots"
import { distanceKm } from "@/lib/shared/geo"
import { distanceScore } from "@/lib/shared/distanceScore"
import { scoreSpot, toScoringInput } from "@/lib/shared/scoring"
import type { SpotConditions } from "@/lib/shared/types"
import { FALLBACK_LOCATION } from "@/lib/shared/defaults"
import { preferenceFitBonus, resolvedMaxDistanceKm } from "../utils/preferenceRanking"

export function scoreSpots(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  const spots = state.spots ?? []
  const user = state.user
  const hourlies = state.hourliesBySpot ?? {}
  const interpreted = state.interpretedBySpot ?? {}
  if (!user?.rawUser) return { scored: [] }

  const loc = getLocationForDistance(user) ?? FALLBACK_LOCATION
  const strictness = user.rawUser.preferences?.notifyStrictness ?? "lenient"
  const maxDistanceKm = resolvedMaxDistanceKm(user.maxDistanceKm, user.rawUser.preferences?.maxDistanceKm)
  const scored: ScoredSpot[] = []

  for (const s of spots) {
    const spot = getSpotById(s.spotId)
    const conditions = hourlies[s.spotId]
    const interp = interpreted[s.spotId]
    if (!spot || !conditions) continue

    const distKm = distanceKm(loc, { lat: spot.lat, lon: spot.lon })
    if (typeof maxDistanceKm === "number" && distKm > maxDistanceKm) continue
    const scoringInput = toScoringInput(conditions, spot, user.rawUser)
    const surfScore = scoreSpot(scoringInput)
    const distSc = distanceScore(distKm, strictness)
    const envScore = interp?.envQualityScoreNow ?? Math.round(surfScore.score * 10) / 10
    // User suitability is distance-weighted (0–10) for practical recommendations.
    const userSuitability = Math.round((surfScore.score / 10) * distSc * 100) / 100
    const base10 = Math.min(10, Math.max(0, userSuitability * 10))
    const userSuitability10 = Math.min(10, base10 + preferenceFitBonus(user.rawUser.preferences, conditions.waveHeight))

    scored.push({
      spotId: spot.id,
      envScore,
      userSuitability: userSuitability10,
      reasons: surfScore.reasons,
      distanceKm: Math.round(distKm * 10) / 10,
    })
  }

  scored.sort((a, b) => b.userSuitability - a.userSuitability)
  return { scored }
}
