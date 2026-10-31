import mongoose, { Types } from 'mongoose';
import {
  DocumentModel,
  IDocument,
  ALLOWED_DOC_CATEGORIES,
  DocumentCategory,
} from '../models/Document';
import { HouseholdMemberModel } from '../models/HouseholdMember';
import { Subscription } from '../models/Subscription';
import { AUTHORITATIVE_PLANS } from '../config/planConfig';
import {
  validateDocumentFile,
  generatePrivateStoragePath,
  uploadDocumentToStorage,
  createDocumentSignedUrl,
  deleteDocumentFromStorage,
} from './supabaseStorage';
import { assertDocumentOwnership } from '../middleware/auth';

export interface DocumentUploadInput {
  title: string;
  category: string;
  docNumber?: string;
  expiryDate?: string;
  issuedAt?: string;
  notes?: string;
  titleMl?: string;
  categoryMl?: string;
  ownerNameEn?: string;
  ownerNameMl?: string;
  memberId?: string;
  authorityEn?: string;
  authorityMl?: string;
  renewalHistory?: Array<{ id?: string; date: string; actionEn?: string; actionMl?: string; by?: string }>;
}

export interface DocumentUpdateInput {
  title?: string;
  category?: string;
  docNumber?: string;
  expiryDate?: string | null;
  issuedAt?: string | null;
  notes?: string;
  titleMl?: string;
  categoryMl?: string;
  ownerNameEn?: string;
  ownerNameMl?: string;
  memberId?: string;
  authorityEn?: string;
  authorityMl?: string;
  renewalHistory?: Array<{ id?: string; date: string; actionEn?: string; actionMl?: string; by?: string }>;
}

export interface DocumentFilterOptions {
  category?: string;
  status?: 'EXPIRED' | 'DUE_SOON' | 'VALID';
}

// In-memory mock store for test/offline development
const mockDocStore = new Map<string, any>();

export function clearMockDocStore(): void {
  mockDocStore.clear();
}

export function getMockDocStore(): Map<string, any> {
  return mockDocStore;
}

export function isDbReady(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Validates that a referenced household member strictly belongs to the authenticated user.
 * Prevents Insecure Direct Object Reference (IDOR) attacks across households.
 */
export async function verifyMemberBelongsToUser(memberId: string, userId: string): Promise<boolean> {
  if (!memberId || !userId) return false;
  if (isDbReady() && Types.ObjectId.isValid(memberId) && Types.ObjectId.isValid(userId)) {
    const member = await HouseholdMemberModel.findOne({
      _id: new Types.ObjectId(memberId),
      ownerId: new Types.ObjectId(userId),
      deletedAt: null,
    }).select('_id').lean();
    return Boolean(member);
  }
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    try {
      const { getMockMember } = await import('./memberService');
      const m = getMockMember(memberId);
      if (m && !m.deletedAt && String(m.ownerId) === String(userId)) {
        return true;
      }
    } catch {}
  }
  return false;
}

/**
 * Validates whether an ID string is a valid MongoDB ObjectId format.
 */
export function isValidDocumentId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) || id.startsWith('mock-doc-');
}

/**
 * Lists active documents owned by the authenticated user with optional category & status filtering.
 */
