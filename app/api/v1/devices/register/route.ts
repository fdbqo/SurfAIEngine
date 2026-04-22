import { NextResponse } from "next/server"
import { z } from "zod"
import { getOrInitSchedule, registerDeviceTarget } from "@/lib/notifications/notifications"
import { ensureDeviceAuth, getDeviceProfileByDeviceId, upsertDeviceProfile } from "@/lib/db/services/deviceProfileService"

export const runtime = "nodejs"

const ProfileFieldsSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  units: z
    .object({
      waveHeight: z.string().optional(),
      windSpeed: z.string().optional(),
      distance: z.string().optional(),
    })
    .optional(),
  preferences: z.record(z.unknown()).optional(),
  notificationSettings: z.object({ enabled: z.boolean() }).optional(),
  usualLocation: z.object({ lat: z.number(), lon: z.number() }).optional(),
  lastLocation: z.unknown().optional(),
  skill: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  homeRegion: z.string().optional(),
  usualRegions: z.array(z.string()).optional(),
})

const WebpushSchema = z
  .object({
    userId: z.string().min(1).max(200),
    deviceId: z.string().min(1).max(200),
    channel: z.literal("webpush"),
    platform: z.literal("web").optional(),
    subscription: z.object({
      endpoint: z.string().min(10),
      expirationTime: z.number().nullable().optional(),
      keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      }),
    }),
  })
  .merge(ProfileFieldsSchema)

const ExpoSchema = z
  .object({
    userId: z.string().min(1).max(200),
    deviceId: z.string().min(1).max(200),
    channel: z.literal("expo"),
    platform: z.enum(["android", "ios"]).optional(),
    expoToken: z.string().min(10),
  })
  .merge(ProfileFieldsSchema)

const BodySchema = z.union([WebpushSchema, ExpoSchema])

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid request body"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  try {
    const b = parsed.data
    const deviceId = b.deviceId

    // One canonical userId per device: if a profile already exists, always use its userId
    // for targets + schedule (ignores a mismatched userId in the body, e.g. client sent deviceId as userId once).
    const existing = await getDeviceProfileByDeviceId(deviceId)
    const effectiveUserId = existing?.userId ?? b.userId
    if (process.env.DEVICE_AUTH_DEBUG === "1" && existing && b.userId !== effectiveUserId) {
      // eslint-disable-next-line no-console
      console.warn("[devices/register] using stored userId (body mismatch)", { deviceId, bodyUserId: b.userId, effectiveUserId })
    }

    if (b.channel === "webpush") {
      await registerDeviceTarget({
        userId: effectiveUserId,
        channel: "webpush",
        deviceId,
        platform: "web",
        subscription: b.subscription as unknown as PushSubscriptionJSON,
      })
    } else {
      await registerDeviceTarget({
        userId: effectiveUserId,
        channel: "expo",
        deviceId,
        platform: b.platform,
        expoToken: b.expoToken,
      })
      // eslint-disable-next-line no-console
      console.info("[devices/register] expo", {
        userId: effectiveUserId,
        deviceId,
        bodyUserId: b.userId,
        userIdOverridden: b.userId !== effectiveUserId,
        platform: b.platform,
      })
    }

    const prefs =
      b.preferences && typeof b.preferences === "object" ? (b.preferences as Record<string, unknown>) : {}

    const profile = await upsertDeviceProfile({
      deviceId,
      userId: effectiveUserId,
      onboardingCompleted: b.onboardingCompleted,
      units: b.units,
      skill: b.skill,
      preferences: prefs,
      notificationSettings: b.notificationSettings,
      usualLocation: b.usualLocation,
      lastLocation: b.lastLocation,
      homeRegion: b.homeRegion,
      usualRegions: b.usualRegions,
    })

    // One schedule document per userId; fan-out to devices is via devicetargets for that userId.
    await getOrInitSchedule(profile.userId)

    const auth = await ensureDeviceAuth(deviceId)
    return NextResponse.json({ ok: true, ...(auth.minted ? { deviceToken: auth.deviceToken } : {}) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}
