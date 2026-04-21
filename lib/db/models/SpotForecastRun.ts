import mongoose, { Schema, Document, model, models } from "mongoose"

export interface ISpotForecastRun extends Document {
  spotId: string
  date: Date
  modelRun: string
  runAt: Date
  waveHeight?: number
  score?: number
}

const SpotForecastRunSchema = new Schema<ISpotForecastRun>(
  {
    spotId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    modelRun: { type: String, required: true, index: true },
    runAt: { type: Date, required: true },
    waveHeight: { type: Number, required: false },
    score: { type: Number, required: false, min: 0, max: 10 },
  },
  { timestamps: false, collection: "spotforecastruns" }
)

SpotForecastRunSchema.index({ spotId: 1, date: 1, modelRun: 1 }, { unique: true })
SpotForecastRunSchema.index({ spotId: 1, date: 1 })

export const SpotForecastRun =
  (models.SpotForecastRun as mongoose.Model<ISpotForecastRun>) ||
  model<ISpotForecastRun>("SpotForecastRun", SpotForecastRunSchema)
