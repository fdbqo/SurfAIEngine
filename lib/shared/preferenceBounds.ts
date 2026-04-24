/** helper checks for numeric user bounds */

/** true when min bound is active */
export function isActiveUserMin(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

/** true when max bound is active */
export function isActiveUserMax(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

/** fallback max wave */
export const UNSET_MAX_WAVE_HEIGHT_M = 30

/** fallback max wind */
export const UNSET_MAX_WIND_KMH = 200

/** fallback max distance */
export const UNSET_MAX_DISTANCE_KM = 20_000
