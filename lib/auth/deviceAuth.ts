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
  if (!token) throw new Error("Missing device auth token")
  const tokenHash = hashDeviceToken(token)

  const profile = await DeviceProfileModel.findOne({ deviceId }).lean()
  const expectedHash = (profile as any)?.deviceAuthHash
  if (typeof expectedHash !== "string" || expectedHash.length < 10) {
    throw new Error("Device auth not initialized; re-register device")
  }
  if (tokenHash !== expectedHash) throw new Error("Invalid device auth token")
  return profile as any
}

