import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import path from 'path';
import {
  ALLOWED_MIME_TYPES,
  AllowedMimeType,
  MAX_FILE_SIZE_BYTES,
} from '../models/Document';

export interface FileSignatureCheck {
  valid: boolean;
  detectedMime?: AllowedMimeType;
  error?: string;
}

export interface FileValidationResult {
  valid: boolean;
  sanitizedFileName: string;
  extension: string;
  mimeType?: AllowedMimeType;
  error?: string;
}

export interface StorageUploadResult {
  success: boolean;
  storagePath?: string;
  error?: string;
}

export interface SignedUrlResult {
  success: boolean;
  signedUrl?: string;
  expiresIn: number;
  error?: string;
}

export interface StorageDeleteResult {
  success: boolean;
  error?: string;
}

/**
 * Validates real binary magic bytes (file signature) to prevent disguised executable uploads.
 *
 * Supported Signatures:
 * - PDF:  %PDF- (0x25 0x50 0x44 0x46 0x2D)
 * - PNG:  \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
 * - JPEG: \xFF\xD8\xFF
 * - WebP: RIFF....WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
 */
export function verifyFileSignature(buffer: Buffer): FileSignatureCheck {
  if (!buffer || buffer.length < 4) {
    return { valid: false, error: 'File buffer is empty or too short for signature validation.' };
  }

  // 1. PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return { valid: true, detectedMime: 'application/pdf' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMime: 'image/png' };
  }

  // 3. JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { valid: true, detectedMime: 'image/jpeg' };
  }

  // 4. WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedMime: 'image/webp' };
  }

  return {
    valid: false,
    error: 'Disallowed or forged file signature. Only authentic PDF, PNG, JPEG, and WebP files are permitted.',
  };
}

/**
 * Validates file upload metadata, size, extension, and binary signature.
 */
export function validateDocumentFile(file: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size?: number;
}): FileValidationResult {
  const size = file.size ?? file.buffer.length;

  // 1. File size bounds
  if (size <= 0) {
    return { valid: false, sanitizedFileName: '', extension: '', error: 'File is empty (0 bytes).' };
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      sanitizedFileName: '',
      extension: '',
      error: `File size (${(size / (1024 * 1024)).toFixed(2)} MB) exceeds the 25 MB limit.`,
    };
  }

  // 2. Sanitize file name & extract extension
  const rawBase = path.basename(file.originalname || 'document');
  const sanitized = rawBase
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.') // Prevent double dots
    .slice(0, 150); // Bound length

  const ext = path.extname(sanitized).toLowerCase();
  const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
  if (!allowedExtensions.includes(ext)) {
    return {
      valid: false,
      sanitizedFileName: sanitized,
      extension: ext,
      error: `Unsupported file extension (${ext}). Allowed: .pdf, .png, .jpg, .jpeg, .webp`,
    };
  }

  // 3. MIME type match
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype as AllowedMimeType)) {
    return {
      valid: false,
      sanitizedFileName: sanitized,
      extension: ext,
      error: `Unsupported declared MIME type: ${file.mimetype}`,
    };
  }

  // 4. Real binary signature verification (prevents renaming evil.exe to safe.pdf)
  const sig = verifyFileSignature(file.buffer);
  if (!sig.valid || !sig.detectedMime) {
    return {
      valid: false,
      sanitizedFileName: sanitized,
      extension: ext,
      error: sig.error || 'File header magic-bytes do not match allowed formats.',
    };
  }

  // Ensure declared MIME type matches detected MIME type (or jpeg/jpg equivalent)
  const isJpegMatch =
    (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') &&
    sig.detectedMime === 'image/jpeg';

  if (file.mimetype !== sig.detectedMime && !isJpegMatch) {
    return {
      valid: false,
      sanitizedFileName: sanitized,
      extension: ext,
      error: `MIME type spoofing detected: Declared '${file.mimetype}' but binary signature is '${sig.detectedMime}'.`,
    };
  }

  return {
    valid: true,
    sanitizedFileName: sanitized,
    extension: ext,
    mimeType: sig.detectedMime,
  };
}

/**
 * Generates an unpredictable, non-enumerable server-side private storage key.
 * Path format: users/<userId>/<uuid>-<sanitizedFileName>
 */
export function generatePrivateStoragePath(userId: string, originalFileName: string): string {
  const rawBase = path.basename(originalFileName);
  const sanitized = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const uniqueId = crypto.randomUUID();
  return `users/${userId}/${uniqueId}-${sanitized}`;
}

let supabaseAdminClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

/**
 * Initializes or returns the server-side Supabase Storage Client using the service-role key.
 * This client is NEVER exposed to frontend bundles.
 */
export function getSupabaseStorageClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (
    supabaseAdminClient &&
    cachedUrl === (supabaseUrl || '') &&
    cachedKey === (serviceRoleKey || '')
  ) {
    return supabaseAdminClient;
  }

  const isConfigured =
    supabaseUrl &&
    serviceRoleKey &&
    !supabaseUrl.includes('your-project') &&
    !serviceRoleKey.includes('your-supabase');

  if (!isConfigured) {
    supabaseAdminClient = null;
    cachedUrl = '';
    cachedKey = '';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[Supabase Storage] Production startup aborted: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.'
      );
    }
    return null;
  }

  cachedUrl = supabaseUrl || '';
  cachedKey = serviceRoleKey || '';
  supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdminClient;
}

export function getStorageBucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'kudumba-vault-documents';
}

/**
 * Uploads a document buffer to the private Supabase storage bucket.
 */
export async function uploadDocumentToStorage(
  storagePath: string,
  buffer: Buffer,
  mimeType: string
): Promise<StorageUploadResult> {
  const isMockActive =
    process.env.NODE_ENV !== 'production' &&
    (process.env.ALLOW_MOCK_STORAGE === 'true' || process.env.NODE_ENV === 'test');

  if (isMockActive) {
    return {
      success: true,
      storagePath,
    };
  }

  const client = getSupabaseStorageClient();
  const bucket = getStorageBucketName();

  // If Supabase is unconfigured in development/test, provide a clean diagnostic
  if (!client) {
    return {
      success: false,
      error: 'Supabase Storage credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env',
    };
  }

  try {
    const { error } = await client.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      return {
        success: false,
        error: `Supabase upload failed: ${error.message}`,
      };
    }

    return {
      success: true,
      storagePath,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Unexpected upload exception: ${msg}`,
    };
  }
}

/**
 * Generates a short-lived cryptographic signed URL (default 15 minutes / 900s).
 * IMPORTANT: Call this ONLY after confirming authenticated user ownership of the document!
 * NEVER store this URL in MongoDB.
 */
export async function createDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 900
): Promise<SignedUrlResult> {
  const bucket = getStorageBucketName();
  const isMockActive =
    process.env.NODE_ENV !== 'production' &&
    (process.env.ALLOW_MOCK_STORAGE === 'true' || process.env.NODE_ENV === 'test');

  if (isMockActive) {
    return {
      success: true,
      signedUrl: `https://mock.storage.local/${bucket}/${storagePath}?token=mock-signed-token&expires=${Date.now() + expiresInSeconds * 1000}`,
      expiresIn: expiresInSeconds,
    };
  }

  const client = getSupabaseStorageClient();

  if (!client) {
    return {
      success: false,
      expiresIn: expiresInSeconds,
      error: 'Supabase Storage is unconfigured. Cannot generate signed URL.',
    };
  }

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return {
        success: false,
        expiresIn: expiresInSeconds,
        error: error ? error.message : 'Signed URL generation returned empty response.',
      };
    }

    return {
      success: true,
      signedUrl: data.signedUrl,
      expiresIn: expiresInSeconds,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      expiresIn: expiresInSeconds,
      error: `Signed URL generation failed: ${msg}`,
    };
  }
}

/**
 * Deletes an object from private Supabase Storage.
 * Used when cleaning up orphaned files or when a user deletes their document.
 */
export async function deleteDocumentFromStorage(storagePath: string): Promise<StorageDeleteResult> {
  const isMockActive =
    process.env.NODE_ENV !== 'production' &&
    (process.env.ALLOW_MOCK_STORAGE === 'true' || process.env.NODE_ENV === 'test');

  if (isMockActive) {
    return { success: true };
  }

  const client = getSupabaseStorageClient();
  const bucket = getStorageBucketName();

  if (!client) {
    return {
      success: false,
      error: 'Supabase storage is unconfigured.',
    };
  }

  try {
    const { error } = await client.storage.from(bucket).remove([storagePath]);
    if (error) {
      return {
        success: false,
        error: `Supabase deletion failed: ${error.message}`,
      };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Storage deletion exception: ${msg}`,
    };
  }
}
