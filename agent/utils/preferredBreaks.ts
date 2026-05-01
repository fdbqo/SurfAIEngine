import type { Spot } from "@/lib/shared/spots"

export type PreferredBreakType = Spot["type"]

export function buildPreferredBreaks(prefs: { sandAllowed?: boolean; reefAllowed?: boolean } | undefined): PreferredBreakType[] {
  if (!prefs) {
    return ["beach", "reef", "harbour", "bay", "island"]
  }
  const out: PreferredBreakType[] = []
  if (prefs.sandAllowed !== false) out.push("beach")
  if (prefs.reefAllowed !== false) out.push("reef")
  out.push("harbour", "bay", "island")
  return out
}
