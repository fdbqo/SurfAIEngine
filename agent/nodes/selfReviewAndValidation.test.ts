import { describe, it, expect } from "vitest"
import { selfReviewAndValidation } from "./selfReviewAndValidation"
import type { SurfAgentStateType } from "../state"

function makeState(overrides: Partial<SurfAgentStateType>): SurfAgentStateType {
  return {
    userId: "u1",
    mode: "FORECAST_PLANNER",
    ...overrides,
  } as SurfAgentStateType
}

describe("selfReviewAndValidation", () => {
  it("uses forecast-window suitability for next_window decisions", () => {
    const windowStart = new Date("2026-03-26T06:00:00.000Z")
    const out = selfReviewAndValidation(
      makeState({
        decision: {
          notify: true,
          spotId: "spot-1",
          when: "next_window",
          windowStart,
        },
        topCandidates: [
          { spotId: "spot-1", summary: "s", envScore: 3, userSuitability: 2.5 },
        ],
        scored: [
          { spotId: "spot-1", envScore: 3, userSuitability: 2.5, reasons: [] },
        ],
        forecastWindows: [
          {
            spotId: "spot-1",
            spotName: "Spot 1",
            start: windowStart,
            end: new Date(windowStart.getTime() + 3 * 60 * 60 * 1000),
            envScore: 10,
            userSuitability: 10,
            summary: "future great",
          },
        ],
      })
    )
    expect(out.review?.verdict).toBe("approve")
  })

  it("rejects next_window when selected window is missing", () => {
    const out = selfReviewAndValidation(
      makeState({
        decision: {
          notify: true,
          spotId: "spot-1",
          when: "next_window",
          windowStart: new Date("2026-03-26T06:00:00.000Z"),
        },
        topCandidates: [{ spotId: "spot-1", summary: "s", envScore: 5, userSuitability: 5 }],
        forecastWindows: [],
      })
    )
    expect(out.review?.verdict).toBe("reject")
    expect(out.review?.issues?.[0]).toContain("not found")
  })

  it("revises next_window when selected window envScore is below minimum", () => {
    const windowStart = new Date("2026-03-26T06:00:00.000Z")
    const out = selfReviewAndValidation(
      makeState({
        decision: {
          notify: true,
          spotId: "spot-1",
          when: "next_window",
          windowStart,
        },
        topCandidates: [{ spotId: "spot-1", summary: "s", envScore: 7, userSuitability: 7 }],
        forecastWindows: [
          {
            spotId: "spot-1",
            spotName: "Spot 1",
            start: windowStart,
            end: new Date(windowStart.getTime() + 3 * 60 * 60 * 1000),
            envScore: 5,
            userSuitability: 8,
            summary: "w",
          },
        ],
      }),
    )
    expect(out.review?.verdict).toBe("revise")
    expect(out.review?.issues?.[0]).toContain("envScore")
  })

  it("rejects next_window when windowStart is missing (do not match an arbitrary window)", () => {
    const out = selfReviewAndValidation(
      makeState({
        decision: {
          notify: true,
          spotId: "spot-1",
          when: "next_window",
        },
        topCandidates: [{ spotId: "spot-1", summary: "s", envScore: 5, userSuitability: 5 }],
        forecastWindows: [
          {
            spotId: "spot-1",
            spotName: "Spot 1",
            start: new Date("2026-03-26T06:00:00.000Z"),
            end: new Date("2026-03-26T09:00:00.000Z"),
            envScore: 5,
            userSuitability: 5,
            summary: "w",
          },
        ],
      })
    )
    expect(out.review?.verdict).toBe("reject")
    expect(out.review?.issues?.[0]).toContain("windowStart")
  })
})

