import { headers } from "next/headers"

// Extract client IP from request headers
export async function getClientIp(): Promise<string | null> {
  const h = await headers()

  const forwardedFor = h.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim()
  }

  return h.get("x-real-ip")
}

// Ignore local/dev IPs
export function shouldIgnoreIp(ip: string | null): boolean {
  if (!ip) return true
  
  const ignored = ["127.0.0.1", "::1", "localhost"]
  return ignored.includes(ip)
}
