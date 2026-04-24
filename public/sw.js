/* eslint-disable no-restricted-globals */
/** web push service worker */
self.addEventListener("install", () => {
  self.skipWaiting()
})
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

/** parse push payload object */
function parsePushPayload(text) {
  const raw = String(text).replace(/^\uFEFF/, "").trim()
  if (!raw) return null
  try {
    let v = JSON.parse(raw)
    if (typeof v === "string") {
      v = JSON.parse(v)
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) return null
    return v
  } catch {
    return null
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let title = "Surf AI Engine"
      let body = "Open for details."
      let url = "/"

      try {
        if (event.data) {
          const text = await event.data.text()
          const payload = parsePushPayload(text)
          if (payload) {
            if (typeof payload.title === "string" && payload.title.trim()) {
              title = payload.title.trim()
            }
            if (typeof payload.body === "string" && payload.body.trim()) {
              body = payload.body.trim()
            }
            if (typeof payload.url === "string" && payload.url.trim()) {
              url = payload.url.trim()
            }
          } else if (text && text.length > 0) {
            // avoid showing raw json
            body = "New surf update — open the app for details."
          }
        }
      } catch {
        body = "New surf update — open the app."
      }

      await self.registration.showNotification(title, {
        body,
        data: { url },
        tag: "surf-ai-engine",
        renotify: true,
      })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification?.data?.url || "/"

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of allClients) {
        if ("focus" in client) {
          client.focus()
          if ("navigate" in client) {
            try {
              await client.navigate(url)
            } catch {
              // ignore
            }
          }
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
