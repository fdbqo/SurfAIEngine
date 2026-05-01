import { describe, expect, it } from "vitest"
import type { User } from "@/types/user/User"
import { preferenceFitBonus, resolvedMaxDistanceKm } from "./preferenceRanking"

function prefs(partial: Partial<User["preferences"]> & Pick<User["preferences"], "riskTolerance">): User["preferences"] {
  return partial as User["preferences"]
}

describe("resolvedMaxDistanceKm", () => {
  it("prefers context max when both set", () => {
    expect(resolvedMaxDistanceKm(80, 40)).toBe(80)
  })

  it("falls back to prefs when context unset", () => {
    expect(resolvedMaxDistanceKm(undefined, 55)).toBe(55)
  })

  it("returns null when neither active", () => {
    expect(resolvedMaxDistanceKm(undefined, undefined)).toBeNull()
    expect(resolvedMaxDistanceKm(0, null)).toBeNull()
  })
})

describe("preferenceFitBonus", () => {
  it("returns 0 without active min wave pref", () => {
    expect(preferenceFitBonus(undefined, 2)).toBe(0)
    expect(preferenceFitBonus(prefs({ riskTolerance: "low", minWaveHeightFt: null }), 2)).toBe(0)
  })

  it("adds bonus when above min and extra when well above", () => {
    const p = prefs({ riskTolerance: "medium", minWaveHeightFt: 3 })
    const minM = 3 * 0.3048
    expect(preferenceFitBonus(p, minM)).toBeCloseTo(0.15)
    expect(preferenceFitBonus(p, minM * 1.36)).toBeCloseTo(0.27)
  })

  it("returns 0 below min", () => {
    const p = prefs({ riskTolerance: "medium", minWaveHeightFt: 10 })
    expect(preferenceFitBonus(p, 0.2)).toBe(0)
  })
})
