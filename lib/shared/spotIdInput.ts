/** Mongo-style ObjectId hex (24 chars). Rejects whitespace-only and malformed strings. */
const OBJECT_ID_HEX_RE = /^[a-fA-F0-9]{24}$/

export function normaliseExternalSpotId(raw: unknown): string | undefined {
  if (raw == null) return undefined
  const t = String(raw).trim()
  if (!OBJECT_ID_HEX_RE.test(t)) return undefined
  return t
}

/** Trim, validate hex shape, dedupe while preserving order. */
export function normaliseExternalSpotIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const id = normaliseExternalSpotId(item)
    if (id && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

export type LastNotificationEntryInput = { spotId: string; timestamp: string }

/** Drops entries with invalid spotIds or empty timestamps. Trims timestamp. */
export function sanitizeLastNotificationsInput(
  entries: LastNotificationEntryInput[] | undefined | null,
): LastNotificationEntryInput[] {
  if (!entries?.length) return []
  const out: LastNotificationEntryInput[] = []
  for (const e of entries) {
    const spotId = normaliseExternalSpotId(e?.spotId)
    const timestamp = typeof e?.timestamp === "string" ? e.timestamp.trim() : ""
    if (spotId && timestamp.length > 0) out.push({ spotId, timestamp })
  }
  return out
}

/**
 * Resolves spot IDs for conditions fetch: args cannot widen beyond planned state spots;
 * unknown IDs are stripped against catalog. Falls back to planned IDs when args are junk.
 */
export function intersectConditionsSpotIds(args: {
  requestedRaw: unknown
  plannedSpotIdsRaw: readonly unknown[] | undefined
  catalogSpotIds: ReadonlySet<string>
}): string[] {
  const planned = normaliseExternalSpotIdList(args.plannedSpotIdsRaw ?? [])
  const requestedFromArgs = Array.isArray(args.requestedRaw)
    ? normaliseExternalSpotIdList(args.requestedRaw)
    : null

  const requested = requestedFromArgs ?? planned

  const allow = planned.length > 0 ? new Set(planned) : args.catalogSpotIds

  const filtered = requested.filter((id) => allow.has(id) && args.catalogSpotIds.has(id))
  if (filtered.length > 0) return filtered

  if (planned.length > 0) return planned.filter((id) => args.catalogSpotIds.has(id))

  return []
}
