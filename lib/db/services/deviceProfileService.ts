import connectDB from "../connect"
import { DeviceProfileModel, type IDeviceProfile } from "../models/DeviceProfile"
import { deviceProfileToUser, coerceLastLocation } from "../profileToUser"
import type { User } from "@/types/user/User"
import { hashDeviceToken, mintDeviceToken } from "@/lib/auth/deviceAuth"

export type UpsertDeviceProfileInput = {
  deviceId: string
  userId: string
  onboardingCompleted?: boolean
  units?: { waveHeight?: string; windSpeed?: string; distance?: string }
  skill?: "beginner" | "intermediate" | "advanced"
  preferences?: Record<string, unknown>
  notificationSettings?: { enabled: boolean }
  usualLocation?: { lat: number; lon: number }
  lastLocation?: unknown
  homeRegion?: string
  usualRegions?: string[]
}

function normalizeUpsert(
  input: UpsertDeviceProfileInput
): Partial<IDeviceProfile> & { deviceId: string; userId: string; preferences: Record<string, unknown> } {
  const lastLoc = input.lastLocation ? coerceLastLocation(input.lastLocation) : undefined
  return {
    deviceId: input.deviceId,
    userId: input.userId,
    onboardingCompleted: input.onboardingCompleted,
    units: input.units,
    skill: input.skill,
    preferences: input.preferences ?? {},
    notificationSettings: input.notificationSettings,
    usualLocation: input.usualLocation,
    ...(lastLoc
      ? {
          lastLocation: {
            lat: lastLoc.lat,
            lon: lastLoc.lon,
            source: lastLoc.source,
            confidence: lastLoc.confidence,
            updatedAt: lastLoc.updatedAt,
          },
        }
      : {}),
    homeRegion: input.homeRegion,
    usualRegions: input.usualRegions,
  }
}

export async function upsertDeviceProfile(input: UpsertDeviceProfileInput): Promise<IDeviceProfile> {
  await connectDB()
  const n = normalizeUpsert(input)
  const doc = await DeviceProfileModel.findOneAndUpdate(
    { deviceId: n.deviceId },
    { $set: n },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean()
  if (!doc) throw new Error("upsertDeviceProfile failed")
  return doc as IDeviceProfile
}

export async function patchDeviceProfile(
  deviceId: string,
  partial: Partial<Omit<UpsertDeviceProfileInput, "deviceId" | "userId">> & { userId?: string }
): Promise<IDeviceProfile | null> {
  await connectDB()
  const $set: Record<string, unknown> = {}
  if (partial.onboardingCompleted !== undefined) $set.onboardingCompleted = partial.onboardingCompleted
  if (partial.units !== undefined) $set.units = partial.units
  if (partial.skill !== undefined) $set.skill = partial.skill
  if (partial.preferences !== undefined) {
    const existing = await DeviceProfileModel.findOne({ deviceId }).lean()
    const prev = (existing?.preferences && typeof existing.preferences === "object"
      ? (existing.preferences as Record<string, unknown>)
      : {}) as Record<string, unknown>
    $set.preferences = { ...prev, ...partial.preferences }
  }
  if (partial.notificationSettings !== undefined) $set.notificationSettings = partial.notificationSettings
  if (partial.usualLocation !== undefined) $set.usualLocation = partial.usualLocation
  if (partial.lastLocation !== undefined) {
    const c = coerceLastLocation(partial.lastLocation)
    if (c) {
      $set.lastLocation = {
        lat: c.lat,
        lon: c.lon,
        source: c.source,
        confidence: c.confidence,
        updatedAt: c.updatedAt,
      }
    }
  }
  if (partial.homeRegion !== undefined) $set.homeRegion = partial.homeRegion
  if (partial.usualRegions !== undefined) $set.usualRegions = partial.usualRegions
  if (partial.userId !== undefined) $set.userId = partial.userId

  if (Object.keys($set).length === 0) {
    return (await DeviceProfileModel.findOne({ deviceId }).lean()) as IDeviceProfile | null
  }

  const doc = await DeviceProfileModel.findOneAndUpdate(
    { deviceId },
    { $set },
    { new: true }
  ).lean()
  return doc as IDeviceProfile | null
}

export async function getDeviceProfileByDeviceId(deviceId: string): Promise<IDeviceProfile | null> {
  await connectDB()
  return (await DeviceProfileModel.findOne({ deviceId }).lean()) as IDeviceProfile | null
}

/** ensure device auth token exists */
export async function ensureDeviceAuth(deviceId: string): Promise<{ minted: boolean; deviceToken?: string }> {
  await connectDB()
  // include hash field in query
  const existing = await DeviceProfileModel.findOne({ deviceId }).select("+deviceAuthHash").lean()
  const have = existing && typeof (existing as any).deviceAuthHash === "string" && (existing as any).deviceAuthHash.length > 10
  if (have) return { minted: false }

  const deviceToken = mintDeviceToken()
  const deviceAuthHash = hashDeviceToken(deviceToken)
  await DeviceProfileModel.updateOne({ deviceId }, { $set: { deviceAuthHash } })
  return { minted: true, deviceToken }
}

export async function getDeviceProfileByUserId(userId: string): Promise<IDeviceProfile | null> {
  await connectDB()
  return (await DeviceProfileModel.findOne({ userId }).sort({ updatedAt: -1 }).lean()) as IDeviceProfile | null
}

/** resolve user by device id or user id */
export async function getUserFromDeviceStore(userIdOrDeviceId: string): Promise<User | null> {
  await connectDB()
  const byDevice = await getDeviceProfileByDeviceId(userIdOrDeviceId)
  if (byDevice) return deviceProfileToUser(byDevice)
  const byUser = await getDeviceProfileByUserId(userIdOrDeviceId)
  if (byUser) return deviceProfileToUser(byUser)
  return null
}

/** list cron-eligible profiles */
export async function listDeviceProfilesForCron(): Promise<IDeviceProfile[]> {
  await connectDB()
  const rows = await DeviceProfileModel.find({
    $and: [
      { $nor: [{ onboardingCompleted: false }] },
      { $nor: [{ "notificationSettings.enabled": false }] },
    ],
  })
    .sort({ updatedAt: 1 })
    .lean()
  return rows as IDeviceProfile[]
}
