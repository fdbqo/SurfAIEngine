import type { SurfAgentStateType, AgentReview } from "../state"

import { agentConfig } from "../config"

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

  const chosenInCandidates = topCandidates.some((c) => c.spotId === decision.spotId)
  if (!chosenInCandidates) {
    review.verdict = "reject"
    review.issues = ["Chosen spot not in candidate set"]
    return { review }
  }

  const { minUserSuitability, minConfidence, minConfidenceToNotify } = agentConfig.selfReview
  const isWindowDecision = decision.when === "next_window"
  if (isWindowDecision) {
    if (!decision.windowStart) {
      review.verdict = "reject"
      review.issues = ["next_window decision missing windowStart"]
      return { review }
    }
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
        `Future-window suitability ${chosenWindow.userSuitability} below threshold ${minUserSuitability}`,
      ]
      return { review }
    }
  } else {
    const chosenScore = scored.find((s) => s.spotId === decision.spotId)
    if (chosenScore && chosenScore.userSuitability < minUserSuitability) {
      review.verdict = "revise"
      review.issues = [`User suitability ${chosenScore.userSuitability} below threshold ${minUserSuitability}`]
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
