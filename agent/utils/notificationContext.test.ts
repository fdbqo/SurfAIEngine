import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getFutureDiscountFactor } from "./notificationContext"

describe("getFutureDiscountFactor", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("returns 1 when hoursUntilStart <= hoursNoDecrease (48)", () => {
    expect(getFutureDiscountFactor(0)).toBe(1)
    expect(getFutureDiscountFactor(24)).toBe(1)
    expect(getFutureDiscountFactor(48)).toBe(1)
  })

  it("returns minFactor (0.75) when hoursUntilStart >= hoursAtMin (120)", () => {
    expect(getFutureDiscountFactor(120)).toBe(0.75)
    expect(getFutureDiscountFactor(168)).toBe(0.75)
  })

  it("returns linear interpolation between 48 and 120", () => {
    const mid = getFutureDiscountFactor(84) // (48+120)/2
    expect(mid).toBeGreaterThan(0.75)
    expect(mid).toBeLessThan(1)
    expect(typeof mid).toBe("number")
    expect(Number.isFinite(mid)).toBe(true)
  })

  it("returns rounded to 2 decimal places", () => {
    const v = getFutureDiscountFactor(60)
    expect(v).toBe(Math.round(v * 100) / 100)
  })
})
