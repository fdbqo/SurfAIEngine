import type { SurfAgentStateType } from "../state"
import { agentConfig } from "../config"
import { getPlannerReadiness } from "../utils/plannerReadiness"
import { appendRunLog } from "../utils/runLog"
import type { User } from "@/types/user/User"

/**
 * Fully deterministic planner: user → spots → conditions batch.
 * No LLM step (previous unreachable branch removed).
 */
export async function plannerNode(
  state: SurfAgentStateType
): Promise<Partial<SurfAgentStateType>> {
  const stepCount = (state.stepCount ?? 0) + 1
  if (stepCount > agentConfig.planner.maxSteps) {
    return {
      stepCount,
      pendingToolCall: null,
      decision: {
        notify: false,
        message: "Max steps reached; no notification sent.",
        rationale: "Planner loop limit reached.",
      },
      runLog: appendRunLog(state, "planner", { maxStepsReached: true }),
    }
  }

  const { haveUser, haveSpots, haveConditions } = getPlannerReadiness(state)

  if (haveUser && haveSpots && haveConditions) {
    return {
      stepCount,
      pendingToolCall: null,
      runLog: appendRunLog(state, "planner", { done: true }),
    }
  }

  if (!haveUser) {
    return {
      stepCount,
      pendingToolCall: { tool: "get_user_preferences", args: {} },
      runLog: appendRunLog(state, "planner", { nextTool: "get_user_preferences" }),
    }
  }
  if (!haveSpots) {
    const raw: User | undefined = state.user?.rawUser
    const useNear = !!raw?.lastLocation
    const region =
      (raw?.homeRegion ?? raw?.usualRegions?.[0] ?? "").trim() ||
      agentConfig.planner.defaultRegion
    return {
      stepCount,
      pendingToolCall: {
        tool: useNear ? "get_spots_near_user" : "get_spots_in_region",
        args: useNear ? {} : { region },
      },
      runLog: appendRunLog(state, "planner", {
        nextTool: useNear ? "get_spots_near_user" : "get_spots_in_region",
        region: useNear ? undefined : region,
      }),
    }
  }
  if (!haveConditions) {
    return {
      stepCount,
      pendingToolCall: {
        tool: "get_surf_conditions_batch",
        args: { spotIds: state.spotIds ?? [] },
      },
      runLog: appendRunLog(state, "planner", { nextTool: "get_surf_conditions_batch" }),
    }
  }

  return {
    stepCount,
    pendingToolCall: null,
    decision: {
      notify: false,
      message: "Planner reached an unexpected state.",
      rationale: "Internal planner readiness invariant failed; notify suppressed.",
    },
    runLog: appendRunLog(state, "planner", { error: "planner_invariant" }),
  }
}
