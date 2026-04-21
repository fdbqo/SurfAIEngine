import type { User } from "./User"

export type EngineUserContext = {
  skill: "beginner" | "intermediate" | "advanced"
  riskTolerance: "low" | "medium" | "high"
  notifyStrictness?: "strict" | "moderate" | "lenient"
  homeRegion?: string
  usualRegions?: string[]
  notificationsEnabled: boolean
}

export function toEngineUserContext(user: User): EngineUserContext {
  return {
    skill: user.skill,
    riskTolerance: user.preferences.riskTolerance,
    notifyStrictness: user.preferences.notifyStrictness,
    homeRegion: user.homeRegion,
    usualRegions: user.usualRegions,
    notificationsEnabled: user.notificationSettings.enabled
  }
}
