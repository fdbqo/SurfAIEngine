export type PublicDeviceProfile = {
  deviceId: string
  userId: string
  onboardingCompleted?: boolean
  units?: {
    waveHeight?: string
    windSpeed?: string
    distance?: string
  }
  skill?: "beginner" | "intermediate" | "advanced"
  preferences: Record<string, unknown>
  notificationSettings?: { enabled: boolean }
  usualLocation?: { lat: number; lon: number }
  lastLocation?: {
    lat: number
    lon: number
    source?: "gps" | "ip" | "manual"
    confidence?: "high" | "low"
    updatedAt?: string
  }
  homeRegion?: string
  usualRegions?: string[]
  updatedAt?: string
  createdAt?: string
}

export function toPublicDeviceProfile(doc: any): PublicDeviceProfile {
  const last = doc?.lastLocation
  return {
    deviceId: String(doc.deviceId),
    userId: String(doc.userId),
    onboardingCompleted: doc.onboardingCompleted,
    units: doc.units,
    skill: doc.skill,
    preferences:
      doc.preferences && typeof doc.preferences === "object" ? (doc.preferences as Record<string, unknown>) : {},
    notificationSettings: doc.notificationSettings,
    usualLocation: doc.usualLocation,
    lastLocation: last
      ? {
          lat: last.lat,
          lon: last.lon,
          source: last.source,
          confidence: last.confidence,
          updatedAt: last.updatedAt instanceof Date ? last.updatedAt.toISOString() : last.updatedAt,
        }
      : undefined,
    homeRegion: doc.homeRegion,
    usualRegions: Array.isArray(doc.usualRegions) ? doc.usualRegions : undefined,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  }
}
