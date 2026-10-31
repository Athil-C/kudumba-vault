import mongoose, { Schema, Model, Types } from 'mongoose';

export type HouseholdMemberStatus = 'ACTIVE' | 'INVITED' | 'REMOVED';

export interface IHouseholdMember {
  ownerId: Types.ObjectId;
  nameEn: string;
  nameMl: string;
  relationEn: string;
  relationMl: string;
  location?: string;
  locEn?: string;
  locMl?: string;
  phone?: string;
  normalizedPhone?: string;
  whatsapp?: string;
  email?: string;
  normalizedEmail?: string;
  homePhone?: string;
  residencyStatus?: string;
  householdName?: string;
  role: 'OWNER' | 'EDITOR';
  status: HouseholdMemberStatus;
  invitedBy?: Types.ObjectId;
  invitationAcceptedAt?: Date;
  seatNumber?: number;
  initials: string;
  colorHex?: string;
  avatarBg?: string;
  avatarDataUrl?: string;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type HouseholdMemberModelType = Model<IHouseholdMember>;

const HouseholdMemberSchema = new Schema<IHouseholdMember, HouseholdMemberModelType>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    nameEn: {
      type: String,
      required: [true, 'Member name in English is required.'],
      trim: true,
      maxlength: 120,
    },
    nameMl: {
      type: String,
      required: [true, 'Member name in Malayalam is required.'],
      trim: true,
      maxlength: 120,
    },
    relationEn: {
      type: String,
      required: [true, 'Relation in English is required.'],
      trim: true,
      maxlength: 80,
    },
    relationMl: {
      type: String,
      required: [true, 'Relation in Malayalam is required.'],
      trim: true,
      maxlength: 80,
    },
    location: { type: String, trim: true, maxlength: 120 },
    locEn: { type: String, trim: true, maxlength: 120 },
    locMl: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 40 },
    normalizedPhone: { type: String, trim: true, maxlength: 40, index: true },
    whatsapp: { type: String, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    normalizedEmail: { type: String, trim: true, lowercase: true, maxlength: 120, index: true },
    homePhone: { type: String, trim: true, maxlength: 40 },
    residencyStatus: { type: String, trim: true, maxlength: 80 },
    householdName: { type: String, trim: true, maxlength: 120 },
    role: {
      type: String,
      enum: ['OWNER', 'EDITOR'],
      default: 'EDITOR',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INVITED', 'REMOVED'],
      default: 'ACTIVE',
      index: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    invitationAcceptedAt: { type: Date },
    seatNumber: { type: Number, index: true },
    initials: {
      type: String,
      trim: true,
      maxlength: 5,
      default: 'KV',
    },
    colorHex: { type: String, trim: true, maxlength: 20 },
    avatarBg: { type: String, trim: true, maxlength: 20 },
    avatarDataUrl: { type: String, trim: true },
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

// Indexes
HouseholdMemberSchema.index({ ownerId: 1, deletedAt: 1, status: 1 });
HouseholdMemberSchema.index(
  { ownerId: 1, seatNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, seatNumber: { $type: 'number' } } }
);
HouseholdMemberSchema.index(
  { ownerId: 1, nameEn: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
HouseholdMemberSchema.index(
  { ownerId: 1, normalizedPhone: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, normalizedPhone: { $type: 'string', $gt: '' } } }
);
HouseholdMemberSchema.index(
  { ownerId: 1, normalizedEmail: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, normalizedEmail: { $type: 'string', $gt: '' } } }
);

export const HouseholdMemberModel: HouseholdMemberModelType =
  (mongoose.models.HouseholdMember as HouseholdMemberModelType) ||
  mongoose.model<IHouseholdMember, HouseholdMemberModelType>(
    'HouseholdMember',
    HouseholdMemberSchema
  );

// Named export alias for HouseholdMember
export const HouseholdMember = HouseholdMemberModel;

