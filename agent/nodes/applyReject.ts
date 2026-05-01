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
    // When we reject, we shouldn't keep the previous push copy in `message` because it can
    // look like something was actually sent. Keep the issues string for debugging instead.
    message: fallbackMessage,
    rationale: decision?.rationale,
    whyNotOthers: undefined,
    confidence: undefined,
  }
  return { decision: revised }
}
