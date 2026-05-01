import mongoose from "mongoose"
import connectDB from "../connect"
import { SpotConditionsHourly } from "../models/SpotConditionsHourly"
import { SpotForecastDaily } from "../models/SpotForecastDaily"
import { SpotForecast3h } from "../models/SpotForecast3h"
import { SpotForecastRun } from "../models/SpotForecastRun"
import type { SpotConditions } from "@/lib/shared/types"

function spotIdFilter(spotId: string): Record<string, unknown> {
  const isObjectIdHex = /^[a-fA-F0-9]{24}$/.test(spotId)
  if (isObjectIdHex) {
    return { spotId: { $in: [spotId, new mongoose.Types.ObjectId(spotId)] } }
  }
  return { spotId }
}

// live conditions only
const liveOnlyFilter = () => ({ timestamp: { $lte: new Date() } })

export async function getConditionsForSpot(spotId: string): Promise<SpotConditions | null> {
  await connectDB()
  const doc = await SpotConditionsHourly.findOne({
    ...spotIdFilter(spotId),
    ...liveOnlyFilter(),
  })
    .sort({ timestamp: -1 })
    .limit(1)
    .lean()
  if (!doc) return null
  const sid = String(doc.spotId)
  return {
    spotId: sid,
    swellHeight: doc.swellHeight,
    swellPeriod: doc.swellPeriod,
    swellDirection: doc.swellDirection,
    waveHeight: doc.waveHeight,
    wavePeriod: doc.wavePeriod,
    windSpeed: doc.windSpeed2m,
    windSpeed10m: doc.windSpeed10m,
    windSpeed2m: doc.windSpeed2m,
    windDirection: doc.windDirection,
    localTime: doc.localTime,
    localHour: doc.localHour,
  }
}

function spotIdsInFilter(spotIds: string[]): { spotId: { $in: (string | mongoose.Types.ObjectId)[] } } {
  const inList: (string | mongoose.Types.ObjectId)[] = []
  for (const id of spotIds) {
    inList.push(id)
    if (/^[a-fA-F0-9]{24}$/.test(id)) inList.push(new mongoose.Types.ObjectId(id))
  }
  return { spotId: { $in: inList } }
}

export async function getConditionsForSpots(
  spotIds: string[]
): Promise<Array<{ spotId: string; conditions: SpotConditions | null }>> {
  if (spotIds.length === 0) return []
  await connectDB()
  const validIds = [...new Set(spotIds)]
  const filter = { ...spotIdsInFilter(validIds), ...liveOnlyFilter() }
  const docs = await SpotConditionsHourly.find(filter as unknown as Record<string, unknown>)
    .sort({ timestamp: -1 })
    .lean()
  const bySpot = new Map<string, SpotConditions>()
  for (const doc of docs) {
    const sid = String(doc.spotId)
    if (!bySpot.has(sid) && validIds.includes(sid)) {
      bySpot.set(sid, {
        spotId: sid,
        swellHeight: doc.swellHeight,
        swellPeriod: doc.swellPeriod,
        swellDirection: doc.swellDirection,
        waveHeight: doc.waveHeight,
        wavePeriod: doc.wavePeriod,
        windSpeed: doc.windSpeed2m,
        windSpeed10m: doc.windSpeed10m,
        windSpeed2m: doc.windSpeed2m,
        windDirection: doc.windDirection,
        localTime: doc.localTime,
        localHour: doc.localHour,
      })
    }
  }
  return validIds.map((spotId) => ({
    spotId,
    conditions: bySpot.get(spotId) ?? null,
  }))
}

export async function getConditionsForSpotNextHours(
  spotId: string,
  hours: number = 6
): Promise<SpotConditions[]> {
  await connectDB()
  const now = new Date()
  const docs = await SpotConditionsHourly.find({
    ...spotIdFilter(spotId),
    timestamp: { $gte: now },
  })
    .sort({ timestamp: 1 })
    .limit(hours)
    .lean()
  return docs.map((doc) => ({
    spotId: String(doc.spotId),
    swellHeight: doc.swellHeight,
    swellPeriod: doc.swellPeriod,
    swellDirection: doc.swellDirection,
    waveHeight: doc.waveHeight,
    wavePeriod: doc.wavePeriod,
    windSpeed: doc.windSpeed2m,
    windSpeed10m: doc.windSpeed10m,
    windSpeed2m: doc.windSpeed2m,
    windDirection: doc.windDirection,
    localTime: doc.localTime,
    localHour: doc.localHour,
  }))
}

export async function getDailyForecastForSpot(
  spotId: string,
  days: number = 3
): Promise<Array<{ date: Date; dayIndex: number; waveHeight: number; swellHeight: number; swellPeriod: number; windSpeed10m: number; windDirection: number; bestHour?: number; score?: number }>> {
  await connectDB()
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  const docs = await SpotForecastDaily.find({
    ...spotIdFilter(spotId),
    date: { $gte: now },
  })
    .sort({ date: 1 })
    .limit(days)
    .lean()
  return docs.map((d) => ({
    date: d.date,
    dayIndex: d.dayIndex,
    waveHeight: d.waveHeight,
    swellHeight: d.swellHeight,
    swellPeriod: d.swellPeriod,
    windSpeed10m: d.windSpeed10m,
    windDirection: d.windDirection,
    bestHour: d.bestHour,
    score: d.score,
  }))
}

/** return 3h blocks for scoring */
export async function getForecast3hForSpot(
  spotId: string,
  days: number = 5
): Promise<
  Array<{
    windowStart: Date
    localHour: number
    waveHeight: number
    swellHeight: number
    swellPeriod: number
    swellDirection: number
    windSpeed10m: number
    windDirection: number
  }>
> {
  await connectDB()
  const now = new Date()
  const docs = await SpotForecast3h.find({
    ...spotIdFilter(spotId),
    blockStart: { $gte: now },
  })
    .sort({ blockStart: 1 })
    .limit(days * 8)
    .lean()
  return docs.map((d) => ({
    windowStart: d.blockStart,
    localHour: d.localHour ?? d.blockStart.getUTCHours(),
    waveHeight: d.waveHeight,
    swellHeight: d.swellHeight,
    swellPeriod: d.swellPeriod,
    swellDirection: d.swellDirection,
    windSpeed10m: d.windSpeed10m,
    windDirection: d.windDirection,
  }))
}

export async function getForecastRunHistory(
  spotId: string,
  forDate?: Date
): Promise<
  Array<{
    date: Date
    modelRun: string
    runAt: Date
    waveHeight?: number
    score?: number
  }>
> {
  await connectDB()
  const filter: Record<string, unknown> = { ...spotIdFilter(spotId) }
  if (forDate) {
    const day = new Date(forDate)
    day.setUTCHours(0, 0, 0, 0)
    filter.date = { $gte: day, $lt: new Date(day.getTime() + 86400000) }
  }
  const docs = await SpotForecastRun.find(filter as unknown as Record<string, unknown>)
    .sort({ runAt: -1 })
    .limit(20)
    .lean()
  return docs.map((d) => ({
    date: d.date,
    modelRun: d.modelRun,
    runAt: d.runAt,
    waveHeight: d.waveHeight,
    score: d.score,
  }))
}
