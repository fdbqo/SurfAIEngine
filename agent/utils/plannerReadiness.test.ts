import { describe, it, expect } from "vitest"
import { getPlannerReadiness } from "./plannerReadiness"
import type { SurfAgentStateType } from "../state"

function makeState(overrides: Partial<SurfAgentStateType> = {}): SurfAgentStateType {
  return {
    userId: "test",
    mode: "FORECAST_PLANNER",
    ...overrides,
  } as SurfAgentStateType
}

describe("getPlannerReadiness", () => {
  it("haveUser false when user is null", () => {
    const r = getPlannerReadiness(makeState({ user: null }))
    expect(r.haveUser).toBe(false)
    expect(r.haveSpots).toBe(false)
    expect(r.haveConditions).toBe(false)
  })

  it("haveUser true when user is set", () => {
    const r = getPlannerReadiness(
      makeState({
        user: {
          skillLevel: "beginner",
          rawUser: {} as unknown as never,
        } as unknown as SurfAgentStateType["user"],
      })
    )
    expect(r.haveUser).toBe(true)
    expect(r.haveSpots).toBe(false)
    expect(r.haveConditions).toBe(false)
  })

  it("haveSpots true when spotIds and spots have length", () => {
    const r = getPlannerReadiness(
      makeState({
        user: {} as unknown as SurfAgentStateType["user"],
        spotIds: ["a"],
        spots: [{ spotId: "a", name: "A", lat: 0, lon: 0 }],
      } as unknown as Partial<SurfAgentStateType>)
    )
    expect(r.haveUser).toBe(true)
    expect(r.haveSpots).toBe(true)
    expect(r.haveConditions).toBe(false)
  })

  it("haveConditions true when hourliesBySpot has keys", () => {
    const r = getPlannerReadiness(
      makeState({
        user: {} as unknown as SurfAgentStateType["user"],
        spotIds: ["a"],
        spots: [{}] as unknown as SurfAgentStateType["spots"],
        hourliesBySpot: { a: {} as unknown as never },
      } as unknown as Partial<SurfAgentStateType>)
    )
    expect(r.haveUser).toBe(true)
    expect(r.haveSpots).toBe(true)
    expect(r.haveConditions).toBe(true)
  })
})
