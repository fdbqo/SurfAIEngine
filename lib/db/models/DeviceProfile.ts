import mongoose, { Schema, Document, model, models } from "mongoose"

/** raw wizard preferences */
export type DeviceProfilePreferences = Record<string, unknown>

export interface IDeviceProfile extends Document {
  deviceId: string
  userId: string
  /** hashed device auth token */
  deviceAuthHash?: string
  onboardingCompleted?: boolean
  units?: {
    waveHeight?: string
    windSpeed?: string
    distance?: string
  }
  /** surf skill for the agent */
  skill?: "beginner" | "intermediate" | "advanced"
  preferences: DeviceProfilePreferences
  notificationSettings?: { enabled: boolean }
  usualLocation?: { lat: number; lon: number }
  lastLocation?: {
    lat: number
    lon: number
    source?: "gps" | "ip" | "manual"
    confidence?: "high" | "low"
    updatedAt?: Date
  }
  homeRegion?: string
  usualRegions?: string[]
  createdAt: Date
  updatedAt: Date
}

const DeviceProfileSchema = new Schema<IDeviceProfile>(
  {
    deviceId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    deviceAuthHash: { type: String, required: false, default: null, select: false },
    onboardingCompleted: { type: Boolean, required: false },
    units: {
      type: {
        waveHeight: { type: String, required: false },
        windSpeed: { type: String, required: false },
        distance: { type: String, required: false },
      },
      required: false,
      _id: false,
    },
    skill: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      required: false,
    },
    preferences: { type: Schema.Types.Mixed, required: true, default: {} },
    notificationSettings: {
      type: { enabled: { type: Boolean, required: false } },
      required: false,
      _id: false,
    },
    usualLocation: {
      type: { lat: { type: Number, required: true }, lon: { type: Number, required: true } },
      required: false,
      _id: false,
    },
    lastLocation: {
      type: {
        lat: { type: Number, required: true },
        lon: { type: Number, required: true },
        source: { type: String, enum: ["gps", "ip", "manual"], required: false },
        confidence: { type: String, enum: ["high", "low"], required: false },
        updatedAt: { type: Date, required: false },
      },
      required: false,
      _id: false,
    },
    homeRegion: { type: String, required: false },
    usualRegions: [{ type: String }],
  },
  { timestamps: true, collection: "deviceprofiles" }
)

DeviceProfileSchema.index({ updatedAt: 1 })

export const DeviceProfileModel =
  (models.DeviceProfile as mongoose.Model<IDeviceProfile>) ||
  model<IDeviceProfile>("DeviceProfile", DeviceProfileSchema)
