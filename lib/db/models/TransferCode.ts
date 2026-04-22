import mongoose, { Schema, model, models } from "mongoose"

export interface ITransferCode {
  codeHash: string
  sourceUserId: string
  createdAt: Date
  expiresAt: Date
  usedAt?: Date | null
  usedByDeviceId?: string | null
}

const TransferCodeSchema = new Schema<ITransferCode>(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    sourceUserId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, required: false, default: null },
    usedByDeviceId: { type: String, required: false, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "transfercodes" },
)

// TTL cleanup (MongoDB TTL monitor runs ~every 60s).
TransferCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const TransferCodeModel =
  (models.TransferCode as mongoose.Model<ITransferCode>) ||
  model<ITransferCode>("TransferCode", TransferCodeSchema)

