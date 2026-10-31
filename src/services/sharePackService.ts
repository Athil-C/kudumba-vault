import mongoose, { Types } from 'mongoose';
import { SharePackModel, ISharePack } from '../models/SharePack';
import { isDbReady } from './documentService';

export interface CreateSharePackInput {
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
}

export async function listSharePacks(ownerId: string): Promise<any[]> {
  if (!isDbReady()) {
    throw new Error('Database is unavailable. Cannot list share packs.');
  }

  if (!Types.ObjectId.isValid(ownerId)) {
    return [];
  }
  const queryOwnerId = new Types.ObjectId(ownerId);

  const packs = await SharePackModel.find({
    ownerId: queryOwnerId,
    deletedAt: null,
  }).sort({ createdAt: -1 });

  return packs.map((p) => p.toJSON());
}

export async function createSharePack(
  ownerId: string,
  input: CreateSharePackInput
): Promise<any> {
  if (!isDbReady()) {
    throw new Error('Database is unavailable. Cannot create share pack.');
  }

  const titleEn = (input.titleEn || '').trim();
  const titleMl = (input.titleMl || titleEn).trim();
  if (!titleEn) {
    throw new Error('Share pack title is required.');
  }

  if (!Types.ObjectId.isValid(ownerId)) {
    throw new Error('Invalid owner ID format.');
  }
  const queryOwnerId = new Types.ObjectId(ownerId);

  const pack = new SharePackModel({
    ownerId: queryOwnerId,
    titleEn,
    titleMl,
    descEn: input.descEn?.trim(),
    descMl: input.descMl?.trim(),
    recipientEn: input.recipientEn?.trim(),
    recipientMl: input.recipientMl?.trim(),
    tag: input.tag?.trim() || '24h Link',
    expiryLabelEn: input.expiryLabelEn?.trim(),
    expiryLabelMl: input.expiryLabelMl?.trim(),
    recipientType: input.recipientType?.trim(),
    docIds: input.docIds || [],
    active: true,
  });

  await pack.save();
  return pack.toJSON();
}

export async function deleteSharePack(
  ownerId: string,
  packId: string
): Promise<{ success: boolean }> {
  if (!isDbReady()) {
    throw new Error('Database is unavailable. Cannot delete share pack.');
  }

  if (!Types.ObjectId.isValid(packId)) {
    throw new Error('Invalid share pack ID format.');
  }

  if (!Types.ObjectId.isValid(ownerId)) {
    throw new Error('Invalid owner ID format.');
  }
  const queryOwnerId = new Types.ObjectId(ownerId);

  const result = await SharePackModel.findOneAndUpdate(
    { _id: new Types.ObjectId(packId), ownerId: queryOwnerId, deletedAt: null },
    { deletedAt: new Date() }
  );

  if (!result) {
    throw new Error('Share pack not found or access denied.');
  }

  return { success: true };
}
