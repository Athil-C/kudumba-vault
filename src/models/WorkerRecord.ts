import mongoose, { Schema, Model, Types } from 'mongoose';

export interface IWorkerHistoryEntry {
  id: string;
  date: string;
  workEn: string;
  workMl: string;
  amount: number;
  paid: boolean;
  photoDataUrl?: string;
  reminderCreated?: boolean;
}

export interface IWorkerRecord {
  ownerId: Types.ObjectId;
  nameEn: string;
  nameMl: string;
  areaEn: string;
  areaMl: string;
  tradeEn?: string;
  tradeMl?: string;
  tradeId?: string;
  iconName?: string;
  countryCode: string;
  phone: string;
  altPhone?: string;
  whatsapp: string;
  rateAmount?: number;
  rateUnit?: string;
  lastVisit?: string;
  lastServiceDate?: string;
  notesEn?: string;
  notesMl?: string;
  rating: number;
  favourite: boolean;
  history: IWorkerHistoryEntry[];
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkerRecordModelType = Model<IWorkerRecord>;

const WorkerHistorySchema = new Schema<IWorkerHistoryEntry>(
  {
    id: { type: String, required: true },
    date: { type: String, required: true },
    workEn: { type: String, required: true },
    workMl: { type: String, required: true },
    amount: { type: Number, default: 0 },
    paid: { type: Boolean, default: false },
    photoDataUrl: { type: String },
    reminderCreated: { type: Boolean, default: false },
  },
  { _id: false }
);

const WorkerRecordSchema = new Schema<IWorkerRecord, WorkerRecordModelType>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    nameEn: {
      type: String,
      required: [true, 'Worker name in English is required.'],
      trim: true,
      maxlength: 120,
    },
    nameMl: {
      type: String,
      required: [true, 'Worker name in Malayalam is required.'],
      trim: true,
      maxlength: 120,
    },
    areaEn: { type: String, required: true, trim: true, maxlength: 120 },
    areaMl: { type: String, required: true, trim: true, maxlength: 120 },
    tradeEn: { type: String, trim: true, maxlength: 80 },
    tradeMl: { type: String, trim: true, maxlength: 80 },
    tradeId: { type: String, trim: true, maxlength: 60 },
    iconName: { type: String, trim: true, maxlength: 40 },
    countryCode: { type: String, default: '+91', maxlength: 10 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    altPhone: { type: String, trim: true, maxlength: 40 },
    whatsapp: { type: String, required: true, trim: true, maxlength: 40 },
    rateAmount: { type: Number, default: 0 },
    rateUnit: { type: String, default: 'per visit' },
    lastVisit: { type: String },
    lastServiceDate: { type: String },
    notesEn: { type: String, trim: true, maxlength: 1000 },
    notesMl: { type: String, trim: true, maxlength: 1000 },
    rating: { type: Number, default: 5.0, min: 1, max: 5 },
    favourite: { type: Boolean, default: false },
    history: { type: [WorkerHistorySchema], default: [] },
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

WorkerRecordSchema.index({ ownerId: 1, deletedAt: 1 });

export const WorkerRecordModel: WorkerRecordModelType =
  (mongoose.models.WorkerRecord as WorkerRecordModelType) ||
  mongoose.model<IWorkerRecord, WorkerRecordModelType>(
    'WorkerRecord',
    WorkerRecordSchema
  );
