import type { SurfAgentStateType, NotificationGuardResult } from "../state"

// Quiet hours + dedupeKey; time-based throttle lives in runAgentAndMaybeNotify (Mongo notificationevents).
export function notificationGuard(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  const decision = state.decision
  const guard: NotificationGuardResult = { allowed: true }

  if (!decision?.notify) {
    return { guard }
  }

  const dedupeKey = `${state.userId}:${decision.spotId ?? "none"}:${decision.when ?? "now"}`
  guard.dedupeKey = dedupeKey

  const user = state.user
  if (user?.quietHours) {
    const local = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
    const [start, end] = [user.quietHours.start, user.quietHours.end]
    if (start && end && local >= start && local <= end) {
      guard.allowed = false
      guard.blockedReason = "Quiet hours"
    }
  }

  return { guard }
}
