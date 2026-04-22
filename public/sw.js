/* eslint-disable no-restricted-globals */
/**
 * Web Push: server sends JSON { title, body, url } as the message payload.
 * PushMessageData.json() is async in browsers—must await after reading text, or
 * parsing fails and the whole JSON string is shown as the notification body.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {}
      try {
        if (event.data) {
          const text = await event.data.text()
          if (text) {
            try {
              payload = JSON.parse(text)
            } catch {
              payload = { title: "Surf AI Engine", body: text, url: "/" }
            }
          }
        }
      } catch {
        payload = {}
      }

      const title =
        typeof payload.title === "string" && payload.title.trim() ? payload.title : "Surf AI Engine"
      const body = typeof payload.body === "string" && payload.body.trim() ? payload.body : "Open for details."
      const url = typeof payload.url === "string" && payload.url.trim() ? payload.url : "/"

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
