import type { SurfAgentStateType, AgentDecision } from "../state"
import { agentConfig } from "../config"

/** stop early when scores are too low */
export function earlyExitCheck(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  // skip early exit in forecast mode
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
