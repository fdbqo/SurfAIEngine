import mongoose, { Schema, Document, model, models } from "mongoose"

export interface ISpotForecastDaily extends Document {
  spotId: string
  date: Date
  dayIndex: number
  swellHeight: number
  swellPeriod: number
  swellDirection: number
  secondarySwellHeight?: number
  secondarySwellPeriod?: number
  secondarySwellDirection?: number
  waveHeight: number
  wavePeriod: number
  windSpeed10m: number
  windDirection: number
  bestHour?: number
  score?: number
  confidence?: number
  stability?: number
}

const SpotForecastDailySchema = new Schema<ISpotForecastDaily>(
  {
    spotId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    dayIndex: { type: Number, required: true },
    swellHeight: { type: Number, required: true },
    swellPeriod: { type: Number, required: true },
    swellDirection: { type: Number, required: true },
    secondarySwellHeight: { type: Number, required: false },
    secondarySwellPeriod: { type: Number, required: false },
    secondarySwellDirection: { type: Number, required: false },
    waveHeight: { type: Number, required: true },
    wavePeriod: { type: Number, required: true },
    windSpeed10m: { type: Number, required: true },
    windDirection: { type: Number, required: true },
    bestHour: { type: Number, required: false, min: 0, max: 23 },
    score: { type: Number, required: false, min: 0, max: 10 },
    confidence: { type: Number, required: false, min: 0, max: 1 },
    stability: { type: Number, required: false, min: 0, max: 1 },
  },
  { timestamps: false, collection: "spotforecastdailies" }
)

SpotForecastDailySchema.index({ spotId: 1, date: 1 }, { unique: true })
SpotForecastDailySchema.index({ spotId: 1, dayIndex: 1 })
SpotForecastDailySchema.index({ date: 1 })

export const SpotForecastDaily =
  (models.SpotForecastDaily as mongoose.Model<ISpotForecastDaily>) ||
  model<ISpotForecastDaily>("SpotForecastDaily", SpotForecastDailySchema)
