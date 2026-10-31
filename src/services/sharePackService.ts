import mongoose, { Types } from 'mongoose';
import { SharePackModel, ISharePack } from '../models/SharePack';
import { DocumentModel } from '../models/Document';
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

// In-memory mock store for testing and offline development
const mockSharePackStore = new Map<string, any>();

export function _resetMockSharePacks(): void {
  mockSharePackStore.clear();
}

export async function listSharePacks(ownerId: string): Promise<any[]> {
  if (isDbReady()) {
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

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    return Array.from(mockSharePackStore.values()).filter(
      (p) => String(p.ownerId) === String(ownerId) && !p.deletedAt
    );
  }

  throw new Error('Database is unavailable. Cannot list share packs.');
}

export async function createSharePack(
  ownerId: string,
  input: CreateSharePackInput
): Promise<any> {
  const titleEn = (input.titleEn || '').trim();
  const titleMl = (input.titleMl || titleEn).trim();
  if (!titleEn) {
    throw new Error('Share pack title is required.');
  }

  // IDOR Protection: Validate that all referenced document IDs strictly belong to the authenticated owner
  const rawDocIds = (input.docIds || []).map((id) => String(id).trim()).filter(Boolean);
  if (rawDocIds.length > 0) {
    if (isDbReady()) {
      if (!Types.ObjectId.isValid(ownerId)) {
        throw new Error('Invalid owner ID format.');
      }
      const queryOwnerId = new Types.ObjectId(ownerId);
      const validDocObjectIds = rawDocIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      if (validDocObjectIds.length !== rawDocIds.length) {
        const err = new Error('Forbidden: One or more specified document IDs are invalid or access denied.');
        (err as any).statusCode = 403;
        throw err;
      }

      const count = await DocumentModel.countDocuments({
        _id: { $in: validDocObjectIds },
        ownerId: queryOwnerId,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      });

      if (count !== rawDocIds.length) {
        const err = new Error('Forbidden: You do not have permission to share documents belonging to another user.');
        (err as any).statusCode = 403;
        throw err;
      }
    } else if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
      const { getMockDocStore } = await import('./documentService');
      const store = getMockDocStore();
      for (const dId of rawDocIds) {
        const doc = store.get(dId);
        if (!doc || doc.deletedAt || String(doc.ownerId) !== String(ownerId)) {
          const err = new Error('Forbidden: You do not have permission to share documents belonging to another user.');
          (err as any).statusCode = 403;
          throw err;
        }
      }
    }
  }

  if (isDbReady()) {
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
      docIds: rawDocIds,
      active: true,
    });

    await pack.save();
    return pack.toJSON();
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const mockId = `mock-pack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const mockPack = {
      _id: mockId,
      id: mockId,
      ownerId,
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
      docIds: rawDocIds,
      active: true,
      createdAt: new Date().toISOString(),
    };
    mockSharePackStore.set(mockId, mockPack);
    return mockPack;
  }

  throw new Error('Database is unavailable. Cannot create share pack.');
}

export async function deleteSharePack(
  ownerId: string,
  packId: string
): Promise<{ success: boolean }> {
  if (isDbReady()) {
    if (!Types.ObjectId.isValid(packId) || !Types.ObjectId.isValid(ownerId)) {
      const err = new Error('Invalid ID format.');
      (err as any).statusCode = 400;
      throw err;
    }
    const existsAnywhere = await SharePackModel.findById(packId);
    if (!existsAnywhere || existsAnywhere.deletedAt) {
      const err = new Error('Share pack not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (String(existsAnywhere.ownerId) !== String(ownerId)) {
      const err = new Error('Access denied: You do not have permission to delete this share pack.');
      (err as any).statusCode = 403;
      throw err;
    }
    await SharePackModel.findByIdAndUpdate(packId, { $set: { deletedAt: new Date() } });
    return { success: true };
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const existing = mockSharePackStore.get(packId);
    if (!existing || existing.deletedAt) {
      const err = new Error('Share pack not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (String(existing.ownerId) !== String(ownerId)) {
      const err = new Error('Access denied: You do not have permission to delete this share pack.');
      (err as any).statusCode = 403;
      throw err;
    }
    existing.deletedAt = new Date().toISOString();
    mockSharePackStore.set(packId, existing);
    return { success: true };
  }

  throw new Error('Database is unavailable. Cannot delete share pack.');
}
