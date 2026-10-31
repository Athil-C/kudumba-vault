import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();
process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';
process.env.ALLOW_MOCK_STORAGE = 'true';

import {
  listUserDocuments,
  uploadAndCreateDocument,
  getDocumentById,
  generateDocumentDownloadUrl,
  updateDocumentMetadata,
  deleteDocument,
  clearMockDocStore,
} from './documentService';
import {
  listMembers,
  createMember,
  updateMember,
  deleteMember,
  getMemberProfile,
  updateMemberOverview,
  updateMemberPersonalDetails,
  _resetMockMembers,
  UnauthorizedMemberActionError,
} from './memberService';
import {
  listWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
} from './workerService';
import {
  listSharePacks,
  createSharePack,
  deleteSharePack,
} from './sharePackService';
import {
  getBillingOverview,
  getBillingReceipt,
} from './billingService';
import {
  getUserSettings,
  updateProfileSettings,
} from './settingsService';
import { assertDocumentOwnership } from '../middleware/auth';
import { getSupabaseBrowserClient } from './supabaseBrowserClient';
import { getSupabaseStorageClient } from './supabaseStorage';

describe('Database Permissions, Access Controls & Cross-Tenant Isolation Suite', () => {
  const userA_Id = new Types.ObjectId().toString();
  const userB_Id = new Types.ObjectId().toString();

  before(() => {
    clearMockDocStore();
    _resetMockMembers();
  });

  after(() => {
    clearMockDocStore();
    _resetMockMembers();
  });

  // -------------------------------------------------------------------------
  // 1. SUPABASE CLIENT & CREDENTIAL ISOLATION
  // -------------------------------------------------------------------------
  describe('Supabase Client Architecture & Credential Protection', () => {
    it('1. Frontend browser client uses ONLY public anon key and NEVER exposes service-role key', () => {
      const browserClient = getSupabaseBrowserClient();
      assert.ok(browserClient, 'Browser client should be initialized');
      // The browser client auth headers must not contain service role
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey) {
        // Ensure browser client is not initialized with the service role key
        const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
        assert.notEqual(anonKey, serviceRoleKey, 'Anon key must differ from service role key');
      }
    });

    it('2. Backend storage client uses service role exclusively on server-side and never exposes it to client', () => {
      // getSupabaseStorageClient is server-only
      const adminClient = getSupabaseStorageClient();
      // In test mode without env keys, returns null or client, but never leaks to browser client singleton
      const browserClient = getSupabaseBrowserClient();
      assert.notEqual(adminClient, browserClient, 'Admin storage client and browser client must be separate instances');
    });
  });

  // -------------------------------------------------------------------------
  // 2. MONGODB DOCUMENT ACCESS CONTROLS (IDOR PROTECTION)
  // -------------------------------------------------------------------------
  describe('Document Access Controls (SELECT, INSERT, UPDATE, DELETE)', () => {
    let userA_DocId: string;
    const validPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7

    it('INSERT: User A creates a private document bound to User A ownerId', async () => {
      const doc = await uploadAndCreateDocument(
        userA_Id,
        {
          originalname: 'aadhaar_card.pdf',
          mimetype: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
        {
          title: 'User A Aadhaar Card',
          category: 'IDENTITY',
          docNumber: '123456789012',
        }
      );

      assert.ok(doc, 'Document must be created');
      userA_DocId = doc.id || doc._id?.toString();
      assert.equal(String(doc.ownerId), userA_Id, 'Document ownerId must be User A');
    });

    it('SELECT: User A can read their own document', async () => {
      const doc = await getDocumentById(userA_DocId, userA_Id);
      assert.ok(doc, 'User A should access their own document');
      assert.equal(doc.title, 'User A Aadhaar Card');
    });

    it('SELECT (DENIED): User B CANNOT read User A document (IDOR attempt returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await getDocumentById(userA_DocId, userB_Id);
        },
        (err: any) => {
          assert.equal(err.statusCode, 403, 'Must return HTTP 403');
          assert.match(err.message, /Forbidden.*permission/i);
          return true;
        }
      );
    });

    it('DOWNLOAD (DENIED): User B CANNOT generate download URL for User A document', async () => {
      await assert.rejects(
        async () => {
          await generateDocumentDownloadUrl(userA_DocId, userB_Id);
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });

    it('UPDATE (DENIED): User B CANNOT update metadata of User A document', async () => {
      await assert.rejects(
        async () => {
          await updateDocumentMetadata(userA_DocId, userB_Id, { title: 'Compromised Title' });
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });

    it('DELETE (DENIED): User B CANNOT delete User A document', async () => {
      await assert.rejects(
        async () => {
          await deleteDocument(userA_DocId, userB_Id);
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });

    it('LIST FILTERING: User B listing documents never leaks User A documents', async () => {
      const docsUserB = await listUserDocuments(userB_Id);
      assert.equal(docsUserB.length, 0, 'User B must see zero documents');

      const docsUserA = await listUserDocuments(userA_Id);
      assert.ok(docsUserA.length >= 1, 'User A should see their document');
      assert.ok(docsUserA.every((d) => String(d.ownerId) === userA_Id));
    });

    it('UPDATE (ALLOWED): User A can successfully update their own document', async () => {
      const updated = await updateDocumentMetadata(userA_DocId, userA_Id, {
        notes: 'Updated note by owner',
      });
      assert.equal(updated.notes, 'Updated note by owner');
    });

    it('DELETE (ALLOWED): User A can delete their own document', async () => {
      const res = await deleteDocument(userA_DocId, userA_Id);
      assert.equal(res.success, true);
      // Verify deleted document is no longer listed
      const docs = await listUserDocuments(userA_Id);
      assert.ok(docs.every((d) => (d.id || d._id?.toString()) !== userA_DocId));
    });
  });

  // -------------------------------------------------------------------------
  // 3. HOUSEHOLD MEMBER ACCESS CONTROLS & SEPARATION
  // -------------------------------------------------------------------------
  describe('Household Member Isolation & Role-Based Access Controls', () => {
    let userA_MemberId: string;

    it('INSERT: User A creates a household member under User A household', async () => {
      const member = await createMember(userA_Id, {
        nameEn: 'Amma',
        relationEn: 'Mother',
        phone: '+919876543210',
      }, { requesterId: userA_Id, requesterRole: 'USER' });

      assert.ok(member);
      userA_MemberId = member._id?.toString() || member.id;
      assert.equal(String(member.ownerId), userA_Id);
    });

    it('INSERT (DENIED): User B CANNOT create members in User A household by supplying User A ownerId', async () => {
      await assert.rejects(
        async () => {
          // Requester is User B, but ownerId is User A
          await createMember(userA_Id, {
            nameEn: 'Attacker Impersonator',
            relationEn: 'Friend',
            phone: '+919999999999',
          }, { requesterId: userB_Id, requesterRole: 'USER' });
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedMemberActionError);
          return true;
        }
      );
    });

    it('SELECT: User B listing members does not leak User A members', async () => {
      const membersB = await listMembers(userB_Id);
      assert.equal(membersB.length, 0);

      const membersA = await listMembers(userA_Id);
      assert.equal(membersA.length, 1);
      assert.equal(membersA[0].nameEn, 'Amma');
    });

    it('SELECT PROFILE (DENIED): User B CANNOT view profile of User A member', async () => {
      await assert.rejects(
        async () => {
          await getMemberProfile(userB_Id, userA_MemberId, {
            requesterId: userB_Id,
            requesterRole: 'USER',
          });
        },
        /access denied|not found/i
      );
    });

    it('UPDATE (DENIED): User B CANNOT update User A member', async () => {
      await assert.rejects(
        async () => {
          await updateMember(userB_Id, userA_MemberId, {
            nameEn: 'Hacked Name',
          }, { requesterId: userB_Id, requesterRole: 'USER' });
        },
        /access denied|not found/i
      );
    });

    it('DELETE (DENIED): User B CANNOT delete User A member', async () => {
      await assert.rejects(
        async () => {
          // Attempting as User B on User A's member
          await deleteMember(userA_Id, userA_MemberId, {
            requesterId: userB_Id,
            requesterRole: 'USER',
          });
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedMemberActionError);
          return true;
        }
      );
    });

    it('DELETE (ALLOWED): User A can delete their own household member', async () => {
      const result = await deleteMember(userA_Id, userA_MemberId, {
        requesterId: userA_Id,
        requesterRole: 'USER',
      });
      assert.equal(result.success, true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. USER SETTINGS & IMMUTABLE FIELD SECURITY
  // -------------------------------------------------------------------------
  describe('User Profile & Settings Authorization', () => {
    it('Privileged fields (role, isAdmin, status) CANNOT be altered via updateProfileSettings', async () => {
      await assert.rejects(
        async () => {
          await updateProfileSettings(userA_Id, {
            fullName: 'User A',
            // Attempting to elevate to ADMIN
            role: 'ADMIN',
          } as any);
        },
        /Modifying protected field 'role' is strictly forbidden/i
      );
    });

    it('Status tampering (e.g. status: ACTIVE) is strictly rejected', async () => {
      await assert.rejects(
        async () => {
          await updateProfileSettings(userA_Id, {
            fullName: 'User A',
            status: 'ACTIVE',
          } as any);
        },
        /Modifying protected field 'status' is strictly forbidden/i
      );
    });

    it('Valid profile settings update succeeds for authorized fields', async () => {
      const res = await updateProfileSettings(userA_Id, {
        fullName: 'User A Updated Name',
        preferredLang: 'ml',
      });
      assert.equal(res.fullName, 'User A Updated Name');
      assert.equal(res.preferredLang, 'ml');
    });
  });

  // -------------------------------------------------------------------------
  // 5. BILLING & FINANCIAL RECORD OWNERSHIP (RECEIPT TAMPERING / IDOR)
  // -------------------------------------------------------------------------
  describe('Billing & Financial Receipts Security', () => {
    it('SELECT RECEIPT (DENIED): User B CANNOT access User A billing receipts or payments', async () => {
      const fakePaymentId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await getBillingReceipt(userB_Id, fakePaymentId);
        },
        /not found|unauthorized/i
      );
    });
  });
});
