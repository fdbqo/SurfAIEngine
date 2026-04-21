import type { UserLocation } from "./UserLocation"

/** User's usual/home location (saved). Used when current location is unavailable. */
export type UsualLocation = { lat: number; lon: number }

export type User = {
  id: string

  skill: "beginner" | "intermediate" | "advanced"

  preferences: {
    /**
     * Legacy field we still keep.
     */
    riskTolerance: "low" | "medium" | "high"

    /**
     * How picky notifications should be (drives distance decay + notify threshold).
     * strict = fewer alerts, lenient = more alerts.
     */
    notifyStrictness?: "strict" | "moderate" | "lenient"

    /** Optional numeric constraints (units match onboarding UI). */
    minWaveHeightFt?: number | null
    maxWaveHeightFt?: number | null
    maxWindSpeedKnots?: number | null
    maxDistanceKm?: number | null
    reefAllowed?: boolean
    sandAllowed?: boolean
    minSwellPeriodSec?: number | null

    /** Optional user note for the agent/LLM (not a hard rule). */
    freeText?: string
  }

  notificationSettings: {
    enabled: boolean
  }

  /** Usual/home location (saved). Fallback when current location is missing. */
  usualLocation?: UsualLocation

  /** Current location when available (e.g. from GPS). */
  lastLocation?: UserLocation

  homeRegion?: string
  usualRegions?: string[]

  createdAt: Date
  updatedAt: Date
}
