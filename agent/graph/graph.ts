import { StateGraph } from "@langchain/langgraph"
import { SurfAgentStateAnnotation } from "../state"
import type { SurfAgentStateType } from "../state"
import { getPlannerReadiness } from "../utils/plannerReadiness"
import { plannerNode } from "../nodes/planner"
import { toolExecutorNode } from "../nodes/toolExecutor"
import { computeForecastWindows } from "../nodes/computeForecastWindows"
import { interpretConditions } from "../nodes/interpretConditions"
import { prefilterUnsafeOrPointless } from "../nodes/prefilterUnsafeOrPointless"
import { scoreSpots } from "../nodes/scoreSpots"
import { earlyExitCheck } from "../nodes/earlyExitCheck"
import { decideCandidateSet } from "../nodes/decideCandidateSet"
import { llmDecisionAndExplanation } from "../nodes/llmDecisionAndExplanation"
import { selfReviewAndValidation } from "../nodes/selfReviewAndValidation"
import { prepareRetry, shouldRetryLlm } from "../nodes/prepareRetry"
import { applyReject } from "../nodes/applyReject"
import { notificationGuard } from "../nodes/notificationGuard"
import { outputDecision } from "../nodes/outputDecision"
import { sanitizeLastNotificationsInput } from "@/lib/shared/spotIdInput"

export type SurfGraphInput = {
  userId: string
  mode: "LIVE_NOTIFY" | "FORECAST_PLANNER"
  /** recent notifications for this user */
  lastNotifications?: Array<{ spotId: string; timestamp: string }>
}

function buildGraph() {
  const graph = new StateGraph(SurfAgentStateAnnotation)
    .addNode("planner", plannerNode)
    .addNode("toolExecutor", toolExecutorNode)
    .addNode("computeForecastWindows", computeForecastWindows)
    .addNode("interpretConditions", (state) => Promise.resolve(interpretConditions(state)))
    .addNode("prefilterUnsafeOrPointless", (state) => Promise.resolve(prefilterUnsafeOrPointless(state)))
    .addNode("scoreSpots", (state) => Promise.resolve(scoreSpots(state)))
    .addNode("earlyExitCheck", (state) => Promise.resolve(earlyExitCheck(state)))
    .addNode("decideCandidateSet", (state) => Promise.resolve(decideCandidateSet(state)))
    .addNode("llmDecisionAndExplanation", llmDecisionAndExplanation)
    .addNode("selfReviewAndValidation", (state) => Promise.resolve(selfReviewAndValidation(state)))
    .addNode("prepareRetry", (state) => Promise.resolve(prepareRetry(state)))
    .addNode("applyReject", (state) => Promise.resolve(applyReject(state)))
    .addNode("notificationGuard", (state) => Promise.resolve(notificationGuard(state)))
    .addNode("outputDecision", (state) => Promise.resolve(outputDecision(state)))
    .addEdge("__start__", "planner")
    .addConditionalEdges("planner", (state: SurfAgentStateType) => {
      if (state.decision) return "__end__"
      if (state.pendingToolCall) return "toolExecutor"
      const { haveUser, haveSpots, haveConditions } = getPlannerReadiness(state)
      if (haveUser && haveSpots && haveConditions) return "interpretConditions"
      return "planner"
    })
    .addEdge("toolExecutor", "planner")
    .addEdge("interpretConditions", "prefilterUnsafeOrPointless")
    .addEdge("prefilterUnsafeOrPointless", "scoreSpots")
    .addEdge("scoreSpots", "earlyExitCheck")
    .addConditionalEdges("earlyExitCheck", (state: SurfAgentStateType) => {
      if (state.decision) return "notificationGuard"
      return "computeForecastWindows"
    })
    .addEdge("computeForecastWindows", "decideCandidateSet")
    .addEdge("decideCandidateSet", "llmDecisionAndExplanation")
    .addEdge("llmDecisionAndExplanation", "selfReviewAndValidation")
    .addConditionalEdges(
      "selfReviewAndValidation",
      (state: SurfAgentStateType) => {
        const v = state.review?.verdict
        if (v === "approve") return "notificationGuard"
        if (shouldRetryLlm(state)) return "prepareRetry"
        return "applyReject"
      }
    )
    .addEdge("prepareRetry", "llmDecisionAndExplanation")
    .addEdge("applyReject", "notificationGuard")
    .addEdge("notificationGuard", "outputDecision")
    .addEdge("outputDecision", "__end__")

  return graph.compile()
}

let compiled: ReturnType<typeof buildGraph> | null = null

export function getSurfAgentGraph() {
  if (!compiled) compiled = buildGraph()
  return compiled
}

export async function runSurfAgent(input: SurfGraphInput) {
  const graph = getSurfAgentGraph()
  const lastNotifications = sanitizeLastNotificationsInput(input.lastNotifications ?? [])
  const result = await graph.invoke({
    userId: input.userId,
    mode: input.mode,
    lastNotifications,
    runLog: [],
  })
  return result
}
