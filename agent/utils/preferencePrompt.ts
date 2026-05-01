import type { SurfAgentStateType } from "../state"
import { buildPreferredBreaks } from "./preferredBreaks"
import { resolvedMaxDistanceKm } from "./preferenceRanking"

/** Single line for LLM prompts, keeps tiny and full prompts aligned. */
export function formatLlmPrefsSummary(state: SurfAgentStateType): string {
  const u = state.user
  const p = u?.rawUser?.preferences
  const maxDist = resolvedMaxDistanceKm(u?.maxDistanceKm, p?.maxDistanceKm)
  const breaks = buildPreferredBreaks(p).join(",")
  return [
    `riskTolerance=${p?.riskTolerance ?? "unknown"}`,
    `notifyStrictness=${p?.notifyStrictness ?? "unknown"}`,
    `maxWaveHeightFt=${p?.maxWaveHeightFt ?? "unknown"}`,
    `minWaveHeightFt=${p?.minWaveHeightFt ?? "unknown"}`,
    `maxWindSpeedKnots=${p?.maxWindSpeedKnots ?? "unknown"}`,
    `minSwellPeriodSec=${p?.minSwellPeriodSec ?? "unknown"}`,
    `maxDistanceKm=${maxDist ?? "unset"}`,
    `reefAllowed=${p?.reefAllowed ?? "unknown"}`,
    `sandAllowed=${p?.sandAllowed ?? "unknown"}`,
    `preferredBreakTypes=${breaks}`,
  ].join(", ")
}
