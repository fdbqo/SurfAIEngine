import { describe, it, expect } from "vitest"
import { applyReject } from "./applyReject"
import type { SurfAgentStateType } from "../state"

describe("applyReject", () => {
  it("clears notify-only fields when forcing a reject", () => {
    const out = applyReject({
      userId: "u1",
      mode: "FORECAST_PLANNER",
      decision: {
        notify: true,
        spotId: "spot-1",
        when: "next_window",
        windowStart: new Date("2026-03-26T06:00:00.000Z"),
        windowEnd: new Date("2026-03-26T09:00:00.000Z"),
        title: "Surf alert",
        message: "Window selected",
        rationale: "Some rationale",
        whyNotOthers: ["x"],
        confidence: 0.8,
      },
      review: { verdict: "reject", issues: ["bad"] },
    } as SurfAgentStateType)

    expect(out.decision?.notify).toBe(false)
    expect(out.decision?.spotId).toBeUndefined()
    expect(out.decision?.when).toBeUndefined()
    expect(out.decision?.windowStart).toBeUndefined()
    expect(out.decision?.windowEnd).toBeUndefined()
    expect(out.decision?.title).toBeUndefined()
    expect(out.decision?.whyNotOthers).toBeUndefined()
    expect(out.decision?.confidence).toBeUndefined()
    expect(out.decision?.message).toBe("bad")
  })
})
