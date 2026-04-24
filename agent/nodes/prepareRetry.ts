import type { SurfAgentStateType } from "../state"

import { agentConfig } from "../config"

/** increment retry count before llm retry */
export function prepareRetry(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  const count = state.llmRetryCount ?? 0
  return { llmRetryCount: count + 1 }
}

export function shouldRetryLlm(state: SurfAgentStateType): boolean {
  const verdict = state.review?.verdict
  const count = state.llmRetryCount ?? 0
  return verdict === "revise" && count < agentConfig.prepareRetry.maxLlmRetries
}
