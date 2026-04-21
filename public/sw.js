/* eslint-disable no-restricted-globals */

self.addEventListener("push", (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    try {
      payload = { body: event.data ? event.data.text() : "" }
    } catch {
      payload = {}
    }
  }

  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title : "Surf AI Engine"
  const body = typeof payload.body === "string" ? payload.body : ""
  const url = typeof payload.url === "string" ? payload.url : "/"

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
    }),
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

