/** time labels and lead-time helpers */

export type TimeOfDayLabel =
  | "early_morning"
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night"

// local-hour boundaries
const EARLY_MORNING_START = 5
const MORNING_START = 8
const MIDDAY_START = 12
const AFTERNOON_START = 14
const EVENING_START = 18
const NIGHT_START = 21

export function getTimeOfDayLabel(localHour: number): TimeOfDayLabel {
  const h = localHour % 24
  if (h >= NIGHT_START || h < EARLY_MORNING_START) return "night"
  if (h < MORNING_START) return "early_morning"
  if (h < MIDDAY_START) return "morning"
  if (h < AFTERNOON_START) return "midday"
  if (h < EVENING_START) return "afternoon"
  return "evening"
}

/** hours until window start */
export function getHoursUntil(windowStart: Date, now: Date): number {
  return (windowStart.getTime() - now.getTime()) / (60 * 60 * 1000)
}

import { agentConfig } from "../config"

export function getFutureDiscountFactor(hoursUntilStart: number): number {
  const { hoursNoDecrease, minFactor, hoursAtMin } = agentConfig.notificationTiming
  if (hoursUntilStart <= hoursNoDecrease) return 1
  if (hoursUntilStart >= hoursAtMin) return minFactor
  const linear = 1 - (1 - minFactor) * ((hoursUntilStart - hoursNoDecrease) / (hoursAtMin - hoursNoDecrease))
  return Math.round(linear * 100) / 100
}

/** friendly time label for prompts */
export function formatTimeOfDayForPrompt(label: TimeOfDayLabel): string {
  switch (label) {
    case "early_morning":
      return "early morning"
    case "morning":
      return "morning"
    case "midday":
      return "midday"
    case "afternoon":
      return "afternoon"
    case "evening":
      return "evening"
    case "night":
      return "night"
    default:
      return String(label)
  }
}
