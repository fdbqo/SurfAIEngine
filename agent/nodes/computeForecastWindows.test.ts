import { describe, it, expect, vi, beforeEach } from "vitest"
import { computeForecastWindows } from "./computeForecastWindows"
import type { SurfAgentStateType } from "../state"

vi.mock("@/lib/db/services/spotConditionsService", () => ({
  getForecast3hForSpot: vi.fn(),
}))
vi.mock("@/lib/shared/spots", () => ({
  getSpotsById: vi.fn(),
}))
vi.mock("@/lib/shared/geo", () => ({
  distanceKm: () => 10,
}))
vi.mock("@/lib/shared/scoring", () => ({
  scoreSpot: () => ({ score: 6 }),
  toScoringInput: () => ({}),
}))

import { getForecast3hForSpot } from "@/lib/db/services/spotConditionsService"
import { getSpotsById } from "@/lib/shared/spots"

const mockGetForecast3hForSpot = vi.mocked(getForecast3hForSpot)
const mockGetSpotsById = vi.mocked(getSpotsById)

function makeState(overrides: Partial<SurfAgentStateType> = {}): SurfAgentStateType {
  return {
    userId: "test",
    mode: "FORECAST_PLANNER",
    user: {
      skillLevel: "beginner",
      rawUser: { id: "u1", skill: "beginner", preferences: {} as unknown as never, notificationSettings: {} as unknown as never, createdAt: new Date(), updatedAt: new Date() },
    } as unknown as SurfAgentStateType["user"],
    spotIds: ["s1", "s2"],
    spots: [],
    ...overrides,
  } as SurfAgentStateType
}

describe("computeForecastWindows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const spot = {
      id: "s1",
      name: "Spot1",
      lat: 53,
      lon: -9,
      region: "Connacht",
      country: "IE",
      county: "Sligo",
      type: "beach" as const,
      orientation: 270,
    }
    mockGetSpotsById.mockReturnValue(
      new Map([
        ["s1", spot as unknown as never],
        ["s2", { ...spot, id: "s2", name: "Spot2" } as unknown as never],
      ])
    )
  })

  it("returns empty when mode is not FORECAST_PLANNER", async () => {
    const state = makeState({ mode: "LIVE_NOTIFY" })
    const out = await computeForecastWindows(state)
    expect(out.forecastWindows).toBeUndefined()
    expect(mockGetForecast3hForSpot).not.toHaveBeenCalled()
  })

  it("returns empty when no user or no spotIds", async () => {
    expect((await computeForecastWindows(makeState({ user: null }))).forecastWindows).toBeUndefined()
    expect((await computeForecastWindows(makeState({ spotIds: [] }))).forecastWindows).toBeUndefined()
  })

  it("fetches forecasts in parallel and caps total windows", async () => {
    mockGetForecast3hForSpot.mockResolvedValue([
      {
        windowStart: new Date(Date.now() + 3 * 60 * 60 * 1000),
        localHour: 12,
        waveHeight: 1,
        swellHeight: 1,
        swellPeriod: 10,
        swellDirection: 280,
        windSpeed10m: 5,
        windDirection: 270,
      },
    ] as unknown as Awaited<ReturnType<typeof getForecast3hForSpot>>)
    const state = makeState({ spotIds: ["s1", "s2"] })
    const out = await computeForecastWindows(state)
    expect(mockGetForecast3hForSpot).toHaveBeenCalledTimes(2)
    expect(out.forecastWindows?.length).toBeLessThanOrEqual(30)
  })

  it("softens distance penalty for further-out forecast windows", async () => {
    const nearStart = new Date(Date.now() + 6 * 60 * 60 * 1000)
    const farStart = new Date(Date.now() + 100 * 60 * 60 * 1000)
    mockGetForecast3hForSpot.mockResolvedValue([
      {
        windowStart: nearStart,
        localHour: 12,
        waveHeight: 1,
        swellHeight: 1,
        swellPeriod: 10,
        swellDirection: 280,
        windSpeed10m: 5,
        windDirection: 270,
      },
      {
        windowStart: farStart,
        localHour: 12,
        waveHeight: 1,
        swellHeight: 1,
        swellPeriod: 10,
        swellDirection: 280,
        windSpeed10m: 5,
        windDirection: 270,
      },
    ] as unknown as Awaited<ReturnType<typeof getForecast3hForSpot>>)
    const out = await computeForecastWindows(makeState({ spotIds: ["s1"] }))
    const windows = out.forecastWindows ?? []
    const near = windows.find((w) => w.start.getTime() === nearStart.getTime())
    const far = windows.find((w) => w.start.getTime() === farStart.getTime())
    expect(near).toBeDefined()
    expect(far).toBeDefined()
    expect((far?.userSuitability ?? 0)).toBeGreaterThan(near?.userSuitability ?? 0)
  })

  it("drops windows that start late local evening (default >= 20) or at night", async () => {
    const startOk = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const startLate = new Date(Date.now() + 6 * 60 * 60 * 1000)
    mockGetForecast3hForSpot.mockResolvedValue([
      {
        windowStart: startOk,
        localHour: 12,
        waveHeight: 1,
        swellHeight: 1,
        swellPeriod: 10,
        swellDirection: 280,
        windSpeed10m: 5,
        windDirection: 270,
      },
      {
        windowStart: startLate,
        localHour: 20,
        waveHeight: 1,
        swellHeight: 1,
        swellPeriod: 10,
        swellDirection: 280,
        windSpeed10m: 5,
        windDirection: 270,
      },
    ] as unknown as Awaited<ReturnType<typeof getForecast3hForSpot>>)
    const out = await computeForecastWindows(makeState({ spotIds: ["s1"] }))
    const windows = out.forecastWindows ?? []
    expect(windows.some((w) => w.start.getTime() === startLate.getTime())).toBe(false)
    expect(windows.some((w) => w.start.getTime() === startOk.getTime())).toBe(true)
  })
})
