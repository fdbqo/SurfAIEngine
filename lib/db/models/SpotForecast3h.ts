import mongoose, { Schema, Document, model, models } from "mongoose"

export interface ISpotForecast3h extends Document {
  spotId: string
  blockStart: Date
  /** Stored but not used for decisions; we score from swell/wave/wind in the agent. */
  blockScore?: number
  localHour?: number // hour (0–23) from blockStart, for time-of-day
  swellHeight: number
  swellPeriod: number
  swellDirection: number
  waveHeight: number
  wavePeriod: number
  windSpeed10m: number
  windSpeed2m?: number
  windDirection: number
  modelRunTime?: Date
  secondarySwellHeight?: number
  secondarySwellPeriod?: number
  secondarySwellDirection?: number
}

const SpotForecast3hSchema = new Schema<ISpotForecast3h>(
  {
    spotId: { type: String, required: true, index: true },
    blockStart: { type: Date, required: true, index: true },
    blockScore: { type: Number, required: false },
    localHour: { type: Number, required: false },
    swellHeight: { type: Number, required: true },
    swellPeriod: { type: Number, required: true },
    swellDirection: { type: Number, required: true },
    waveHeight: { type: Number, required: true },
    wavePeriod: { type: Number, required: true },
    windSpeed10m: { type: Number, required: true },
    windSpeed2m: { type: Number, required: false },
    windDirection: { type: Number, required: true },
    modelRunTime: { type: Date, required: false },
    secondarySwellHeight: { type: Number, required: false },
    secondarySwellPeriod: { type: Number, required: false },
    secondarySwellDirection: { type: Number, required: false },
  },
  { timestamps: false, collection: "spotforecast3hs" }
)

SpotForecast3hSchema.index({ spotId: 1, blockStart: 1 }, { unique: true })

export const SpotForecast3h =
  (models.SpotForecast3h as mongoose.Model<ISpotForecast3h>) ||
  model<ISpotForecast3h>("SpotForecast3h", SpotForecast3hSchema)
