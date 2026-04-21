// Cross-platform geo helpers
export type LatLon = { lat: number; lon: number }

// Haversine distance in km
export function distanceKm(a: LatLon, b: LatLon): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180

  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

