import { NextRequest, NextResponse } from "next/server"
import { getClientIp, shouldIgnoreIp } from "@/lib/utils/ip"
import { resolveIpLocation } from "@/lib/services/ipLocation"
import { calculateDistance, isLocationStale } from "@/lib/utils/location"
import type { User } from "@/types/user/User"

// IP-based fallback location API
export async function GET(request: NextRequest) {
  try {
// User location from query
    const searchParams = request.nextUrl.searchParams
    const currentLat = searchParams.get("lat")
    const currentLon = searchParams.get("lon")
    const currentSource = searchParams.get("source")
    const currentUpdatedAt = searchParams.get("updatedAt")

    // Extract client IP
    const clientIp = await getClientIp()
    
    if (shouldIgnoreIp(clientIp)) {
      return NextResponse.json(
        { error: "IP location not available for local/dev environments" },
        { status: 400 }
      )
    }

    if (!clientIp) {
      return NextResponse.json(
        { error: "Could not determine client IP" },
        { status: 400 }
      )
    }

    // Resolve IP to location
    const ipLocation = await resolveIpLocation(clientIp)
    
    if (!ipLocation) {
      return NextResponse.json(
        { error: "Could not resolve IP to location" },
        { status: 500 }
      )
    }

// Apply IP fallback?
    let shouldApply = false
    let reason = ""

    // No existing location
    if (!currentLat || !currentLon || !currentSource || !currentUpdatedAt) {
      shouldApply = true
      reason = "No existing location"
    } 
    // Stale GPS and IP far
    else if (currentSource === "gps") {
      const updatedAt = new Date(currentUpdatedAt)
      const isStale = isLocationStale(updatedAt)
      
      if (isStale) {
        const distance = calculateDistance(
          parseFloat(currentLat),
          parseFloat(currentLon),
          ipLocation.lat,
          ipLocation.lon
        )
        
        if (distance > 100) {
          shouldApply = true
          reason = `GPS stale (${Math.round((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60))}h old) and IP location is ${distance.toFixed(0)}km away`
        } else {
          reason = `GPS stale but IP location too close (${distance.toFixed(0)}km)`
        }
      } else {
        reason = "GPS is fresh, no fallback needed"
      }
    }
    // Existing IP can update if stale
    else if (currentSource === "ip") {
      const updatedAt = new Date(currentUpdatedAt)
      if (isLocationStale(updatedAt)) {
        shouldApply = true
        reason = "Existing IP location is stale"
      } else {
        reason = "Existing IP location is fresh"
      }
    }

    if (!shouldApply) {
      return NextResponse.json({
        shouldApply: false,
        reason,
        ipLocation: {
          lat: ipLocation.lat,
          lon: ipLocation.lon,
        },
      })
    }

// Return IP location to apply
    return NextResponse.json({
      shouldApply: true,
      reason,
      location: {
        lat: ipLocation.lat,
        lon: ipLocation.lon,
        source: "ip",
        confidence: "low",
        updatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error("Error in IP fallback:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
