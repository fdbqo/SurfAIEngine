import type { SurfAgentStateType, AgentDecision } from "../state"

/** force reject decision shape */
export function applyReject(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  const decision = state.decision
  const issues = state.review?.issues ?? []
  const fallbackMessage = issues.length > 0 ? issues.join("; ") : "Notification rejected."
  const revised: AgentDecision = {
    notify: false,
    spotId: undefined,
    when: undefined,
    windowStart: undefined,
    windowEnd: undefined,
    title: undefined,
    message: decision?.message ?? fallbackMessage,
    rationale: decision?.rationale,
    whyNotOthers: undefined,
    confidence: undefined,
  }
  return { decision: revised }
}
