import type { NextRequest } from "next/server"

/** gateway checks for ui, cors, and internal key */

/** public ui enabled flag */
export function isPublicUiEnabled(): boolean {
  const v = process.env.PUBLIC_UI_ENABLED
  return v === "true" || v === "1"
}

/** whether to block html and next assets */
export function shouldBlockPublicUi(): boolean {
  if (isPublicUiEnabled()) return false
  if (process.env.NODE_ENV !== "production") return false
  return true
}

const DEFAULT_ORIGIN_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
const DEFAULT_ORIGIN_HEADERS =
  "Content-Type, Authorization, x-internal-api-key, X-Requested-With, x-device-id, x-engine-key"

function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? ""
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** routes that skip internal key check */
const DEFAULT_INTERNAL_API_KEY_SKIP_PREFIXES = [
  "/api/push/vapid-public-key",
  "/api/push/subscribe",
  "/api/cron",
  "/api/location/fallback",
  "/api/v1/devices",
  "/api/v1/device-profiles",
  "/api/v1/transfer",
  "/api/v1/profile",
  "/api/v1/users",
] as const

function internalApiKeySkipPrefixes(): string[] {
  const override = process.env.INTERNAL_API_SKIP_PATHS?.trim()
  if (override) {
    return override
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [...DEFAULT_INTERNAL_API_KEY_SKIP_PREFIXES]
}

export function shouldSkipInternalApiKey(pathname: string): boolean {
  return internalApiKeySkipPrefixes().some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** block browser origin when not allowlisted */
export function isBrowserOriginForbidden(request: NextRequest): boolean {
  const allowed = parseAllowedOrigins()
  const origin = request.headers.get("origin")
  if (!origin || allowed.length === 0) return false
  return !allowed.includes(origin)
}

export function isInternalApiSecretInvalid(request: NextRequest, pathname: string): boolean {
  const secret = process.env.INTERNAL_API_SECRET?.trim()
  if (!secret) return false
  if (shouldSkipInternalApiKey(pathname)) return false
  const headerKey = request.headers.get("x-internal-api-key")
  const auth = request.headers.get("authorization")
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null
  const token = headerKey ?? bearer
  return token !== secret
}

export function applyCorsHeaders(request: NextRequest, target: Headers): void {
  const allowed = parseAllowedOrigins()
  const origin = request.headers.get("origin")
  if (origin && allowed.includes(origin)) {
    target.set("Access-Control-Allow-Origin", origin)
    target.set("Vary", "Origin")
    target.set("Access-Control-Allow-Credentials", "true")
  }
  target.set("Access-Control-Allow-Methods", DEFAULT_ORIGIN_METHODS)
  target.set("Access-Control-Allow-Headers", DEFAULT_ORIGIN_HEADERS)
  target.set("Access-Control-Max-Age", "86400")
}
