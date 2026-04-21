import { Annotation } from "@langchain/langgraph"
import type { User } from "@/types/user/User"
import type { SpotConditions } from "@/lib/shared/types"
import type { Spot } from "@/lib/shared/spots"

export type AgentMode = "LIVE_NOTIFY" | "FORECAST_PLANNER"

// Normalized user context (from loadUserContext)
export type AgentUserContext = {
  skillLevel: "beginner" | "intermediate" | "advanced"
  /** Usual/home location (saved). Used when current location is unavailable. */
  usualLocation?: { lat: number; lon: number }
  /** Current location when available (e.g. from GPS). */
  currentLocation?: { lat: number; lon: number }
  maxDistanceKm?: number
  preferredBreaks?: Array<"beach" | "reef" | "point" | "bay" | "harbour" | "island">
  riskTolerance?: "low" | "medium" | "high"
  notifyThreshold?: "good" | "great"
  quietHours?: { start: string; end: string }
  favorites?: string[]
  rawUser: User
}

/** Prefer current location (e.g. GPS) when available, else usual location. */
export function getLocationForDistance(ctx: AgentUserContext | null | undefined): { lat: number; lon: number } | undefined {
  if (!ctx) return undefined
  return ctx.currentLocation ?? ctx.usualLocation
}

export type SpotInfo = {
  spotId: string
  name: string
  lat: number
  lon: number
  breakType?: string
  region?: string
}

export type InterpretedSpot = {
  nowText?: string
  forecastText?: string
  windLabel?: "offshore" | "cross" | "onshore" | "unknown"
  windStrengthLabel?: "light" | "moderate" | "strong"
  swellQualityLabel?: "poor" | "ok" | "good" | "excellent"
  waveSizeLabel?: "flat" | "small" | "medium" | "large"
  envQualityScoreNow?: number
  envQualityScoreBest3h?: number
  bestWindow?: { start: Date; end: Date; label: "morning" | "midday" | "afternoon" | "evening" }
  hazards?: string[]
}

export type ScoredSpot = {
  spotId: string
  envScore: number
  userSuitability: number
  bestWindow?: { start: Date; end: Date }
  reasons: string[]
  /** Distance from user home to spot (km). Used for timing feasibility. */
  distanceKm?: number
}

export type CandidateSummary = {
  spotId: string
  summary: string
  envScore: number
  userSuitability: number
  /** Distance from user home to spot (km). */
  distanceKm?: number
  /** Time-of-day label for "now" (e.g. early_morning, afternoon). */
  timeOfDayLabel?: string
}

export type ForecastWindow = {
  spotId: string
  spotName: string
  start: Date
  end: Date
  envScore: number
  userSuitability: number
  summary: string
  /** Distance from user home to spot (km). */
  distanceKm?: number
  /** Hours from now until window start. */
  hoursUntilStart?: number
  /** Time-of-day label for window start (e.g. early_morning, afternoon). */
  timeOfDayLabel?: string
  /** 0–1; today/tomorrow = 1, further out reduced so user/model know forecast is less certain. */
  forecastConfidence?: number
}

export type AgentDecision = {
  notify: boolean
  spotId?: string
  when?: "now" | "next_window"
  windowStart?: Date
  windowEnd?: Date
  title?: string
  message?: string
  rationale?: string
  whyNotOthers?: string[]
  confidence?: number
}

export type AgentReview = {
  verdict: "approve" | "revise" | "reject"
  issues?: string[]
  revisedDecision?: AgentDecision
}

export type NotificationGuardResult = {
  allowed: boolean
  blockedReason?: string
  dedupeKey?: string
}

export type RunLogEntry = {
  step: number
  ts: string
  summary: string
  detail?: unknown
}

export type LastNotificationEntry = { spotId: string; timestamp: string }

// LangGraph state (matches doc shape; nodes read/write partials)
export interface SurfAgentState {
  userId: string
  mode: AgentMode
  /** Recent notifications sent to this user (e.g. from API). Agent can avoid re-notifying same spot. */
  lastNotifications?: LastNotificationEntry[]
  stepCount?: number
  runLog?: RunLogEntry[]
  pendingToolCall?: {
    tool: "get_user_preferences" | "get_spots_near_user" | "get_spots_in_region" | "get_surf_conditions_batch"
    args: Record<string, unknown>
  } | null
  user?: AgentUserContext | null
  spotIds?: string[]
  spots?: SpotInfo[]
  hourliesBySpot?: Record<string, SpotConditions | null>
  forecast3hBySpot?: Record<string, Array<Record<string, unknown>>>
  forecastDailyBySpot?: Record<string, Array<Record<string, unknown>>>
  interpretedBySpot?: Record<string, InterpretedSpot>
  scored?: ScoredSpot[]
  topCandidates?: CandidateSummary[]
  forecastWindows?: ForecastWindow[]
  decision?: AgentDecision | null
  review?: AgentReview | null
  /** Number of times we've retried the LLM after revise/reject (cap at 1). */
  llmRetryCount?: number
  guard?: NotificationGuardResult | null
}

// Annotation for StateGraph (each key last-value wins)
const SurfAgentStateAnnotation = Annotation.Root({
  userId: Annotation<string>(),
  mode: Annotation<AgentMode>(),
  lastNotifications: Annotation<LastNotificationEntry[]>(),
  stepCount: Annotation<number>(),
  runLog: Annotation<RunLogEntry[]>(),
  pendingToolCall: Annotation<SurfAgentState["pendingToolCall"]>(),
  user: Annotation<AgentUserContext | null>(),
  spotIds: Annotation<string[]>(),
  spots: Annotation<SpotInfo[]>(),
  hourliesBySpot: Annotation<Record<string, SpotConditions | null>>(),
  forecast3hBySpot: Annotation<Record<string, Array<Record<string, unknown>>>>(),
  forecastDailyBySpot: Annotation<Record<string, Array<Record<string, unknown>>>>(),
  interpretedBySpot: Annotation<Record<string, InterpretedSpot>>(),
  scored: Annotation<ScoredSpot[]>(),
  topCandidates: Annotation<CandidateSummary[]>(),
  forecastWindows: Annotation<ForecastWindow[]>(),
  decision: Annotation<AgentDecision | null>(),
  review: Annotation<AgentReview | null>(),
  llmRetryCount: Annotation<number>(),
  guard: Annotation<NotificationGuardResult | null>(),
})

export { SurfAgentStateAnnotation }
export type SurfAgentStateType = typeof SurfAgentStateAnnotation.State
