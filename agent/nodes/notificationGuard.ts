import type { SurfAgentStateType, NotificationGuardResult } from "../state"

import { agentConfig } from "../config"

/** In-memory last-notify time per dedupeKey for minIntervalHours throttling. */
const lastNotifyAtByKey = new Map<string, number>()

export function notificationGuard(state: SurfAgentStateType): Partial<SurfAgentStateType> {
  const decision = state.decision
  const guard: NotificationGuardResult = { allowed: true }

  if (!decision?.notify) {
    return { guard }
  }

  const dedupeKey = `${state.userId}:${decision.spotId ?? "none"}:${decision.when ?? "now"}`
  guard.dedupeKey = dedupeKey

  const { minIntervalHours } = agentConfig.notificationGuard
  const now = Date.now()
  const lastAt = lastNotifyAtByKey.get(dedupeKey)
  if (lastAt != null) {
    const hoursSince = (now - lastAt) / (60 * 60 * 1000)
    if (hoursSince < minIntervalHours) {
      guard.allowed = false
      guard.blockedReason = `Throttle: last notify ${hoursSince.toFixed(1)}h ago (min ${minIntervalHours}h)`
      return { guard }
    }
  }

  const user = state.user
  if (user?.quietHours) {
    const local = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
    const [start, end] = [user.quietHours.start, user.quietHours.end]
    if (start && end && local >= start && local <= end) {
      guard.allowed = false
      guard.blockedReason = "Quiet hours"
      return { guard }
    }
  }

  // Record throttle time only if we are allowing the decision past guard (not before quiet-hour reject).
  lastNotifyAtByKey.set(dedupeKey, now)

  return { guard }
}