export async function listUserDocuments(
  userId: string,
  filter?: DocumentFilterOptions
): Promise<any[]> {
  const isDb = isDbReady();

  // Validate category filter if provided
  if (filter?.category && !ALLOWED_DOC_CATEGORIES.includes(filter.category.toUpperCase() as DocumentCategory)) {
    throw new Error(`Invalid category filter: ${filter.category}`);
  }

  if (isDb) {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }
    const query: Record<string, any> = {
      ownerId: new Types.ObjectId(userId),
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };

    if (filter?.category) {
      query.category = filter.category.toUpperCase();
    }

    const now = new Date();
    if (filter?.status === 'EXPIRED') {
      query.expiryDate = { $lt: now };
    } else if (filter?.status === 'DUE_SOON') {
      const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      query.expiryDate = { $gte: now, $lte: thirtyDays };
    } else if (filter?.status === 'VALID') {
      const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      query.expiryDate = { $gt: thirtyDays };
    }

    const docs = await DocumentModel.find(query).sort({ expiryDate: 1, createdAt: -1 });
    const serialized = await Promise.all(
      docs.map(async (d) => {
        const json = d.toJSON() as any;
        if (json.storagePath) {
          try {
            const signed = await createDocumentSignedUrl(json.storagePath, 3600);
            if (signed.success && signed.signedUrl) {
              json.signedUrl = signed.signedUrl;
              json.fileDataUrl = signed.signedUrl;
            }
          } catch {
            // Non-blocking for listing
          }
        }
        return json;
      })
    );
    return serialized;
  }

  // Fallback for test / offline development
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    let list = Array.from(mockDocStore.values()).filter(
      (d) => d.ownerId === userId && !d.deletedAt
    );

    if (filter?.category) {
      const cat = filter.category.toUpperCase();
      list = list.filter((d) => d.category === cat);
    }

    const nowTime = Date.now();
    if (filter?.status === 'EXPIRED') {
      list = list.filter((d) => d.expiryDate && new Date(d.expiryDate).getTime() < nowTime);
    } else if (filter?.status === 'DUE_SOON') {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      list = list.filter((d) => {
        if (!d.expiryDate) return false;
        const time = new Date(d.expiryDate).getTime();
        return time >= nowTime && time <= nowTime + thirtyDaysMs;
      });
    } else if (filter?.status === 'VALID') {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      list = list.filter((d) => {
        if (!d.expiryDate) return true;
        const time = new Date(d.expiryDate).getTime();
        return time > nowTime + thirtyDaysMs;
      });
    }

    return list;
  }

  throw new Error('Database is unavailable. Cannot list documents.');
}

/**
 * Uploads file to private Supabase Storage, validates file signature & magic bytes,
 * and creates document metadata in MongoDB.
 * Implements compensating rollback cleanup if MongoDB creation fails.
 */
