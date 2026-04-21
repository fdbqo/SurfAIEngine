import type { SurfAgentStateType } from "../state"
import type { SpotConditions } from "@/lib/shared/types"
import {
  getConditionsForSpots,
  getConditionsForSpotNextHours,
  getForecast3hForSpot,
  getDailyForecastForSpot,
} from "@/lib/db/services/spotConditionsService"

export async function fetchDataForSpots(
  state: SurfAgentStateType
): Promise<Partial<SurfAgentStateType>> {
  const spotIds = state.spotIds ?? state.spots?.map((s) => s.spotId) ?? []
  if (spotIds.length === 0) {
    return { hourliesBySpot: {}, forecast3hBySpot: {}, forecastDailyBySpot: {} }
  }

  if (state.mode === "LIVE_NOTIFY") {
    const results = await getConditionsForSpots(spotIds)
    const hourliesBySpot: Record<string, SpotConditions | null> = {}
    for (const r of results) {
      hourliesBySpot[r.spotId] = r.conditions
    }
    return { hourliesBySpot, forecast3hBySpot: {}, forecastDailyBySpot: {} }
  }

  const forecast3hBySpot: Record<string, Array<Record<string, unknown>>> = {}
  const forecastDailyBySpot: Record<string, Array<Record<string, unknown>>> = {}
  const hourliesBySpot: Record<string, SpotConditions | null> = {}

  await Promise.all(
    spotIds.map(async (spotId) => {
      const [nextHours, forecast3h, forecastDaily] = await Promise.all([
        getConditionsForSpotNextHours(spotId, 6),
        getForecast3hForSpot(spotId, 6),
        getDailyForecastForSpot(spotId, 7),
      ])
      hourliesBySpot[spotId] = nextHours[0] ?? null
      forecast3hBySpot[spotId] = forecast3h as Array<Record<string, unknown>>
      forecastDailyBySpot[spotId] = forecastDaily as Array<Record<string, unknown>>
    })
  )
  return { hourliesBySpot, forecast3hBySpot, forecastDailyBySpot }
}
