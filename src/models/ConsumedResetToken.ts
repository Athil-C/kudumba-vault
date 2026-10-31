import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IConsumedResetToken extends Document {
  jti: string;
  supabaseUserId: string;
  consumedAt: Date;
}

const ConsumedResetTokenSchema = new Schema<IConsumedResetToken>({
  jti: {
    type: String,
    required: true,
    unique: true,
  },
  supabaseUserId: {
    type: String,
    required: true,
    index: true,
  },
  consumedAt: {
    type: Date,
    required: true,
    default: Date.now,
    expires: 900, // MongoDB TTL index: automatically deletes document after 15 minutes (900 seconds)
  },
});

export const ConsumedResetToken: Model<IConsumedResetToken> =
  (mongoose.models.ConsumedResetToken as Model<IConsumedResetToken>) ||
  mongoose.model<IConsumedResetToken>('ConsumedResetToken', ConsumedResetTokenSchema);
