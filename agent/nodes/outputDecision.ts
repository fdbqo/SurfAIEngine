import type { SurfAgentStateType } from "../state"

export function outputDecision(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  const guard = state.guard
  const decision = state.decision
  if (guard?.allowed === false && decision?.notify) {
    return {
      decision: {
        ...decision,
        notify: false,
        message: decision.message ?? guard.blockedReason,
      },
    }
  }
  return {}
}
