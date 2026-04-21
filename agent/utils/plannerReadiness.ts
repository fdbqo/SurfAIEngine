import type { SurfAgentStateType } from "../state"

export type PlannerReadiness = {
  haveUser: boolean
  haveSpots: boolean
  haveConditions: boolean
}

/** Single source of truth for planner/graph: whether we have user, spots, and conditions. */
export function getPlannerReadiness(state: SurfAgentStateType): PlannerReadiness {
  const haveUser = state.user != null
  const haveSpots =
    (state.spotIds?.length ?? 0) > 0 && (state.spots?.length ?? 0) > 0
  const haveConditions =
    state.hourliesBySpot != null && Object.keys(state.hourliesBySpot).length > 0
  return { haveUser, haveSpots, haveConditions }
}
