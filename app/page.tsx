"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Loader2, AlertCircle, Waves, ListTree, ScrollText } from "lucide-react"
import { mockUser, mockUsers } from "@/lib/db/mockUserClient"
import { PushDebugPanel } from "@/components/push/PushDebugPanel"

type LastNotificationEntry = { spotId: string; timestamp: string }
type RunLogEntry = { step: number; ts: string; summary: string; detail?: unknown }
type RunGraphResponse = {
  decision?: {
    notify: boolean
    spotId?: string
    when?: "now" | "next_window"
    title?: string
    message?: string
    rationale?: string
    confidence?: number
    whyNotOthers?: string[]
    windowStart?: string
    windowEnd?: string
  }
  guard?: { allowed: boolean; blockedReason?: string; dedupeKey?: string }
  review?: { verdict: string; issues?: string[] }
  scored?: Array<{ spotId: string; envScore: number; userSuitability: number; reasons: string[]; distanceKm?: number }>
  topCandidates?: Array<{ spotId: string; summary: string; envScore: number; userSuitability: number; distanceKm?: number }>
  trace?: string[]
  runLog?: RunLogEntry[]
  durationMs?: number
}

export default function HomePage() {
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [graphMode, setGraphMode] = useState<"LIVE_NOTIFY" | "FORECAST_PLANNER">("FORECAST_PLANNER")
  const [agentUserId, setAgentUserId] = useState(mockUser.id)
  const [lastNotificationsJson, setLastNotificationsJson] = useState("[]")
  const [graphResult, setGraphResult] = useState<RunGraphResponse | null>(null)
  const [activeLogTab, setActiveLogTab] = useState<"summary" | "raw">("summary")

  const parseLastNotifications = (): LastNotificationEntry[] | null => {
    try {
      const v: unknown = JSON.parse(lastNotificationsJson)
      if (!Array.isArray(v)) return null
      return v
        .map((x) => {
          if (!x || typeof x !== "object") return null
          const spotId = (x as { spotId?: unknown }).spotId
          const timestamp = (x as { timestamp?: unknown }).timestamp
          if (typeof spotId !== "string" || typeof timestamp !== "string") return null
          return { spotId, timestamp }
        })
        .filter((x): x is LastNotificationEntry => x != null)
    } catch {
      return null
    }
  }

  const runGraph = async () => {
    setGraphError(null)
    setGraphResult(null)
    setGraphLoading(true)
    const lastNotifications = parseLastNotifications()
    if (lastNotifications == null) {
      setGraphError("lastNotifications must be a JSON array, e.g. [] or [{\"spotId\":\"...\",\"timestamp\":\"2026-03-18T10:00:00Z\"}]")
      setGraphLoading(false)
      return
    }
    try {
      const res = await fetch("/api/agent/run-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: agentUserId, mode: graphMode, lastNotifications }),
      })
      const data: unknown = await res.json()
      if (!res.ok) {
        const msg = typeof data === "object" && data && "error" in data ? String((data as { error?: unknown }).error) : "Request failed"
        throw new Error(msg)
      }
      setGraphResult(data as RunGraphResponse)
    } catch (e) {
      setGraphError(e instanceof Error ? e.message : "Graph run failed")
    } finally {
      setGraphLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2">
              <Waves className="size-5 text-muted-foreground" />
              <h1 className="text-lg font-semibold">Agent runner</h1>
              <Badge variant="outline" className="text-[10px] h-5 font-mono">
                /api/agent/run-graph
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Pick a mock user, run the graph, and inspect exactly why it decided to notify (or not).
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Run configuration</CardTitle>
            <CardDescription className="text-xs">
              This is a test UI for the agent graph. Use mock users to reproduce decisions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground block">Mock user</label>
                <select
                  value={agentUserId}
                  onChange={(e) => setAgentUserId(e.target.value)}
                  className="w-full rounded border border-input bg-background px-2 py-2 text-xs font-mono"
                >
                  {mockUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id} ({u.skill})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground block">Mode</label>
                <select
                  value={graphMode}
                  onChange={(e) => setGraphMode(e.target.value as "LIVE_NOTIFY" | "FORECAST_PLANNER")}
                  className="w-full rounded border border-input bg-background px-2 py-2 text-xs font-mono"
                >
                  <option value="FORECAST_PLANNER">FORECAST_PLANNER</option>
                  <option value="LIVE_NOTIFY">LIVE_NOTIFY</option>
                </select>
              </div>

              <div className="flex items-end">
                <Button onClick={runGraph} disabled={graphLoading} className="w-full">
                  {graphLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Running…
                    </>
                  ) : (
                    "Run agent"
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground block">lastNotifications (JSON)</label>
              <textarea
                value={lastNotificationsJson}
                onChange={(e) => setLastNotificationsJson(e.target.value)}
                rows={3}
                className="w-full rounded border border-input bg-background px-2 py-2 text-xs font-mono"
                placeholder='[] or [{"spotId":"...","timestamp":"2026-03-18T10:00:00Z"}]'
              />
              <div className="text-[11px] text-muted-foreground">
                Used to avoid re-notifying the same spot too soon.
              </div>
            </div>
          </CardContent>
        </Card>

        <PushDebugPanel userId={agentUserId} mode={graphMode} />

        {graphError && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="text-sm">{graphError}</AlertDescription>
          </Alert>
        )}

        {graphResult && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Decision</CardTitle>
                <CardDescription className="text-xs">What the agent decided</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={graphResult.decision?.notify ? "default" : "secondary"}>
                    {graphResult.decision?.notify ? "Notify" : "No notify"}
                  </Badge>
                  {graphResult.decision?.when && <Badge variant="outline">{graphResult.decision.when}</Badge>}
                  {graphResult.durationMs != null && (
                    <Badge variant="outline" className="font-mono">
                      {graphResult.durationMs}ms
                    </Badge>
                  )}
                </div>

                {graphResult.decision?.title && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Title</div>
                    <div className="font-medium">{graphResult.decision.title}</div>
                  </div>
                )}

                {graphResult.decision?.message && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Message</div>
                    <div>{graphResult.decision.message}</div>
                  </div>
                )}

                {graphResult.decision?.rationale && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Why it did this</div>
                    <div className="text-sm leading-relaxed">{graphResult.decision.rationale}</div>
                  </div>
                )}

                {Array.isArray(graphResult.decision?.whyNotOthers) && graphResult.decision.whyNotOthers.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Why not other spots</div>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {graphResult.decision.whyNotOthers.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {graphResult.review && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">Self-review</div>
                      <Badge variant="outline" className="font-mono">
                        {graphResult.review.verdict}
                      </Badge>
                    </div>
                    {graphResult.review.issues?.length ? (
                      <ul className="list-disc list-inside text-sm text-muted-foreground">
                        {graphResult.review.issues.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}

                {graphResult.guard && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">Notification guard</div>
                      <Badge variant={graphResult.guard.allowed ? "default" : "destructive"}>
                        {graphResult.guard.allowed ? "Allowed" : "Blocked"}
                      </Badge>
                    </div>
                    {graphResult.guard.blockedReason && (
                      <div className="text-sm text-muted-foreground">{graphResult.guard.blockedReason}</div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Logs</CardTitle>
                <CardDescription className="text-xs">How the agent got to the decision</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={activeLogTab === "summary" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setActiveLogTab("summary")}
                  >
                    <ListTree className="size-3 mr-1.5" />
                    Summary
                  </Button>
                  <Button
                    type="button"
                    variant={activeLogTab === "raw" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setActiveLogTab("raw")}
                  >
                    <ScrollText className="size-3 mr-1.5" />
                    Raw JSON
                  </Button>
                </div>

                {activeLogTab === "summary" ? (
                  <div className="space-y-3">
                    {Array.isArray(graphResult.trace) && graphResult.trace.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1.5">Pipeline trace</div>
                        <div className="flex flex-wrap gap-1">
                          {graphResult.trace.map((name: string, i: number) => (
                            <Badge key={i} variant="outline" className="font-mono text-[10px]">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {Array.isArray(graphResult.runLog) && graphResult.runLog.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1.5">Run log</div>
                        <div className="space-y-2">
                          {graphResult.runLog.map((e: RunLogEntry) => (
                            <div key={e.step} className="rounded border bg-muted/20 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-mono text-xs">
                                  {String(e.step).padStart(2, "0")}. {e.summary}
                                </div>
                                <div className="font-mono text-[10px] text-muted-foreground">{e.ts}</div>
                              </div>
                              {e.detail != null && (
                                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
                                  {JSON.stringify(e.detail, null, 2)}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {Array.isArray(graphResult.topCandidates) && graphResult.topCandidates.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1.5">Top candidates (input to reasoning)</div>
                        <div className="space-y-2">
                          {graphResult.topCandidates.slice(0, 5).map((c) => (
                            <div key={c.spotId} className="rounded border bg-muted/10 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-mono text-[10px]">{c.spotId}</div>
                                <div className="font-mono text-[10px] text-muted-foreground">
                                  env {c.envScore} · user {Math.round(c.userSuitability * 10) / 10}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{c.summary}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <pre className="rounded border bg-muted/20 p-3 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]">
                    {JSON.stringify(graphResult, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
