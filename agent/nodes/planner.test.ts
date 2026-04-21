import { describe, it, expect, vi, beforeEach } from "vitest"
import { plannerNode } from "./planner"
import type { SurfAgentStateType } from "../state"
import type { User } from "@/types/user/User"

function makeState(overrides: Partial<SurfAgentStateType> = {}): SurfAgentStateType {
  return {
    userId: "test",
    mode: "FORECAST_PLANNER",
    stepCount: 0,
    ...overrides,
  } as SurfAgentStateType
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    skill: "beginner",
    preferences: { riskTolerance: "low" },
    notificationSettings: { enabled: true },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User
}

describe("plannerNode deterministic shortcut", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  it("returns get_user_preferences when no user", async () => {
    const state = makeState({ user: null })
    const out = await plannerNode(state)
    expect(out.pendingToolCall?.tool).toBe("get_user_preferences")
    expect(out.pendingToolCall?.args).toEqual({})
  })

  it("returns get_spots_near_user when user has lastLocation and no spots", async () => {
    const user = makeUser({ lastLocation: { lat: 53.27, lon: -9.05 } as unknown as User["lastLocation"] })
    const state = makeState({
      user: { skillLevel: "beginner", rawUser: user } as unknown as SurfAgentStateType["user"],
      spotIds: [],
      spots: [],
    })
    const out = await plannerNode(state)
    expect(out.pendingToolCall?.tool).toBe("get_spots_near_user")
    expect(out.pendingToolCall?.args).toEqual({})
  })

  it("returns get_spots_in_region with region when user has homeRegion and no spots", async () => {
    const user = makeUser({ homeRegion: "Connacht" })
    const state = makeState({
      user: { skillLevel: "beginner", rawUser: user } as unknown as SurfAgentStateType["user"],
      spotIds: [],
      spots: [],
    })
    const out = await plannerNode(state)
    expect(out.pendingToolCall?.tool).toBe("get_spots_in_region")
    expect(out.pendingToolCall?.args).toEqual({ region: "Connacht" })
  })

  it("returns get_surf_conditions_batch with spotIds when user and spots present but no conditions", async () => {
    const state = makeState({
      user: { skillLevel: "beginner", rawUser: makeUser() } as unknown as SurfAgentStateType["user"],
      spotIds: ["id1", "id2"],
      spots: [{ spotId: "id1", name: "A", lat: 0, lon: 0 }, { spotId: "id2", name: "B", lat: 0, lon: 0 }],
      hourliesBySpot: {},
    } as unknown as Partial<SurfAgentStateType>)
    const out = await plannerNode(state)
    expect(out.pendingToolCall?.tool).toBe("get_surf_conditions_batch")
    expect(out.pendingToolCall?.args).toEqual({ spotIds: ["id1", "id2"] })
  })

  it("returns pendingToolCall null (done) when user, spots, and conditions present", async () => {
    const state = makeState({
      user: { skillLevel: "beginner", rawUser: makeUser() } as unknown as SurfAgentStateType["user"],
      spotIds: ["id1"],
      spots: [{ spotId: "id1", name: "A", lat: 0, lon: 0 }],
      hourliesBySpot: { id1: {} as unknown as never },
    } as unknown as Partial<SurfAgentStateType>)
    const out = await plannerNode(state)
    expect(out.pendingToolCall).toBeNull()
    expect(out.decision).toBeUndefined()
  })
})
