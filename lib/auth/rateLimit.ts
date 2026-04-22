type Bucket = { count: number; resetAtMs: number }

const buckets = new Map<string, Bucket>()

function nowMs() {
  return Date.now()
}

export function rateLimit(args: {
  key: string
  limit: number
  windowMs: number
}): { ok: true; remaining: number; resetAtMs: number } | { ok: false; retryAfterMs: number; resetAtMs: number } {
  const t = nowMs()
  const b = buckets.get(args.key)
  if (!b || t >= b.resetAtMs) {
    const resetAtMs = t + args.windowMs
    buckets.set(args.key, { count: 1, resetAtMs })
    return { ok: true, remaining: Math.max(0, args.limit - 1), resetAtMs }
  }
  if (b.count >= args.limit) {
    return { ok: false, retryAfterMs: Math.max(0, b.resetAtMs - t), resetAtMs: b.resetAtMs }
  }
  b.count += 1
  buckets.set(args.key, b)
  return { ok: true, remaining: Math.max(0, args.limit - b.count), resetAtMs: b.resetAtMs }
}

export function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for")
  if (xf) return xf.split(",")[0]!.trim()
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}

