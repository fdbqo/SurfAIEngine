import type { SurfAgentStateType, AgentReview } from "../state"

import { agentConfig } from "../config"

function roundScore1(n: number): number {
  return Math.round(n * 10) / 10
}

export function selfReviewAndValidation(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  const decision = state.decision
  const scored = state.scored ?? []
  const forecastWindows = state.forecastWindows ?? []
  const topCandidates = state.topCandidates ?? []
  const review: AgentReview = { verdict: "approve" }

  if (!decision) {
    review.verdict = "reject"
    review.issues = ["No decision produced"]
    return { review }
  }

  if (!decision.notify) {
    return { review }
  }

  const { minUserSuitability, minEnvScoreToNotify, minConfidence, minConfidenceToNotify } = agentConfig.selfReview
  const isWindowDecision = decision.when === "next_window"
  if (isWindowDecision) {
    if (!decision.windowStart) {
      review.verdict = "reject"
      review.issues = ["next_window decision missing windowStart"]
      return { review }
    }
    // For forecast-planner window decisions, the candidate set is the computed forecast window list.
    // A spot can be a valid window choice even if it's not present in `topCandidates` (which is live-now only).
    const chosenWindow = forecastWindows.find(
      (w) => w.spotId === decision.spotId && w.start.getTime() === decision.windowStart!.getTime(),
    )
    if (!chosenWindow) {
      review.verdict = "reject"
      review.issues = ["Chosen forecast window not found in forecastWindows"]
      return { review }
    }
    if (chosenWindow.userSuitability < minUserSuitability) {
      review.verdict = "revise"
      review.issues = [
        `Future-window suitability ${roundScore1(chosenWindow.userSuitability)} below threshold ${minUserSuitability}`,
      ]
      return { review }
    }
    if (chosenWindow.envScore < minEnvScoreToNotify) {
      review.verdict = "revise"
      review.issues = [
        `Future-window envScore ${roundScore1(chosenWindow.envScore)} below threshold ${minEnvScoreToNotify}`,
      ]
      return { review }
    }
  } else {
    // For "now" decisions, enforce that the chosen spot is one of the top live candidates.
    const chosenInCandidates = topCandidates.some((c) => c.spotId === decision.spotId)
    if (!chosenInCandidates) {
      review.verdict = "reject"
      review.issues = ["Chosen spot not in candidate set"]
      return { review }
    }
    const chosenScore = scored.find((s) => s.spotId === decision.spotId)
    if (chosenScore && chosenScore.userSuitability < minUserSuitability) {
      review.verdict = "revise"
      review.issues = [`User suitability ${roundScore1(chosenScore.userSuitability)} below threshold ${minUserSuitability}`]
      return { review }
    }
    if (chosenScore && chosenScore.envScore < minEnvScoreToNotify) {
      review.verdict = "revise"
      review.issues = [`Env score ${roundScore1(chosenScore.envScore)} below threshold ${minEnvScoreToNotify}`]
      return { review }
    }
  }

  if (decision.notify && decision.confidence != null && decision.confidence < minConfidenceToNotify) {
    review.verdict = "reject"
    review.issues = [`Confidence ${decision.confidence} below minimum to notify (${minConfidenceToNotify})`]
    return { review }
  }

  if (decision.confidence != null && decision.confidence < minConfidence) {
    review.verdict = "revise"
    review.issues = [`Confidence ${decision.confidence} below ${minConfidence}`]
    return { review }
  }

  return { review }
}
