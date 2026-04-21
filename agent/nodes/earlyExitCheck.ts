import type { SurfAgentStateType, AgentDecision } from "../state"
import { agentConfig } from "../config"

/**
 * After scoring: if no viable spots, set decision and skip LLM + candidates + windows.
 * Saves tokens and gives the agent an explicit "stop early" behaviour.
 */
export function earlyExitCheck(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  // In forecast planning mode we should not stop early based on "now" scoring,
  // because the whole point is to look for upcoming windows.
  if (state.mode === "FORECAST_PLANNER") return {}

  const scored = state.scored ?? []
  const threshold = agentConfig.earlyExit.minScoreThreshold
  const maxScore = scored.length
    ? Math.max(...scored.map((s) => s.userSuitability))
    : 0

  if (scored.length === 0 || maxScore < threshold) {
    const decision: AgentDecision = {
      notify: false,
      message: "No viable surf conditions.",
      rationale: scored.length === 0
        ? "No spots passed filtering."
        : "All spots scored below threshold.",
    }
    return { decision }
  }
  return {}
}
