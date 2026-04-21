import type { SurfAgentStateType, AgentDecision } from "../state"

/** Force decision to notify=false and set message from review issues when verdict is reject (or we give up on revise). */
export function applyReject(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  const decision = state.decision
  const issues = state.review?.issues ?? []
  const fallbackMessage = issues.length > 0 ? issues.join("; ") : "Notification rejected."
  const revised: AgentDecision = {
    ...decision,
    notify: false,
    spotId: undefined,
    message: decision?.message ?? fallbackMessage,
  }
  return { decision: revised }
}
