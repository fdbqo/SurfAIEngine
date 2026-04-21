"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

async function asJsonOrNull(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export function PushDebugPanel(props: { userId: string; mode: "LIVE_NOTIFY" | "FORECAST_PLANNER" }) {
  const supported = useMemo(() => {
    if (typeof window === "undefined") return false
    return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window
  }, [])

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported",
  )
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | "subscribe" | "unsubscribe" | "send-test" | "send-agent">(null)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<unknown>(null)

  const refreshSubscription = useCallback(async () => {
    if (!supported) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    setEndpoint(sub?.endpoint ?? null)
    setPermission(Notification.permission)
  }, [supported])

  useEffect(() => {
    void refreshSubscription()
  }, [refreshSubscription])

  const ensureSw = useCallback(async () => {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    await navigator.serviceWorker.ready
    return reg
  }, [])

  const subscribe = useCallback(async () => {
    if (!supported) return
    setError(null)
    setLastResult(null)
    setBusy("subscribe")
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== "granted") throw new Error(`Notification permission is ${perm}`)

      const reg = await ensureSw()

      const keyRes = await fetch("/api/push/vapid-public-key")
      const keyJson = (await asJsonOrNull(keyRes)) as { publicKey?: unknown; error?: unknown } | null
      if (!keyRes.ok) throw new Error(typeof keyJson?.error === "string" ? keyJson.error : "Failed to fetch VAPID key")
      const publicKey = typeof keyJson?.publicKey === "string" ? keyJson.publicKey : null
      if (!publicKey) throw new Error("Missing publicKey in response")

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }))

      const subscriptionJson = sub.toJSON()
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe", userId: props.userId, subscription: subscriptionJson }),
      })
      const data = await asJsonOrNull(res)
      if (!res.ok) throw new Error(typeof (data as any)?.error === "string" ? (data as any).error : "Subscribe failed")

      await refreshSubscription()
      setLastResult({ ok: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Subscribe failed")
    } finally {
      setBusy(null)
    }
  }, [ensureSw, props.userId, refreshSubscription, supported])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setError(null)
    setLastResult(null)
    setBusy("unsubscribe")
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (!sub) {
        await refreshSubscription()
        return
      }

      const subscriptionJson = sub.toJSON()
      await sub.unsubscribe().catch(() => void 0)

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unsubscribe", userId: props.userId, subscription: subscriptionJson }),
      })
      const data = await asJsonOrNull(res)
      if (!res.ok) throw new Error(typeof (data as any)?.error === "string" ? (data as any).error : "Unsubscribe failed")

      await refreshSubscription()
      setLastResult({ ok: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unsubscribe failed")
    } finally {
      setBusy(null)
    }
  }, [props.userId, refreshSubscription, supported])

  const sendTest = useCallback(async () => {
    setError(null)
    setLastResult(null)
    setBusy("send-test")
    try {
      const res = await fetch("/api/push/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: props.userId }),
      })
      const data = await asJsonOrNull(res)
      if (!res.ok) throw new Error(typeof (data as any)?.error === "string" ? (data as any).error : "Send failed")
      setLastResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed")
    } finally {
      setBusy(null)
    }
  }, [props.userId])

  const sendAgent = useCallback(async () => {
    setError(null)
    setLastResult(null)
    setBusy("send-agent")
    try {
      const res = await fetch("/api/push/send-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: props.userId, mode: props.mode }),
      })
      const data = await asJsonOrNull(res)
      if (!res.ok) throw new Error(typeof (data as any)?.error === "string" ? (data as any).error : "Agent send failed")
      setLastResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent send failed")
    } finally {
      setBusy(null)
    }
  }, [props.mode, props.userId])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Push test</CardTitle>
        <CardDescription className="text-xs">
          Subscribe this browser, then trigger your existing push endpoints for the selected mock user.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">
            userId: {props.userId}
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            mode: {props.mode}
          </Badge>
          <Badge variant={permission === "granted" ? "default" : permission === "denied" ? "destructive" : "secondary"}>
            {permission === "unsupported" ? "Unsupported" : `Permission: ${permission}`}
          </Badge>
          <Badge variant={endpoint ? "default" : "secondary"} className="font-mono text-[10px]">
            {endpoint ? "Subscribed" : "Not subscribed"}
          </Badge>
        </div>

        {!supported && (
          <Alert variant="destructive">
            <AlertTitle>Push not supported</AlertTitle>
            <AlertDescription className="text-sm">
              This browser doesn’t support Web Push (or it’s running in a context that disables it).
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={subscribe} disabled={!supported || busy != null} variant="default" size="sm">
            {busy === "subscribe" ? "Subscribing…" : "Enable + subscribe"}
          </Button>
          <Button type="button" onClick={unsubscribe} disabled={!supported || busy != null} variant="outline" size="sm">
            {busy === "unsubscribe" ? "Unsubscribing…" : "Unsubscribe"}
          </Button>
          <Button type="button" onClick={sendTest} disabled={busy != null} variant="secondary" size="sm">
            {busy === "send-test" ? "Sending…" : "Send test push"}
          </Button>
          <Button type="button" onClick={sendAgent} disabled={busy != null} variant="outline" size="sm">
            {busy === "send-agent" ? "Running…" : "Run agent + maybe push"}
          </Button>
        </div>

        {lastResult != null && (
          <pre className="rounded border bg-muted/20 p-3 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

