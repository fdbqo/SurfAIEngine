import { describe, it, expect } from "vitest"
import { applyForecastPlannerNoNowOverride, isForecastBlockSessionNow } from "./forecastNoNowSession"
import type { SurfAgentStateType, ForecastWindow } from "../state"

function baseState(over: Partial<SurfAgentStateType> = {}): SurfAgentStateType {
  return {
    userId: "u1",
    mode: "FORECAST_PLANNER",
    ...over,
  } as SurfAgentStateType
}

describe("isForecastBlockSessionNow", () => {
  it("blocks when local hour is night (21)", () => {
    const s = baseState({
      hourliesBySpot: {
        a: { localHour: 21 } as any,
      },
    })
    expect(isForecastBlockSessionNow(s, new Date()).block).toBe(true)
  })

  it("does not block at midday in forecast mode", () => {
    const s = baseState({
      hourliesBySpot: { a: { localHour: 12 } as any },
    })
    expect(isForecastBlockSessionNow(s, new Date()).block).toBe(false)
  })

  it("does not run in LIVE_NOTIFY", () => {
    const s = baseState({
      mode: "LIVE_NOTIFY",
      hourliesBySpot: { a: { localHour: 22 } as any },
    })
    expect(isForecastBlockSessionNow(s, new Date()).block).toBe(false)
  })
})

describe("applyForecastPlannerNoNowOverride", () => {
  const w: ForecastWindow = {
    spotId: "spot1",
    spotName: "Test Beach",
    start: new Date("2026-04-22T08:00:00.000Z"),
    end: new Date("2026-04-22T11:00:00.000Z"),
    envScore: 8,
    userSuitability: 8,
    summary: "x",
    hoursUntilStart: 10,
    timeOfDayLabel: "morning",
  }

  it("replaces now with a future window at night", () => {
    const s = baseState({
      hourliesBySpot: { a: { localHour: 22 } as any },
      forecastWindows: [w],
    })
    const out = applyForecastPlannerNoNowOverride(
      s,
      { notify: true, spotId: "spot1", when: "now", message: "old" },
      new Date("2026-04-21T20:00:00.000Z")
    )
    expect(out.when).toBe("next_window")
    expect(out.spotId).toBe("spot1")
    expect(out.windowStart).toBeDefined()
  })
})
