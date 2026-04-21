import type { SurfAgentStateType, RunLogEntry } from "../state"

export function appendRunLog(
  state: SurfAgentStateType,
  summary: string,
  detail?: unknown
): RunLogEntry[] {
  const prev = state.runLog ?? []
  const step = prev.length + 1
  return [...prev, { step, ts: new Date().toISOString(), summary, detail }]
}
