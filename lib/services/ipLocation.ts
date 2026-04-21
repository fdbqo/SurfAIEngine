// IP geolocation (city/region level)
export interface IPLocationResult {
  lat: number
  lon: number
}

// Resolve IP to location; ipapi.co then ip-api.com
export async function resolveIpLocation(ip: string): Promise<IPLocationResult | null> {
  try {
    // ipapi.co first
    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: {
        "Accept": "application/json",
      },
    })

    if (response.ok) {
      const data = await response.json()
      if (data.latitude && data.longitude) {
        return {
          lat: parseFloat(data.latitude),
          lon: parseFloat(data.longitude),
        }
      }
    }
  } catch (error) {
    console.warn("ipapi.co failed, trying fallback:", error)
  }

  // Fallback ip-api.com
  try {
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,lat,lon`,
      {
        next: { revalidate: 3600 }, // 1h cache
      }
    )

    if (response.ok) {
      const data = await response.json()
      if (data.status === "success" && data.lat && data.lon) {
        return {
          lat: parseFloat(data.lat),
          lon: parseFloat(data.lon),
        }
      }
    }
  } catch (error) {
    console.error("IP geolocation failed:", error)
  }

  return null
}
