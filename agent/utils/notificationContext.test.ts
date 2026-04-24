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

  it("returns 1 when hoursUntilStart <= hoursNoDecrease (72)", () => {
    expect(getFutureDiscountFactor(0)).toBe(1)
    expect(getFutureDiscountFactor(24)).toBe(1)
    expect(getFutureDiscountFactor(72)).toBe(1)
  })

  it("returns minFactor (0.85) when hoursUntilStart >= hoursAtMin (168)", () => {
    expect(getFutureDiscountFactor(168)).toBe(0.85)
    expect(getFutureDiscountFactor(200)).toBe(0.85)
  })

  it("returns linear interpolation between 72 and 168", () => {
    const mid = getFutureDiscountFactor(120) // (72+168)/2
    expect(mid).toBeGreaterThan(0.85)
    expect(mid).toBeLessThan(1)
    expect(typeof mid).toBe("number")
    expect(Number.isFinite(mid)).toBe(true)
  })

  it("returns rounded to 2 decimal places", () => {
    const v = getFutureDiscountFactor(60)
    expect(v).toBe(Math.round(v * 100) / 100)
  })
})
