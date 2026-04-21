import type { Spot } from "./spots/Spot"

// Spot type alias (canonical: Spot)
export type SpotLocation = Spot

export interface SpotConditions {
  spotId: string
  swellHeight: number
  swellPeriod: number
  swellDirection: number
  waveHeight: number
  wavePeriod: number
  windSpeed: number // km/h at 2m
  windSpeed10m: number // km/h at 10m
  windSpeed2m: number // km/h at 2m
  windDirection: number
  score?: number
  aiReasoning?: string
  localTime?: string // from hourly data (spot timezone)
  localHour?: number // 0-23 in spot timezone
}

export interface SurfScore {
  score: number
  reasons: string[]
}

