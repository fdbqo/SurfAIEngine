import { NextResponse } from "next/server"
import { z } from "zod"
import { patchDeviceProfile } from "@/lib/db/services/deviceProfileService"
import { requireDeviceAuth } from "@/lib/auth/deviceAuth"

export const runtime = "nodejs"

const BodySchema = z
  .object({
    userId: z.string().min(1).max(200).optional(),
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

function engineKeyOk(req: Request): boolean {
  const expected = process.env.ENGINE_API_KEY?.trim()
  if (!expected) return false
  return req.headers.get("x-engine-key") === expected
}

type RouteContext = { params: Promise<{ deviceId: string }> }

export async function PATCH(req: Request, context: RouteContext) {
  const { deviceId: encoded } = await context.params
  const deviceId = decodeURIComponent(encoded)

  // Auth: allow internal engine key OR per-device token.
  if (!engineKeyOk(req)) {
    try {
      await requireDeviceAuth(req, deviceId)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 })
    }
  }

  const raw = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors.join("; ") || "Invalid request body"
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    const doc = await patchDeviceProfile(deviceId, parsed.data)
    if (!doc) {
      return NextResponse.json({ error: "Device profile not found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true, deviceId: doc.deviceId, updatedAt: doc.updatedAt })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}
