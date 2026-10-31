import { VaultDocumentItem } from '../types/vault';
import { STORAGE_KEYS, INITIAL_DOCS, loadFromStorage } from '../data/initialVaultData';
import { apiUploadDocument } from '../services/apiClient';

export interface LocalVaultInspection {
  totalDocs: number;
  sampleDocsCount: number;
  userDocsCount: number;
  sampleDocs: VaultDocumentItem[];
  userDocs: VaultDocumentItem[];
  hasCustomData: boolean;
}

export interface MigrationProgressReport {
  total: number;
  migrated: number;
  failed: number;
  skipped: number;
  details: Array<{
    title: string;
    status: 'succeeded' | 'failed' | 'skipped';
    error?: string;
  }>;
}

// Known IDs of legacy pre-seeded sample documents to prevent migrating dummy data
export const SAMPLE_DOC_IDS = new Set(['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']);

/**
 * Inspects localStorage to distinguish sample/demo documents from custom user-created documents.
 */
export function inspectLocalVaultData(): LocalVaultInspection {
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEYS.DOCS) ||
      window.localStorage.getItem('kudumba_vault_docs_v3');
    if (!raw) {
      return {
        totalDocs: 0,
        sampleDocsCount: 0,
        userDocsCount: 0,
        sampleDocs: [],
        userDocs: [],
        hasCustomData: false,
      };
    }

    const docs: VaultDocumentItem[] = JSON.parse(raw);
    const sampleDocs: VaultDocumentItem[] = [];
    const userDocs: VaultDocumentItem[] = [];

    for (const doc of docs) {
      // If doc has a custom ID or custom properties not in initial seed, classify as user doc
      const isKnownSample = SAMPLE_DOC_IDS.has(doc.id);
      if (isKnownSample) {
        sampleDocs.push(doc);
      } else {
        userDocs.push(doc);
      }
    }

    return {
      totalDocs: docs.length,
      sampleDocsCount: sampleDocs.length,
      userDocsCount: userDocs.length,
      sampleDocs,
      userDocs,
      hasCustomData: userDocs.length > 0,
    };
  } catch {
    return {
      totalDocs: 0,
      sampleDocsCount: 0,
      userDocsCount: 0,
      sampleDocs: [],
      userDocs: [],
      hasCustomData: false,
    };
  }
}

/**
 * Exports a snapshot of the current local vault state as a downloadable JSON file.
 */
export function exportLocalVaultBackup(): void {
  try {
    const docs = loadFromStorage(STORAGE_KEYS.DOCS, []);
    const members = loadFromStorage(STORAGE_KEYS.MEMBERS, []);
    const workers = loadFromStorage(STORAGE_KEYS.WORKERS, []);

    const backupData = {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      generator: 'Kudumba Vault Local Storage Migration Assistant',
      data: {
        documents: docs,
        members,
        workers,
      },
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kudumba-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[Migration] Failed to generate local backup export:', err);
  }
}

/**
 * Converts a base64 Data URL to a native binary Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;

    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Controlled migration: Uploads inspected user documents to the authenticated user's cloud vault.
 * Does not overwrite or clear localStorage until the user is satisfied.
 */
export async function migrateUserDocumentsToCloud(
  documentsToMigrate: VaultDocumentItem[],
  onProgress?: (progress: { current: number; total: number; title: string }) => void
): Promise<MigrationProgressReport> {
  const report: MigrationProgressReport = {
    total: documentsToMigrate.length,
    migrated: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  for (let i = 0; i < documentsToMigrate.length; i++) {
    const doc = documentsToMigrate[i];
    onProgress?.({ current: i + 1, total: documentsToMigrate.length, title: doc.titleEn });

    try {
      // Extract binary file data
      let blob: Blob | null = null;
      let fileName = doc.fileName || `${doc.titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.png`;

      if (doc.fileDataUrl) {
        blob = dataUrlToBlob(doc.fileDataUrl);
      } else if (doc.attachmentDataUrl) {
        blob = dataUrlToBlob(doc.attachmentDataUrl);
        fileName = doc.attachmentName || fileName;
      }

      // If no valid file binary exists, create a minimal fallback scan image
      if (!blob) {
        // Fallback placeholder PDF or text blob
        blob = new Blob([`%PDF-1.4\n% Kudumba Vault Export Placeholder for ${doc.titleEn}\n%%EOF`], {
          type: 'application/pdf',
        });
        fileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
      }

      // Map category
      const category = (doc.category || doc.categoryId || 'OTHER').toUpperCase();

      await apiUploadDocument(blob, fileName, {
        title: doc.titleEn || doc.titleMl || 'Imported Document',
        category,
        docNumber: doc.docNumber || undefined,
        expiryDate: doc.expiryDate && doc.expiryDate !== 'Lifetime' ? doc.expiryDate : undefined,
        notes: `Imported from local browser vault on ${new Date().toLocaleDateString()}`,
      });

      report.migrated++;
      report.details.push({
        title: doc.titleEn,
        status: 'succeeded',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      report.failed++;
      report.details.push({
        title: doc.titleEn,
        status: 'failed',
        error: msg,
      });
    }
  }

  return report;
}
