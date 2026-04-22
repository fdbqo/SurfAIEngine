import type { SurfAgentStateType, SpotInfo } from "../state"
import { agentConfig } from "../config"
import { getLocationForDistance } from "../state"
import { allSpots, getSpotById } from "@/lib/shared/spots"
import { getAllSpotsWithDistance } from "@/lib/shared/spots/nearby"
import { FALLBACK_LOCATION } from "@/lib/shared/defaults"
import { isActiveUserMax, UNSET_MAX_DISTANCE_KM } from "@/lib/shared/preferenceBounds"

export async function selectSpots(state: SurfAgentStateType): Promise<Partial<SurfAgentStateType>> {
  const user = state.user
  if (!user) return { spotIds: [], spots: [] }

  const loc = getLocationForDistance(user) ?? FALLBACK_LOCATION
  const withDistance = getAllSpotsWithDistance(allSpots, loc)
  withDistance.sort((a, b) => a.distanceKm - b.distanceKm)

  const spotIdsSet = new Set<string>(user.favorites ?? [])
  const { maxNearby } = agentConfig.selectSpots
  const maxDist = isActiveUserMax(user.maxDistanceKm) ? user.maxDistanceKm : UNSET_MAX_DISTANCE_KM
  for (const s of withDistance) {
    if (s.distanceKm > maxDist) break
    if (spotIdsSet.has(s.id)) continue
    spotIdsSet.add(s.id)
    if (spotIdsSet.size >= maxNearby) break
  }
  const spotIds = [...spotIdsSet]
  const spots: SpotInfo[] = spotIds
    .map((id) => getSpotById(id))
    .filter((s): s is NonNullable<typeof s> => s != null)
    .map((s) => ({
      spotId: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      breakType: s.type,
      region: s.region,
    }))
  return { spotIds, spots }
}
