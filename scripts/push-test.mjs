#!/usr/bin/env node
/**
 * Fire POST /api/push/send-test against a deployed (or local) engine.
 *
 * Vercel: set env before running (PowerShell or bash):
 *   ENGINE_BASE_URL=https://your-app.vercel.app
 *   INTERNAL_API_SECRET=...   (same as Vercel project env, if you use the gateway)
 *   PUSH_TEST_USER_ID=web:...
 *
 *   npm run push:test
 *   node scripts/push-test.mjs "web:your-uuid"
 *
 * PowerShell prints the JSON body here. Server `console` lines (e.g. [push/send-test]) appear:
 *   - Vercel: dashboard → Logs, or `vercel logs <deployment-url> --follow` (Vercel CLI)
 *   - Local: the terminal where `npm run dev` is running, not this window
 *
 * Android: no separate "run" — same request delivers to any Expo token registered
 * in Mongo for that userId. Ensure the app called POST /api/v1/devices/register with
 * channel expo, then leave the app in background and run this from your PC.
 */

const base = (process.env.ENGINE_BASE_URL || process.env.VERCEL_URL || "").replace(/\/$/, "")
const secret = process.env.INTERNAL_API_SECRET?.trim()
const userId = process.argv[2]?.trim() || process.env.PUSH_TEST_USER_ID?.trim()

if (!base) {
  console.error("Set ENGINE_BASE_URL to your engine origin, e.g. https://surf-ai-engine.vercel.app")
  process.exit(1)
}
if (!userId) {
  console.error("Usage: node scripts/push-test.mjs <userId>  or set PUSH_TEST_USER_ID")
  process.exit(1)
}

const url = `${base}/api/push/send-test`
const headers = { "Content-Type": "application/json" }
if (secret) {
  headers["x-internal-api-key"] = secret
} else {
  console.warn("INTERNAL_API_SECRET not set — if Vercel returns 401, add the key to match gateway.")
}

const res = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify({ userId }),
})

const text = await res.text()
let body
try {
  body = JSON.parse(text)
} catch {
  body = text
}

const pretty = typeof body === "string" ? body : JSON.stringify(body, null, 2)
console.log(res.status, pretty)
if (res.ok && typeof body === "object" && body && "activeDeviceTargets" in body) {
  const t = body.activeDeviceTargets
  if (t && t.expo === 0) {
    console.log("\n(hint) activeDeviceTargets.expo is 0 — no Expo row for this userId; mobile must POST /api/v1/devices/register to this same ENGINE_BASE_URL.\n")
  }
}
if (!res.ok) process.exit(1)
