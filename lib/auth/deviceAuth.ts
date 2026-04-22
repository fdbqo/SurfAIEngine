import crypto from "crypto"
import connectDB from "@/lib/db/connect"
import { DeviceProfileModel } from "@/lib/db/models/DeviceProfile"

function tokenSecret(): string {
  const s =
    process.env.DEVICE_AUTH_SECRET?.trim() ||
    process.env.TRANSFER_CODE_SECRET?.trim() ||
    process.env.INTERNAL_API_SECRET?.trim()
  if (process.env.NODE_ENV === "production" && !s) {
    throw new Error("DEVICE_AUTH_SECRET must be set in production")
  }
  return s || "dev-device-auth-secret"
}

export function hashDeviceToken(token: string): string {
  return crypto.createHmac("sha256", tokenSecret()).update(token).digest("hex")
}

export function mintDeviceToken(): string {
  // 32 bytes => 64 hex chars
  return crypto.randomBytes(32).toString("hex")
}

function bearerFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization")
  if (!auth) return null
  if (!auth.startsWith("Bearer ")) return null
  return auth.slice(7).trim() || null
}

export async function requireDeviceAuth(req: Request, deviceId: string) {
  await connectDB()
  const token = bearerFromRequest(req)
  const debug = process.env.DEVICE_AUTH_DEBUG === "true" || process.env.DEVICE_AUTH_DEBUG === "1"
  if (!token) {
    if (debug) console.info("[deviceAuth] missing token", { deviceId })
    throw new Error("Missing device auth token")
  }
  const tokenHash = hashDeviceToken(token)

  // deviceAuthHash is select:false on the schema; must explicitly request it.
  const profile = await DeviceProfileModel.findOne({ deviceId }).select("+deviceAuthHash").lean()
  const expectedHash = (profile as any)?.deviceAuthHash
  if (typeof expectedHash !== "string" || expectedHash.length < 10) {
    if (debug) {
      console.info("[deviceAuth] not initialized", {
        deviceId,
        hasProfile: !!profile,
        userId: (profile as any)?.userId,
        expectedHashType: typeof expectedHash,
      })
    }
    throw new Error("Device auth not initialized; re-register device")
  }
  if (tokenHash !== expectedHash) {
    if (debug) {
      console.info("[deviceAuth] token mismatch", {
        deviceId,
        userId: (profile as any)?.userId,
        tokenHashPrefix: tokenHash.slice(0, 8),
        expectedHashPrefix: expectedHash.slice(0, 8),
      })
    }
    throw new Error("Invalid device auth token")
  }

  if (debug) {
    console.info("[deviceAuth] ok", {
      deviceId,
      userId: (profile as any)?.userId,
      tokenHashPrefix: tokenHash.slice(0, 8),
      expectedHashPrefix: expectedHash.slice(0, 8),
    })
  }

  return profile as any
}

