import type { User } from "@/types/user/User"
import type { UserLocation } from "@/types/user/UserLocation"
import type { IDeviceProfile } from "./models/DeviceProfile"

function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

function asNum(v: unknown): number | null | undefined {
  if (v === null) return null
  if (typeof v === "number" && Number.isFinite(v)) return v
  return undefined
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined
}

/** map device profile data into user shape */
export function deviceProfileToUser(doc: IDeviceProfile | Record<string, unknown>): User {
  const d = doc as IDeviceProfile
  const p = d.preferences && typeof d.preferences === "object" ? (d.preferences as Record<string, unknown>) : {}

  const risk =
    (p.riskTolerance as User["preferences"]["riskTolerance"] | undefined) ?? "low"
  const strict =
    (p.notifyStrictness as User["preferences"]["notifyStrictness"] | undefined) ?? "moderate"

  const skillFromPrefs = asStr(p.skill) ?? asStr(p.skillLevel)
  const skill: User["skill"] =
    d.skill ??
    (skillFromPrefs === "beginner" || skillFromPrefs === "intermediate" || skillFromPrefs === "advanced"
      ? skillFromPrefs
      : "intermediate")

  const lastLocation: User["lastLocation"] | undefined = d.lastLocation
    ? {
        lat: d.lastLocation.lat,
        lon: d.lastLocation.lon,
        source: d.lastLocation.source ?? "gps",
        confidence: d.lastLocation.confidence ?? "high",
        updatedAt: d.lastLocation.updatedAt ? new Date(d.lastLocation.updatedAt) : new Date(),
      }
    : undefined

  return {
    id: d.userId,
    skill,
    preferences: {
      riskTolerance: risk,
      notifyStrictness: strict,
      minWaveHeightFt: asNum(p.minWaveHeightFt) ?? null,
      maxWaveHeightFt: asNum(p.maxWaveHeightFt) ?? null,
      maxWindSpeedKnots: asNum(p.maxWindSpeedKnots) ?? null,
      maxDistanceKm: asNum(p.maxDistanceKm) ?? null,
      reefAllowed: asBool(p.reefAllowed) ?? true,
      sandAllowed: asBool(p.sandAllowed) ?? true,
      minSwellPeriodSec: asNum(p.minSwellPeriodSec) ?? null,
      freeText: asStr(p.freeText) ?? "",
    },
    notificationSettings: {
      enabled: d.notificationSettings?.enabled !== false,
    },
    units: d.units,
    usualLocation: d.usualLocation,
    lastLocation,
    homeRegion: d.homeRegion,
    usualRegions: d.usualRegions,
    createdAt: d.createdAt instanceof Date ? d.createdAt : new Date(),
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt : new Date(),
  }
}

/** parse loose last location input */
export function coerceLastLocation(
  input: unknown
): UserLocation | undefined {
  if (!input || typeof input !== "object") return undefined
  const o = input as Record<string, unknown>
  const lat = o.lat
  const lon = o.lon
  if (typeof lat !== "number" || typeof lon !== "number") return undefined
  const source = o.source
  const conf = o.confidence
  return {
    lat,
    lon,
    source: source === "ip" || source === "manual" || source === "gps" ? source : "gps",
    confidence: conf === "low" || conf === "high" ? conf : "high",
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt : new Date(String(o.updatedAt ?? Date.now())),
  }
}
