/**
 * send test push request
 *
 * set env values first:
 *   engine_base_url=https://your-app.vercel.app
 *   internal_api_secret=...
 *   push_test_user_id=web:<your-user-id>
 *
 *   npm run push:test
 *   node scripts/push-test.mjs "web:your-uuid"
 *
 * this prints api response json:
 *   - vercel logs show server output
 *   - local logs are in the dev server terminal
 *
 * android uses same request:
 * in mongo for that user id, ensure the app called post /api/v1/devices/register with
 * channel expo, then leave the app in background and run this from your PC
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
    console.log(
      "\n(hint) activeDeviceTargets.expo is 0 — no Expo row for this userId; mobile must POST /api/v1/devices/register to this same ENGINE_BASE_URL.\n",
    )
  }
  const expoFail = body.failures?.expo
  if (Array.isArray(expoFail) && expoFail.some((f) => /FCM|Firebase/i.test(String(f?.message ?? "")))) {
    console.log(
      [
        "\n(hint) Android push: Expo could not use FCM for your app. Fix in the Expo app project (not this repo):",
        "  EAS: `eas credentials` / project dashboard → add Android FCM (Firebase) credentials.",
        "  Docs: https://docs.expo.dev/push-notifications/fcm-credentials/",
        "",
      ].join("\n"),
    )
  }
}
if (!res.ok) process.exit(1)
