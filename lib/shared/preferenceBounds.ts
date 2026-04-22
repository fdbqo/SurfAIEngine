/**
 * Helpers: `null`, missing, `0`, or non-finite = "no user constraint" / "any" for that axis.
 * Only **positive** finite numbers apply as a user min (floor) or max (ceiling).
 */

/** Apply a positive floor (ft, sec, …); otherwise no min. */
export function isActiveUserMin(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

/** Apply a positive ceiling (ft, knots, km, …); otherwise no max. */
export function isActiveUserMax(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

/** When no user max wave (m); real surf stays below this. */
export const UNSET_MAX_WAVE_HEIGHT_M = 30

/** When no user max wind (km/h); rule checks effectively never trip. */
export const UNSET_MAX_WIND_KMH = 200

/** When no user max distance (km); spot search / scoring is not distance-capped by prefs. */
export const UNSET_MAX_DISTANCE_KM = 20_000
