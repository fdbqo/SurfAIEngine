import type { User } from "@/types/user/User"
import { isActiveUserMax, isActiveUserMin } from "@/lib/shared/preferenceBounds"

/** Prefer normalised context distance, fall back to raw profile prefs. */
export function resolvedMaxDistanceKm(maxFromContext: unknown, maxFromPrefs: unknown): number | null {
  if (isActiveUserMax(maxFromContext)) return maxFromContext
  if (isActiveUserMax(maxFromPrefs)) return maxFromPrefs
  return null
}

/**
 * bump on 0–10 suitability when conditions clearly satisfy an active min-wave pref.
 * Post-prefilter spots already meet mins; this prefers spots further above the bar.
 */
export function preferenceFitBonus(
  prefs: User["preferences"] | undefined,
  waveHeightM: number | undefined,
): number {
  if (!prefs || waveHeightM == null || !Number.isFinite(waveHeightM)) return 0
  if (!isActiveUserMin(prefs.minWaveHeightFt)) return 0
  const minM = prefs.minWaveHeightFt * 0.3048
  if (waveHeightM < minM) return 0
  let bonus = 0.15
  if (waveHeightM >= minM * 1.35) bonus += 0.12
  return bonus
}
