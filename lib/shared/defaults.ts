import type { LatLon } from "./geo"

/**
 * Fallback location used only when the user has no usualLocation and no
 * current location (e.g. first run, or dev/test). Prefer requiring or
 * prompting for location in production; this avoids hardcoding a specific
 * region in business logic.
 */
export const FALLBACK_LOCATION: LatLon = { lat: 54.27, lon: -8.6 }