export async function uploadAndCreateDocument(
  userId: string,
  file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
    size?: number;
  },
  metadata: DocumentUploadInput
): Promise<any> {
  // 1. Validate file format, magic bytes, size bounds, and extension
  const fileValidation = validateDocumentFile(file);
  if (!fileValidation.valid || !fileValidation.mimeType) {
    throw new Error(fileValidation.error || 'File validation failed.');
  }

  // 2. Validate metadata fields
  const title = String(metadata.title || '').trim();
  if (!title) {
    throw new Error('Document title is required.');
  }

  const category = String(metadata.category || '').toUpperCase().trim() as DocumentCategory;
  if (!ALLOWED_DOC_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${metadata.category}. Permitted: ${ALLOWED_DOC_CATEGORIES.join(', ')}`);
  }

  let expiryDate: Date | undefined;
  if (metadata.expiryDate && metadata.expiryDate.trim()) {
    const parsed = new Date(metadata.expiryDate.trim());
    if (isNaN(parsed.getTime())) {
      throw new Error('Invalid expiryDate format. Expected YYYY-MM-DD.');
    }
    expiryDate = parsed;
  }

  let issuedAt: Date | undefined;
  if (metadata.issuedAt && metadata.issuedAt.trim()) {
    const parsed = new Date(metadata.issuedAt.trim());
    if (isNaN(parsed.getTime())) {
      throw new Error('Invalid issuedAt format. Expected YYYY-MM-DD.');
    }
    issuedAt = parsed;
  }

  // IDOR Protection: Verify memberId belongs to the authenticated user's household
  const rawMemberId = metadata.memberId ? String(metadata.memberId).trim() : undefined;
  if (rawMemberId) {
    const isMemberOwned = await verifyMemberBelongsToUser(rawMemberId, userId);
    if (!isMemberOwned) {
      const err = new Error('Forbidden: The specified household member does not belong to your account.');
      (err as any).statusCode = 403;
      throw err;
    }
  }

  // 3. Generate unpredictable private storage key
  const storagePath = generatePrivateStoragePath(userId, fileValidation.sanitizedFileName);

  // 4. Upload to private Supabase Storage bucket
  const uploadResult = await uploadDocumentToStorage(
    storagePath,
    file.buffer,
    fileValidation.mimeType
  );

  if (!uploadResult.success) {
    throw new Error(uploadResult.error || 'Failed to upload document file to secure storage.');
  }

  // 5. Save document metadata in MongoDB (with rollback cleanup on error)
  const isDb = isDbReady();

  if (isDb) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format for document ownership.');
    }
    try {
      const doc = new DocumentModel({
        ownerId: new Types.ObjectId(userId),
        title,
        titleMl: metadata.titleMl?.trim() || undefined,
        category,
        categoryMl: metadata.categoryMl?.trim() || undefined,
        ownerNameEn: metadata.ownerNameEn?.trim() || undefined,
        ownerNameMl: metadata.ownerNameMl?.trim() || undefined,
        memberId: metadata.memberId?.trim() || undefined,
        authorityEn: metadata.authorityEn?.trim() || undefined,
        authorityMl: metadata.authorityMl?.trim() || undefined,
        fileName: fileValidation.sanitizedFileName,
        storagePath,
        mimeType: fileValidation.mimeType,
        fileSize: file.size ?? file.buffer.length,
        expiryDate,
        issuedAt,
        notes: metadata.notes?.trim() || undefined,
        docNumber: metadata.docNumber?.trim() || undefined,
        renewalHistory: metadata.renewalHistory || undefined,
      });

      await doc.save();
      const json = doc.toJSON() as any;
      try {
        const signed = await createDocumentSignedUrl(storagePath, 3600);
        if (signed.success && signed.signedUrl) {
          json.signedUrl = signed.signedUrl;
          json.fileDataUrl = signed.signedUrl;
        }
      } catch {
        // Non-blocking
      }
      return json;
    } catch (dbErr: unknown) {
      // Compensating transaction: Clean up uploaded storage object to prevent orphans
      console.warn(`[DocumentService] MongoDB save failed. Cleaning up storage object: ${storagePath}`);
      await deleteDocumentFromStorage(storagePath);
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      throw new Error(`Database error saving document: ${msg}`);
    }
  }

  // Fallback for test / offline development
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const id = `mock-doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const mockDoc = {
      _id: id,
      id,
      ownerId: userId,
      title,
      titleMl: metadata.titleMl?.trim() || undefined,
      category,
      categoryMl: metadata.categoryMl?.trim() || undefined,
      ownerNameEn: metadata.ownerNameEn?.trim() || undefined,
      ownerNameMl: metadata.ownerNameMl?.trim() || undefined,
      memberId: metadata.memberId?.trim() || undefined,
      authorityEn: metadata.authorityEn?.trim() || undefined,
      authorityMl: metadata.authorityMl?.trim() || undefined,
      fileName: fileValidation.sanitizedFileName,
      storagePath,
      mimeType: fileValidation.mimeType,
      fileSize: file.size ?? file.buffer.length,
      expiryDate: expiryDate ? expiryDate.toISOString().split('T')[0] : undefined,
      issuedAt: issuedAt ? issuedAt.toISOString().split('T')[0] : undefined,
      notes: metadata.notes?.trim() || undefined,
      docNumber: metadata.docNumber?.trim() || undefined,
      renewalHistory: metadata.renewalHistory || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    mockDocStore.set(id, mockDoc);
    return mockDoc;
  }

  // If in production without DB, roll back storage and throw
  await deleteDocumentFromStorage(storagePath);
  throw new Error('Database is unavailable. Cannot save document metadata.');
}

/**
 * Retrieves a single document by ID, strictly enforcing user ownership (IDOR protection).
 */
export async function getDocumentById(
  documentId: string,
  userId: string,
  userRole?: string
): Promise<any> {
  if (!isValidDocumentId(documentId)) {
    throw new Error('Invalid document ID format.');
  }

  const isDb = isDbReady();

  if (isDb) {
    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    });

    if (!doc) return null;

    // Strict ownership verification
    const isOwner = assertDocumentOwnership(doc.ownerId, userId, userRole);
    if (!isOwner) {
      const err = new Error('Forbidden: You do not have permission to access this document.');
      (err as any).statusCode = 403;
      throw err;
    }

    return doc.toJSON();
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const doc = mockDocStore.get(documentId);
    if (!doc || doc.deletedAt) return null;

    const isOwner = assertDocumentOwnership(doc.ownerId, userId, userRole);
    if (!isOwner) {
      const err = new Error('Forbidden: You do not have permission to access this document.');
      (err as any).statusCode = 403;
      throw err;
    }

    return doc;
  }

  throw new Error('Database is unavailable.');
}

