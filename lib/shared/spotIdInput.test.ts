import { describe, it, expect } from "vitest"
import {
  normaliseExternalSpotId,
  normaliseExternalSpotIdList,
  sanitizeLastNotificationsInput,
  intersectConditionsSpotIds,
} from "./spotIdInput"

const valid = "5842041f4e65fad6a7708b58"
const valid2 = "584204204e65fad6a770912d"

describe("normaliseExternalSpotId", () => {
  it("accepts 24-char hex and trims", () => {
    expect(normaliseExternalSpotId(`  ${valid}  `)).toBe(valid)
  })

  it("rejects wrong length and garbage", () => {
    expect(normaliseExternalSpotId("")).toBeUndefined()
    expect(normaliseExternalSpotId("5842041f4e65fad6a7708b5")).toBeUndefined()
    expect(normaliseExternalSpotId("not-hex-not-hex-not-hex-no")).toBeUndefined()
  })
})

describe("normaliseExternalSpotIdList", () => {
  it("dedupes and skips invalid", () => {
    expect(normaliseExternalSpotIdList([valid, ` ${valid} `, "bad", valid2])).toEqual([valid, valid2])
  })
})

describe("sanitizeLastNotificationsInput", () => {
  it("drops invalid spotIds or timestamps", () => {
    expect(
      sanitizeLastNotificationsInput([
        { spotId: valid, timestamp: " 2025-01-01 " },
        { spotId: "x", timestamp: "2025-01-01" },
        { spotId: valid, timestamp: "" },
      ]),
    ).toEqual([{ spotId: valid, timestamp: "2025-01-01" }])
  })
})

describe("intersectConditionsSpotIds", () => {
  const catalog = new Set([valid, valid2])

  it("uses planned ids when args omitted", () => {
    expect(
      intersectConditionsSpotIds({
        requestedRaw: undefined,
        plannedSpotIdsRaw: [valid, valid2],
        catalogSpotIds: catalog,
      }),
    ).toEqual([valid, valid2])
  })

  it("restricts args to planned ∩ catalog", () => {
    expect(
      intersectConditionsSpotIds({
        requestedRaw: [valid2, "584204204e65fad6a7709999"],
        plannedSpotIdsRaw: [valid],
        catalogSpotIds: catalog,
      }),
    ).toEqual([valid])
    expect(
      intersectConditionsSpotIds({
        requestedRaw: [valid],
        plannedSpotIdsRaw: [valid, valid2],
        catalogSpotIds: catalog,
      }),
    ).toEqual([valid])
  })

  it("falls back to planned when args are junk", () => {
    expect(
      intersectConditionsSpotIds({
        requestedRaw: ["not-valid", "bad"],
        plannedSpotIdsRaw: [valid],
        catalogSpotIds: catalog,
      }),
    ).toEqual([valid])
  })

  it("uses catalog only when no planned ids", () => {
    expect(
      intersectConditionsSpotIds({
        requestedRaw: [valid],
        plannedSpotIdsRaw: [],
        catalogSpotIds: catalog,
      }),
    ).toEqual([valid])
  })
})
