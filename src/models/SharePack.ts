import mongoose, { Schema, Model, Types } from 'mongoose';

export interface ISharePack {
  ownerId: Types.ObjectId;
  titleEn: string;
  titleMl: string;
  descEn?: string;
  descMl?: string;
  recipientEn?: string;
  recipientMl?: string;
  tag?: string;
  expiryLabelEn?: string;
  expiryLabelMl?: string;
  recipientType?: string;
  docIds: string[];
  active: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SharePackModelType = Model<ISharePack>;

const SharePackSchema = new Schema<ISharePack, SharePackModelType>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    titleEn: {
      type: String,
      required: [true, 'Share pack title in English is required.'],
      trim: true,
      maxlength: 150,
    },
    titleMl: {
      type: String,
      required: [true, 'Share pack title in Malayalam is required.'],
      trim: true,
      maxlength: 150,
    },
    descEn: { type: String, trim: true, maxlength: 500 },
    descMl: { type: String, trim: true, maxlength: 500 },
    recipientEn: { type: String, trim: true, maxlength: 120 },
    recipientMl: { type: String, trim: true, maxlength: 120 },
    tag: { type: String, trim: true, maxlength: 50 },
    expiryLabelEn: { type: String, trim: true, maxlength: 60 },
    expiryLabelMl: { type: String, trim: true, maxlength: 60 },
    recipientType: { type: String, trim: true, maxlength: 80 },
    docIds: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: undefined },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const copy = { ...ret } as unknown as Record<string, unknown>;
        delete copy.__v;
        copy.id = ret._id.toString();
        delete copy._id;
        return copy;
      },
    },
  }
);

SharePackSchema.index({ ownerId: 1, deletedAt: 1 });

export const SharePackModel: SharePackModelType =
  (mongoose.models.SharePack as SharePackModelType) ||
  mongoose.model<ISharePack, SharePackModelType>('SharePack', SharePackSchema);