/**
 * Generates a short-lived signed download URL (15 minutes) after verifying ownership.
 */
export async function generateDocumentDownloadUrl(
  documentId: string,
  userId: string,
  userRole?: string
): Promise<{ downloadUrl: string; expiresIn: number; fileName: string; mimeType: string }> {
  const doc = await getDocumentById(documentId, userId, userRole);
  if (!doc) {
    const err = new Error('Document not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  const signed = await createDocumentSignedUrl(doc.storagePath, 900);
  if (!signed.success || !signed.signedUrl) {
    throw new Error(signed.error || 'Failed to generate signed download URL.');
  }

  return {
    downloadUrl: signed.signedUrl,
    expiresIn: signed.expiresIn,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
  };
}

/**
 * Updates allowed metadata fields for a document after verifying ownership.
 */
export async function updateDocumentMetadata(
  documentId: string,
  userId: string,
  updates: DocumentUpdateInput,
  userRole?: string
): Promise<any> {
  const doc = await getDocumentById(documentId, userId, userRole);
  if (!doc) {
    const err = new Error('Document not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  const patch: Record<string, any> = {};

  if (updates.title !== undefined) {
    const t = String(updates.title).trim();
    if (!t) throw new Error('Document title cannot be empty.');
    patch.title = t;
  }

  if (updates.category !== undefined) {
    const cat = String(updates.category).toUpperCase().trim() as DocumentCategory;
    if (!ALLOWED_DOC_CATEGORIES.includes(cat)) {
      throw new Error(`Invalid category: ${updates.category}`);
    }
    patch.category = cat;
  }

  if (updates.notes !== undefined) {
    patch.notes = updates.notes ? String(updates.notes).trim() : undefined;
  }

  if (updates.docNumber !== undefined) {
    patch.docNumber = updates.docNumber ? String(updates.docNumber).trim() : undefined;
  }

  if (updates.expiryDate !== undefined) {
    if (updates.expiryDate === null || updates.expiryDate === '') {
      patch.expiryDate = null;
    } else {
      const d = new Date(updates.expiryDate);
      if (isNaN(d.getTime())) throw new Error('Invalid expiryDate format. Expected YYYY-MM-DD.');
      patch.expiryDate = d;
    }
  }

  if (updates.issuedAt !== undefined) {
    if (updates.issuedAt === null || updates.issuedAt === '') {
      patch.issuedAt = null;
    } else {
      const d = new Date(updates.issuedAt);
      if (isNaN(d.getTime())) throw new Error('Invalid issuedAt format. Expected YYYY-MM-DD.');
      patch.issuedAt = d;
    }
  }

  if (updates.titleMl !== undefined) {
    patch.titleMl = updates.titleMl ? String(updates.titleMl).trim() : undefined;
  }
  if (updates.categoryMl !== undefined) {
    patch.categoryMl = updates.categoryMl ? String(updates.categoryMl).trim() : undefined;
  }
  if (updates.ownerNameEn !== undefined) {
    patch.ownerNameEn = updates.ownerNameEn ? String(updates.ownerNameEn).trim() : undefined;
  }
  if (updates.ownerNameMl !== undefined) {
    patch.ownerNameMl = updates.ownerNameMl ? String(updates.ownerNameMl).trim() : undefined;
  }
  if (updates.memberId !== undefined) {
    const rawMemberId = updates.memberId ? String(updates.memberId).trim() : undefined;
    if (rawMemberId) {
      const isMemberOwned = await verifyMemberBelongsToUser(rawMemberId, userId);
      if (!isMemberOwned) {
        const err = new Error('Forbidden: The specified household member does not belong to your account.');
        (err as any).statusCode = 403;
        throw err;
      }
      patch.memberId = rawMemberId;
    } else {
      patch.memberId = undefined;
    }
  }
  if (updates.authorityEn !== undefined) {
    patch.authorityEn = updates.authorityEn ? String(updates.authorityEn).trim() : undefined;
  }
  if (updates.authorityMl !== undefined) {
    patch.authorityMl = updates.authorityMl ? String(updates.authorityMl).trim() : undefined;
  }
  if (updates.renewalHistory !== undefined) {
    patch.renewalHistory = updates.renewalHistory;
  }

  const isDb = isDbReady();

  if (isDb) {
    const updated = await DocumentModel.findByIdAndUpdate(
      documentId,
      { $set: patch },
      { new: true, runValidators: true }
    );
    return updated?.toJSON();
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const existing = mockDocStore.get(documentId);
    const updated = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    mockDocStore.set(documentId, updated);
    return updated;
  }

  throw new Error('Database is unavailable.');
}

/**
 * Replaces an existing document's file attachment.
 * Enforces ownership (IDOR defense), magic-byte file signature validation,
 * storage quota accounting, and compensating rollback on error.
 */
export async function replaceDocumentFile(
  documentId: string,
  userId: string,
  file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
    size?: number;
  },
  userRole?: string
): Promise<any> {
  const existingDoc = await getDocumentById(documentId, userId, userRole);
  if (!existingDoc) {
    const err = new Error('Document not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  // 1. Validate replacement file (signature, magic bytes, extension, bounds)
  const fileValidation = validateDocumentFile(file);
  if (!fileValidation.valid || !fileValidation.mimeType) {
    throw new Error(fileValidation.error || 'File validation failed.');
  }

  // 2. Storage quota check for delta size
  const incomingSize = file.size ?? file.buffer.length;
  const oldSize = existingDoc.fileSize || 0;
  const deltaSize = Math.max(0, incomingSize - oldSize);

  if (deltaSize > 0) {
    const { validateUploadEntitlement } = await import('./subscriptionService');
    const quotaCheck = await validateUploadEntitlement(userId, deltaSize);
    if (!quotaCheck.allowed) {
      const err = new Error(quotaCheck.reason || 'Storage quota exceeded.');
      (err as any).statusCode = 403;
      throw err;
    }
  }

  // 3. Generate new unpredictable private storage key
  const newStoragePath = generatePrivateStoragePath(userId, fileValidation.sanitizedFileName);

  // 4. Upload replacement to private Supabase Storage
  const uploadResult = await uploadDocumentToStorage(
    newStoragePath,
    file.buffer,
    fileValidation.mimeType
  );
  if (!uploadResult.success) {
    throw new Error(uploadResult.error || 'Failed to upload replacement file to secure storage.');
  }

  const oldStoragePath = existingDoc.storagePath;
  const isDb = isDbReady();

  if (isDb) {
    try {
      const updated = await DocumentModel.findByIdAndUpdate(
        documentId,
        {
          $set: {
            fileName: fileValidation.sanitizedFileName,
            storagePath: newStoragePath,
            mimeType: fileValidation.mimeType,
            fileSize: incomingSize,
            updatedAt: new Date(),
          },
        },
        { new: true, runValidators: true }
      );

      // Compensating deletion of old storage object after successful update
      if (oldStoragePath && oldStoragePath !== newStoragePath) {
        await deleteDocumentFromStorage(oldStoragePath).catch((delErr) => {
          console.warn('[DocumentService] Notice: could not delete old storage object after replace:', delErr);
        });
      }

      const json = updated?.toJSON() as any;
      try {
        const signed = await createDocumentSignedUrl(newStoragePath, 3600);
        if (signed.success && signed.signedUrl) {
          json.signedUrl = signed.signedUrl;
          json.fileDataUrl = signed.signedUrl;
        }
      } catch {}
      return json;
    } catch (dbErr: unknown) {
      // Compensating rollback: delete newly uploaded file to avoid orphan
      await deleteDocumentFromStorage(newStoragePath).catch(() => {});
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      throw new Error(`Database error replacing document file: ${msg}`);
    }
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const mock = mockDocStore.get(documentId);
    if (mock) {
      mock.fileName = fileValidation.sanitizedFileName;
      mock.storagePath = newStoragePath;
      mock.mimeType = fileValidation.mimeType;
      mock.fileSize = incomingSize;
      mock.updatedAt = new Date().toISOString();
      mockDocStore.set(documentId, mock);
      return mock;
    }
  }

  await deleteDocumentFromStorage(newStoragePath).catch(() => {});
  throw new Error('Database is unavailable.');
}

/**
 * Safely deletes a document by removing its storage object first.
 * If storage deletion fails, aborts to prevent orphaned storage objects.
 */
export async function deleteDocument(
  documentId: string,
  userId: string,
  userRole?: string
): Promise<{ success: boolean; storageDeleted: boolean }> {
  const doc = await getDocumentById(documentId, userId, userRole);
  if (!doc) {
    const err = new Error('Document not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  // 1. Delete private storage object from Supabase first
  const storageResult = await deleteDocumentFromStorage(doc.storagePath);
  if (!storageResult.success) {
    // If Supabase deletion fails, DO NOT silently delete database record!
    throw new Error(
      `Storage deletion failed: ${storageResult.error}. Document was not deleted from database to prevent orphaned data.`
    );
  }

  // 2. Mark document as deleted in MongoDB
  const isDb = isDbReady();

  if (isDb) {
    await DocumentModel.findByIdAndUpdate(documentId, {
      $set: { deletedAt: new Date() },
    });
    return { success: true, storageDeleted: true };
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const existing = mockDocStore.get(documentId);
    existing.deletedAt = new Date().toISOString();
    mockDocStore.set(documentId, existing);
    return { success: true, storageDeleted: true };
  }

  throw new Error('Database is unavailable.');
}

/**
 * Retrieves documents expiring within the threshold for the authenticated user.
 */
export async function getExpiringDocuments(
  userId: string,
  daysThreshold: number = 60
): Promise<any[]> {
  const isDb = isDbReady();
  const now = new Date();
  const maxDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

  if (isDb) {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }
    const docs = await DocumentModel.find({
      ownerId: new Types.ObjectId(userId),
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      expiryDate: { $lte: maxDate },
    }).sort({ expiryDate: 1 });

    return docs.map((d) => d.toJSON());
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const userDocs = Array.from(mockDocStore.values()).filter(
      (d) => d.ownerId === userId && !d.deletedAt && d.expiryDate
    );

    const targetTime = maxDate.getTime();
    return userDocs
      .filter((d) => new Date(d.expiryDate).getTime() <= targetTime)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  }

  throw new Error('Database is unavailable.');
}

export const DEFAULT_PLAN_QUOTA_GIB = 3;
export const DEFAULT_PLAN_QUOTA_BYTES = DEFAULT_PLAN_QUOTA_GIB * 1024 * 1024 * 1024; // 3 GiB = 3,221,225,472 bytes

export interface StorageUsageReport {
  usedBytes: number;
  quotaBytes: number;
  percentageUsed: number;
  documentCount: number;
  planName: string;
  quotaGiB: number;
  usedGiB: number;
  categoryBreakdown: Record<string, { count: number; bytes: number }>;
}

/**
 * Single Source of Truth for storage usage calculation.
 * Accurately sums document file sizes from backend metadata,
 * strictly excluding deleted documents, duplicate files, and enforcing tenant isolation.
 */
export async function getUserStorageUsage(
  userId: string,
  planQuotaBytes?: number
): Promise<StorageUsageReport> {
  const isDb = isDbReady();

  // Authoritative plan quota resolution if not explicitly passed
  let safeQuota = typeof planQuotaBytes === 'number' && !isNaN(planQuotaBytes) && planQuotaBytes > 0
    ? planQuotaBytes
    : 0;

  let resolvedPlanName = 'Founding Household (Free Trial / V1 Launch)';

  if (safeQuota <= 0) {
    if (isDb && Types.ObjectId.isValid(userId)) {
      try {
        const sub = await Subscription.findOne({ userId: new Types.ObjectId(userId) });
        if (sub?.planId && AUTHORITATIVE_PLANS[sub.planId]) {
          safeQuota = AUTHORITATIVE_PLANS[sub.planId].storageQuotaBytes;
          resolvedPlanName = AUTHORITATIVE_PLANS[sub.planId].nameEn;
        }
      } catch {
        safeQuota = DEFAULT_PLAN_QUOTA_BYTES;
      }
    } else if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
      try {
        const { _getMockSubscription } = await import('./subscriptionService');
        const mockSub = _getMockSubscription(userId);
        if (mockSub?.planId && AUTHORITATIVE_PLANS[mockSub.planId]) {
          safeQuota = AUTHORITATIVE_PLANS[mockSub.planId].storageQuotaBytes;
          resolvedPlanName = AUTHORITATIVE_PLANS[mockSub.planId].nameEn;
        }
      } catch {
        safeQuota = DEFAULT_PLAN_QUOTA_BYTES;
      }
    }
    if (!safeQuota) {
      safeQuota = DEFAULT_PLAN_QUOTA_BYTES;
    }
  } else {
    for (const plan of Object.values(AUTHORITATIVE_PLANS)) {
      if (plan.storageQuotaBytes === safeQuota) {
        resolvedPlanName = plan.nameEn;
        break;
      }
    }
  }

  let activeDocs: Array<{ id: string; storagePath: string; fileSize: number; category?: string }> = [];

  if (isDb) {
    if (!Types.ObjectId.isValid(userId)) {
      activeDocs = [];
    } else {
      const docs = await DocumentModel.find({
        ownerId: new Types.ObjectId(userId),
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      }).select('storagePath fileSize category');

      activeDocs = docs.map((d) => ({
        id: d._id.toString(),
        storagePath: d.storagePath,
        fileSize: Math.max(0, typeof d.fileSize === 'number' && !isNaN(d.fileSize) ? d.fileSize : 0),
        category: (d.category || 'OTHER').toUpperCase(),
      }));
    }
  } else if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    activeDocs = Array.from(mockDocStore.values())
      .filter((d) => d.ownerId === userId && !d.deletedAt)
      .map((d) => ({
        id: d.id,
        storagePath: d.storagePath,
        fileSize: Math.max(0, typeof d.fileSize === 'number' && !isNaN(d.fileSize) ? d.fileSize : 0),
        category: (d.category || 'OTHER').toUpperCase(),
      }));
  } else {
    throw new Error('Database is unavailable.');
  }

  // Deduplicate by distinct document ID to prevent double-counting
  const seenDocIds = new Set<string>();
  let usedBytes = 0;
  const categoryBreakdown: Record<string, { count: number; bytes: number }> = {
    IDENTITY: { count: 0, bytes: 0 },
    PROPERTY: { count: 0, bytes: 0 },
    VEHICLE: { count: 0, bytes: 0 },
    HEALTH: { count: 0, bytes: 0 },
    GULF: { count: 0, bytes: 0 },
    OTHER: { count: 0, bytes: 0 },
  };

  let uniqueDocumentCount = 0;

  for (const doc of activeDocs) {
    if (!doc.id || seenDocIds.has(doc.id)) {
      continue; // Prevent duplicate metadata accounting
    }
    seenDocIds.add(doc.id);
    uniqueDocumentCount++;

    const size = typeof doc.fileSize === 'number' && !isNaN(doc.fileSize) ? doc.fileSize : 0;
    usedBytes += size;

    const catKey = doc.category === 'MEDICAL' ? 'HEALTH' : doc.category || 'OTHER';
    if (!categoryBreakdown[catKey]) {
      categoryBreakdown[catKey] = { count: 0, bytes: 0 };
    }
    categoryBreakdown[catKey].count += 1;
    categoryBreakdown[catKey].bytes += size;
  }

  const percentageUsed = safeQuota > 0
    ? Math.min(100, Math.max(0, (usedBytes / safeQuota) * 100))
    : 0;

  const GIB = 1024 * 1024 * 1024;

  return {
    usedBytes,
    quotaBytes: safeQuota,
    percentageUsed: Number(percentageUsed.toFixed(1)),
    documentCount: uniqueDocumentCount,
    planName: resolvedPlanName,
    quotaGiB: Number((safeQuota / GIB).toFixed(1)),
    usedGiB: Number((usedBytes / GIB).toFixed(2)),
    categoryBreakdown,
  };
}
