// Exponential distance score 0–1; harsh/lenient decay
export function distanceScore(
  distanceKm: number,
  strictness: "strict" | "moderate" | "lenient"
): number {
  const k = strictness === "strict" ? 0.06 : strictness === "moderate" ? 0.04 : 0.02
  return Math.exp(-k * distanceKm)
}
