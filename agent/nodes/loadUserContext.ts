import type { SurfAgentStateType } from "../state"
import { agentConfig } from "../config"
import { getUserForAgent } from "@/lib/db/userForAgent"
import type { AgentUserContext } from "../state"
import { isActiveUserMax } from "@/lib/shared/preferenceBounds"
import { buildPreferredBreaks } from "../utils/preferredBreaks"

export async function loadUserContext(
  state: SurfAgentStateType
): Promise<Partial<SurfAgentStateType>> {
  const user = await getUserForAgent(state.userId)
  if (!user) {
    return { user: null }
  }
  const prefs = user.preferences
  const { quietStart, quietEnd } = agentConfig.loadUserContext
  const context: AgentUserContext = {
    skillLevel: user.skill,
    usualLocation: user.usualLocation ? { lat: user.usualLocation.lat, lon: user.usualLocation.lon } : undefined,
    currentLocation: user.lastLocation ? { lat: user.lastLocation.lat, lon: user.lastLocation.lon } : undefined,
    // maxDistanceKm: only positive values cap distance; null/0 = no limit (undefined).
    maxDistanceKm: isActiveUserMax(prefs?.maxDistanceKm) ? prefs.maxDistanceKm : undefined,
    preferredBreaks: buildPreferredBreaks(prefs),
    riskTolerance: prefs?.riskTolerance ?? "low",
    notifyThreshold: prefs?.notifyStrictness === "strict" ? "great" : "good",
    quietHours: { start: quietStart, end: quietEnd },
    favorites: [],
    rawUser: user,
  }
  return { user: context }
}
