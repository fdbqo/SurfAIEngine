import type { UserLocation } from "./UserLocation"

/** saved home location */
export type UsualLocation = { lat: number; lon: number }

export type User = {
  id: string

  skill: "beginner" | "intermediate" | "advanced"

  preferences: {
    /**
     * legacy field
     */
    riskTolerance: "low" | "medium" | "high"

    /**
     * notification strictness
     * strict means fewer alerts
     */
    notifyStrictness?: "strict" | "moderate" | "lenient"

    /** optional numeric limits */
    minWaveHeightFt?: number | null
    maxWaveHeightFt?: number | null
    maxWindSpeedKnots?: number | null
    maxDistanceKm?: number | null
    reefAllowed?: boolean
    sandAllowed?: boolean
    minSwellPeriodSec?: number | null

    /** optional user note */
    freeText?: string
  }

  notificationSettings: {
    enabled: boolean
  }

  /** optional display units */
  units?: {
    waveHeight?: string
    windSpeed?: string
    distance?: string
  }

  /** home location fallback */
  usualLocation?: UsualLocation

  /** latest location */
  lastLocation?: UserLocation

  homeRegion?: string
  usualRegions?: string[]

  createdAt: Date
  updatedAt: Date
}
