import type { User } from "@/types/user/User"

/** Example/test users only; regions and coords are sample data for development. */
export const mockUser: User = {
  id: "test-user-1",
  skill: "beginner",
  preferences: {
    // legacy field
    riskTolerance: "low",

    // new schema fields
    notifyStrictness: "lenient",
    minWaveHeightFt: 2,
    maxWaveHeightFt: 5,
    maxWindSpeedKnots: 15,
    maxDistanceKm: 50,
    reefAllowed: true,
    sandAllowed: true,
    minSwellPeriodSec: 8,
    freeText: "I prefer surfing in Sligo.",
  },
  notificationSettings: {
    enabled: true,
  },
  usualLocation: { lat: 54.27, lon: -8.6 },
  lastLocation: {
    lat: 54.2713,
    lon: -8.6017,
    source: "gps",
    confidence: "high",
    updatedAt: new Date("2026-01-19T10:30:00.000Z"),
  },
  homeRegion: "Connacht",
  usualRegions: ["Connacht"],
  createdAt: new Date("2026-01-01T09:00:00.000Z"),
  updatedAt: new Date("2026-01-19T10:30:00.000Z"),
}

export const mockUserAdvanced: User = {
  id: "test-user-advanced",
  skill: "advanced",
  preferences: {
    // legacy field
    riskTolerance: "high",

    // new schema fields
    notifyStrictness: "lenient",
    maxDistanceKm: 120,
    reefAllowed: true,
    sandAllowed: true,
  },
  notificationSettings: {
    enabled: true,
  },
  usualLocation: { lat: 54.15, lon: -8.32 },
  lastLocation: {
    lat: 54.147127,
    lon: -8.319760,
    source: "gps",
    confidence: "high",
    updatedAt: new Date("2026-01-19T08:45:00.000Z"),
  },
  homeRegion: "Connacht",
  usualRegions: ["Connacht"],
  createdAt: new Date("2025-12-01T12:00:00.000Z"),
  updatedAt: new Date("2026-01-19T08:45:00.000Z"),
}

/** User with usual location only (no current GPS). Distance/near-user logic uses usual location. */
export const mockUserNoCurrentLocation: User = {
  id: "test-user-no-gps",
  skill: "intermediate",
  preferences: {
    // legacy field
    riskTolerance: "medium",

    // new schema fields
    notifyStrictness: "moderate",
    maxDistanceKm: 50,
    reefAllowed: true,
    sandAllowed: true,
  },
  notificationSettings: { enabled: true },
  usualLocation: { lat: 53.27, lon: -9.0 },
  homeRegion: "Connacht",
  usualRegions: ["Connacht"],
  createdAt: new Date("2026-01-01T09:00:00.000Z"),
  updatedAt: new Date("2026-01-19T10:00:00.000Z"),
}

export const mockUsers = [mockUser, mockUserAdvanced, mockUserNoCurrentLocation]

export function getMockUser(userId: string): User | null {
  return mockUsers.find((u) => u.id === userId) ?? null
}
