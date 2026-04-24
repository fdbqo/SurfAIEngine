import type { Spot } from './Spot'

import { connachtSpots } from './ireland/connacht'

export const allSpots: Spot[] = [
  ...connachtSpots,
]

const spotByIdCache = new Map<string, Spot>()
function buildSpotCache(): Map<string, Spot> {
  if (spotByIdCache.size === 0) {
    for (const s of allSpots) {
      spotByIdCache.set(s.id, s)
    }
  }
  return spotByIdCache
}

export function getSpotById(id: string): Spot | undefined {
  const cache = buildSpotCache()
  return cache.get(id)
}

/** batch lookup by ids */
export function getSpotsById(ids: string[]): Map<string, Spot> {
  const cache = buildSpotCache()
  const out = new Map<string, Spot>()
  for (const id of ids) {
    const s = cache.get(id)
    if (s) out.set(id, s)
  }
  return out
}

export function getSpotsByRegion(region: string): Spot[] {
  return allSpots.filter((s) => s.region === region)
}

export function getSpotsByCountry(country: string): Spot[] {
  return allSpots.filter((s) => s.country === country)
}

export * from "./nearby"

export type { Spot } from './Spot'

