import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectLocalVaultData,
  dataUrlToBlob,
  LocalVaultInspection,
} from '../utils/localStorageMigration';
import {
  ApiClientError,
} from './apiClient';
import { INITIAL_DOCS } from '../data/initialVaultData';
import { VaultDocumentItem } from '../types/vault';

describe('Phase 5: Frontend Integration & Safe Migration', () => {
  describe('Local Storage Vault Data Inspection', () => {
    it('accurately identifies and separates pre-seeded sample documents from custom user documents', () => {
      // Mock window.localStorage in node environment
      const mockStorage: Record<string, string> = {};
      const customDoc: VaultDocumentItem = {
        id: 'doc-user-created-custom-1',
        titleMl: 'കുടുംബ വസ്തു പ്രമാണം',
        titleEn: 'Kochi Land Title Deed',
        category: 'PROPERTY',
        ownerMl: 'രാഹുൽ',
        ownerEn: 'Rahul Nair',
        docNumber: 'KL-7-2024-9128',
        expiryDate: 'Lifetime',
        status: 'VALID',
        authorityMl: 'സബ് രജിസ്ട്രാർ, ഇടപ്പള്ളി',
        authorityEn: 'Sub Registrar Office, Edappally',
        renewalHistory: [],
      };

      const sampleDocs: VaultDocumentItem[] = [
        {
          id: 'doc-1',
          titleMl: 'ഇഖാമ',
          titleEn: 'Emirates ID',
          category: 'GULF',
          ownerMl: 'കുടുംബം',
          ownerEn: 'Kudumba',
          docNumber: '784-1',
          expiryDate: '2025-05-19',
          status: 'DUE_SOON',
          authorityMl: 'ICP',
          authorityEn: 'ICP UAE',
          renewalHistory: [],
        },
        {
          id: 'doc-2',
          titleMl: 'ഇൻഷുറൻസ്',
          titleEn: 'Car Insurance',
          category: 'VEHICLE',
          ownerMl: 'കുടുംബം',
          ownerEn: 'Kudumba',
          docNumber: 'KL-07',
          expiryDate: '2025-04-28',
          status: 'EXPIRED',
          authorityMl: 'NIA',
          authorityEn: 'New India',
          renewalHistory: [],
        },
        {
          id: 'doc-3',
          titleMl: 'നികുതി',
          titleEn: 'Land Tax',
          category: 'PROPERTY',
          ownerMl: 'കുടുംബം',
          ownerEn: 'Kudumba',
          docNumber: 'LTR-1',
          expiryDate: '2026-03-31',
          status: 'VALID',
          authorityMl: 'റവന്യൂ',
          authorityEn: 'Revenue',
          renewalHistory: [],
        },
      ];

      const mixedDocs: VaultDocumentItem[] = [
        ...sampleDocs, // 3 sample docs
        customDoc,     // 1 custom user doc
      ];

      (globalThis as any).window = {
        localStorage: {
          getItem: (key: string) => mockStorage[key] || null,
          setItem: (key: string, val: string) => {
            mockStorage[key] = val;
          },
        },
      };

      window.localStorage.setItem('kudumba_vault_docs_v3', JSON.stringify(mixedDocs));

      const inspection: LocalVaultInspection = inspectLocalVaultData();

      assert.strictEqual(inspection.totalDocs, 4);
      assert.strictEqual(inspection.sampleDocsCount, 3);
      assert.strictEqual(inspection.userDocsCount, 1);
      assert.strictEqual(inspection.hasCustomData, true);
      assert.strictEqual(inspection.userDocs[0].id, 'doc-user-created-custom-1');
    });

    it('returns empty inspection safely when localStorage is empty', () => {
      (globalThis as any).window = {
        localStorage: {
          getItem: () => null,
          setItem: () => {},
        },
      };

      const inspection = inspectLocalVaultData();
      assert.strictEqual(inspection.totalDocs, 0);
      assert.strictEqual(inspection.hasCustomData, false);
    });
  });

  describe('Data URL to Binary Blob Conversion', () => {
    it('converts a valid base64 PNG data URL to a binary Blob with correct MIME type', () => {
      // Minimal 1x1 PNG data URL
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const blob = dataUrlToBlob(dataUrl);

      assert.ok(blob, 'Blob must be created');
      assert.strictEqual(blob.type, 'image/png');
      assert.ok(blob.size > 0, 'Blob size must be positive');
    });

    it('converts a PDF data URL to an application/pdf Blob', () => {
      const pdfBase64 = Buffer.from('%PDF-1.4 sample content').toString('base64');
      const dataUrl = `data:application/pdf;base64,${pdfBase64}`;
      const blob = dataUrlToBlob(dataUrl);

      assert.ok(blob);
      assert.strictEqual(blob.type, 'application/pdf');
    });

    it('returns null safely for malformed or non-data URLs', () => {
      assert.strictEqual(dataUrlToBlob(''), null);
      assert.strictEqual(dataUrlToBlob('https://example.com/file.pdf'), null);
      assert.strictEqual(dataUrlToBlob('not-a-valid-data-url'), null);
    });
  });

  describe('ApiClient Error Formatting & Session Status', () => {
    it('creates ApiClientError with message and HTTP status code', () => {
      const err = new ApiClientError('Session expired. Please sign in.', 401);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.message, 'Session expired. Please sign in.');
      assert.strictEqual(err.name, 'ApiClientError');
    });
  });
});
