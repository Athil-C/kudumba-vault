import mongoose, { Model, Schema, Types } from 'mongoose';
import { maskSensitiveNumber } from '../utils/vaultLogic';

export const ALLOWED_DOC_CATEGORIES = [
  'IDENTITY',
  'VEHICLE',
  'PROPERTY',
  'MEDICAL',
  'HEALTH',
  'INSURANCE',
  'EDUCATION',
  'FINANCE',
  'FAMILY',
  'GULF',
  'OTHER',
] as const;

export type DocumentCategory = (typeof ALLOWED_DOC_CATEGORIES)[number];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB limit

export interface IDocument {
  ownerId: Types.ObjectId;
  title: string;
  titleMl?: string;
  category: DocumentCategory;
  categoryMl?: string;
  ownerNameEn?: string;
  ownerNameMl?: string;
  memberId?: string;
  authorityEn?: string;
  authorityMl?: string;
  fileName: string;
  storagePath: string; // Private storage key (e.g. "users/ownerId/uuid-sanitized.pdf") - NEVER a public URL
  mimeType: AllowedMimeType;
  fileSize: number; // File size in bytes
  issuedAt?: Date;
  expiryDate?: Date;
  notes?: string;
  docNumber?: string;
  renewalHistory?: Array<{ id?: string; date: string; actionEn?: string; actionMl?: string; by?: string }>;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDocumentMethods {
  getMaskedNumber(): string;
  isExpired(): boolean;
  daysUntilExpiry(referenceDate?: Date): number | null;
}

export type DocumentModelType = Model<IDocument, {}, IDocumentMethods>;

const DocumentSchema = new Schema<IDocument, DocumentModelType, IDocumentMethods>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Document owner ID is required.'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Document title is required.'],
      trim: true,
      minlength: [1, 'Title cannot be empty.'],
      maxlength: [200, 'Title cannot exceed 200 characters.'],
    },
    category: {
      type: String,
      required: [true, 'Document category is required.'],
      uppercase: true,
      enum: {
        values: ALLOWED_DOC_CATEGORIES,
        message: 'Invalid category: {VALUE}',
      },
    },
    fileName: {
      type: String,
      required: [true, 'File name is required.'],
      trim: true,
      maxlength: [255, 'File name cannot exceed 255 characters.'],
      validate: {
        validator(v: string) {
          // Reject directory traversal characters
          return !v.includes('..') && !v.includes('/') && !v.includes('\\');
        },
        message: 'File name cannot contain path separators or directory traversal characters.',
      },
    },
    storagePath: {
      type: String,
      required: [true, 'Storage path is required.'],
      trim: true,
      validate: {
        validator(v: string) {
          // Strictly reject public URLs or external web references
          return !/^https?:\/\//i.test(v) && !v.startsWith('data:');
        },
        message: 'Storage path must be a private object key, never a public URL or data URI.',
      },
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required.'],
      enum: {
        values: ALLOWED_MIME_TYPES,
        message: 'Unsupported MIME type: {VALUE}. Permitted: PDF, JPEG, PNG, WEBP.',
      },
    },
    fileSize: {
      type: Number,
      required: [true, 'File size is required.'],
      min: [1, 'File size must be greater than 0 bytes.'],
      max: [MAX_FILE_SIZE_BYTES, `File size exceeds the 25 MB limit.`],
    },
    issuedAt: {
      type: Date,
      default: undefined,
    },
    expiryDate: {
      type: Date,
      index: true,
      default: undefined,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters.'],
      default: undefined,
    },
    docNumber: {
      type: String,
      trim: true,
      maxlength: [100, 'Document number cannot exceed 100 characters.'],
      default: undefined,
    },
    titleMl: { type: String, trim: true, maxlength: 250 },
    categoryMl: { type: String, trim: true, maxlength: 100 },
    ownerNameEn: { type: String, trim: true, maxlength: 120 },
    ownerNameMl: { type: String, trim: true, maxlength: 120 },
    memberId: { type: String, trim: true, maxlength: 80 },
    authorityEn: { type: String, trim: true, maxlength: 200 },
    authorityMl: { type: String, trim: true, maxlength: 200 },
    renewalHistory: [
      {
        id: { type: String },
        date: { type: String },
        actionEn: { type: String },
        actionMl: { type: String },
        by: { type: String },
      },
    ],
    deletedAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const copy = { ...ret } as unknown as Record<string, unknown>;
        delete copy.__v;
        copy.id = ret._id?.toString();
        // Mask document number if present
        if (copy.docNumber && typeof copy.docNumber === 'string') {
          copy.maskedNumber = maskSensitiveNumber(copy.docNumber);
        }
        return copy;
      },
    },
    toObject: {
      transform(_doc, ret) {
        const copy = { ...ret } as unknown as Record<string, unknown>;
        delete copy.__v;
        copy.id = ret._id?.toString();
        return copy;
      },
    },
  }
);

// Compound Indexes for fast owner queries & expiration jobs
DocumentSchema.index({ ownerId: 1, expiryDate: 1 });
DocumentSchema.index({ ownerId: 1, category: 1 });
DocumentSchema.index({ ownerId: 1, deletedAt: 1 });

// Method: Get masked document number
DocumentSchema.methods.getMaskedNumber = function (): string {
  if (!this.docNumber) return '';
  return maskSensitiveNumber(this.docNumber);
};

// Method: Check if document has expired
DocumentSchema.methods.isExpired = function (): boolean {
  if (!this.expiryDate) return false;
  return new Date(this.expiryDate).getTime() < Date.now();
};

// Method: Days until expiry based on reference date
DocumentSchema.methods.daysUntilExpiry = function (referenceDate?: Date): number | null {
  if (!this.expiryDate) return null;
  const target = new Date(this.expiryDate).getTime();
  const ref = (referenceDate || new Date()).getTime();
  return Math.round((target - ref) / (1000 * 60 * 60 * 24));
};

export const DocumentModel: DocumentModelType =
  (mongoose.models.Document as DocumentModelType) ||
  mongoose.model<IDocument, DocumentModelType>('Document', DocumentSchema);

// Named export alias for Document
export const Document = DocumentModel;

