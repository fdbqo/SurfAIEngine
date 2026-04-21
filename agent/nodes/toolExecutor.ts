import type { SurfAgentStateType } from "../state"
import { agentConfig } from "../config"
import { getLocationForDistance } from "../state"
import { appendRunLog } from "../utils/runLog"
import { getUserForAgent } from "@/lib/db/userForAgent"
import { getSpotsByRegion, allSpots } from "@/lib/shared/spots"
import { getAllSpotsWithDistance } from "@/lib/shared/spots/nearby"
import type { SpotConditions } from "@/lib/shared/types"
import { getConditionsForSpots } from "@/lib/db/services/spotConditionsService"
import { FALLBACK_LOCATION } from "@/lib/shared/defaults"
import type { AgentUserContext } from "../state"

export async function toolExecutorNode(
  state: SurfAgentStateType
): Promise<Partial<SurfAgentStateType>> {
  const call = state.pendingToolCall
  if (!call) return {}

  if (call.tool === "get_user_preferences") {
    const user = await getUserForAgent(state.userId)
    if (!user) return { user: null, pendingToolCall: null, runLog: appendRunLog(state, "toolExecutor") }
    const prefs = user.preferences
    return {
      pendingToolCall: null,
      runLog: appendRunLog(state, "toolExecutor", { tool: "get_user_preferences" }),
      user: {
        skillLevel: user.skill,
        usualLocation: user.usualLocation ? { lat: user.usualLocation.lat, lon: user.usualLocation.lon } : undefined,
        currentLocation: user.lastLocation ? { lat: user.lastLocation.lat, lon: user.lastLocation.lon } : undefined,
        // maxDistanceKm: null means "no limit" (leave undefined so downstream can interpret as infinite)
        maxDistanceKm: typeof prefs?.maxDistanceKm === "number" ? prefs.maxDistanceKm : undefined,
        preferredBreaks: (prefs
          ? ([
              prefs.sandAllowed !== false && "beach",
              prefs.reefAllowed !== false && "reef",
              "point",
              "bay",
            ].filter(Boolean) as Array<"beach" | "reef" | "point" | "bay">)
          : ["beach", "reef", "point", "bay"]) as AgentUserContext["preferredBreaks"],
        riskTolerance: prefs?.riskTolerance ?? "low",
        notifyThreshold: prefs?.notifyStrictness === "strict" ? "great" : "good",
        favorites: [],
        rawUser: user,
      },
    }
  }

  if (call.tool === "get_spots_near_user") {
    const user = await getUserForAgent(state.userId)
    if (!user) return { pendingToolCall: null, runLog: appendRunLog(state, "toolExecutor") }
    const loc = getLocationForDistance(state.user) ?? (user.lastLocation
      ? { lat: user.lastLocation.lat, lon: user.lastLocation.lon }
      : user.usualLocation ?? FALLBACK_LOCATION)
    const maxDist =
      typeof state.user?.maxDistanceKm === "number"
        ? state.user.maxDistanceKm
        : Number.POSITIVE_INFINITY
    const withDistance = getAllSpotsWithDistance(allSpots, loc)
    const within = withDistance.filter((s) => s.distanceKm <= maxDist).slice(0, 30)
    return {
      pendingToolCall: null,
      runLog: appendRunLog(state, "toolExecutor", { tool: "get_spots_near_user", count: within.length }),
      spotIds: within.map((s) => s.id),
      spots: within.map((s) => ({
        spotId: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        breakType: s.type,
        region: s.region,
      })),
    }
  }

  if (call.tool === "get_spots_in_region") {
    const region =
      String(
        call.args.region ??
          state.user?.rawUser?.homeRegion ??
          state.user?.rawUser?.usualRegions?.[0] ??
          ""
      ).trim() || agentConfig.planner.defaultRegion
    if (!region) return { pendingToolCall: null, runLog: appendRunLog(state, "toolExecutor") }
    const regionSpots = getSpotsByRegion(region).slice(0, 30)
    return {
      pendingToolCall: null,
      runLog: appendRunLog(state, "toolExecutor", { tool: "get_spots_in_region", region, count: regionSpots.length }),
      spotIds: regionSpots.map((s) => s.id),
      spots: regionSpots.map((s) => ({
        spotId: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        breakType: s.type,
        region: s.region,
      })),
    }
  }

  if (call.tool === "get_surf_conditions_batch") {
    const spotIds = (Array.isArray(call.args.spotIds) ? call.args.spotIds.map(String) : state.spotIds ?? []) as string[]
    if (!spotIds.length) return { pendingToolCall: null, runLog: appendRunLog(state, "toolExecutor") }

    const results = await getConditionsForSpots(spotIds)
    const hourliesBySpot: Record<string, SpotConditions | null> = { ...(state.hourliesBySpot ?? {}) }
    for (const r of results) hourliesBySpot[r.spotId] = r.conditions

    return {
      pendingToolCall: null,
      runLog: appendRunLog(state, "toolExecutor", { tool: "get_surf_conditions_batch", spotCount: spotIds.length }),
      hourliesBySpot,
    }
  }

  return { pendingToolCall: null, runLog: appendRunLog(state, "toolExecutor") }
}

