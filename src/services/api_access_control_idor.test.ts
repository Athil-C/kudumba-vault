process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';
process.env.ALLOW_MOCK_STORAGE = 'true';
process.env.JWT_SECRET = 'test-super-secret-jwt-key-for-admin-tests-2026';
delete process.env.MONGODB_URI;

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { Types } from 'mongoose';

import { adminRouter } from '../routes/adminRoutes';
import { requireAuth, householdAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/adminAuth';
import { generateAuthToken } from './authService';

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
  _resetMockWorkers,
} from './workerService';

import {
  listSharePacks,
  createSharePack,
  deleteSharePack,
  _resetMockSharePacks,
} from './sharePackService';

import {
  getBillingReceipt,
} from './billingService';

import {
  createPaymentRequest,
  submitPaymentProof,
  cancelPaymentRequest,
  getUpiPaymentConfig,
} from './paymentService';

import {
  updateProfileSettings,
} from './settingsService';

import { clearMockPaymentRequests } from '../models/PaymentRequest';

/**
 * High-fidelity Mock Response extending stream.Writable for Express router handling
 */
class MockResponse extends Writable {
  statusCode: number = 200;
  headers: Record<string, string> = {};
  bodyChunks: Buffer[] = [];
  jsonBody: any = null;

  _write(chunk: any, encoding: string, callback: (error?: Error | null) => void) {
    this.bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = String(value);
    return this;
  }

  getHeader(name: string) {
    return this.headers[name.toLowerCase()];
  }

  json(data: any) {
    this.jsonBody = data;
    this.headers['content-type'] = 'application/json';
    this.end(JSON.stringify(data));
    return this;
  }

  send(data: any) {
    if (typeof data === 'object' && !Buffer.isBuffer(data)) {
      return this.json(data);
    }
    this.end(data);
    return this;
  }

  getBodyBuffer(): Buffer {
    return Buffer.concat(this.bodyChunks);
  }

  getBodyText(): string {
    return this.getBodyBuffer().toString('utf-8');
  }

  getParsedJson(): any {
    if (this.jsonBody) return this.jsonBody;
    try {
      return JSON.parse(this.getBodyText());
    } catch {
      return null;
    }
  }
}

function createMockRequest(options: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  user?: any;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
}) {
  const req: any = {
    method: options.method || 'GET',
    url: options.url,
    originalUrl: `/api/admin${options.url}`,
    headers: options.headers || {},
    user: options.user,
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    ip: '127.0.0.1',
  };
  return req;
}

function executeAdminRoute(req: any, res: MockResponse): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const onDone = () => {
      if (!finished) {
        finished = true;
        resolve();
      }
    };

    res.on('finish', onDone);
    res.on('close', onDone);
    res.on('error', (err) => {
      if (!finished) {
        finished = true;
        reject(err);
      }
    });

    try {
      (adminRouter as any).handle(req, res, (err: any) => {
        if (err) {
          if (!finished) {
            finished = true;
            reject(err);
          }
        } else {
          onDone();
        }
      });
    } catch (e) {
      if (!finished) {
        finished = true;
        reject(e);
      }
    }
  });
}

describe('API Routes, Access Control & IDOR Hardening Suite', () => {
  const userA_Id = new Types.ObjectId().toString();
  const userB_Id = new Types.ObjectId().toString();
  const admin_Id = new Types.ObjectId().toString();

  const userAToken = generateAuthToken({ id: userA_Id, email: 'usera@kudumba.org', role: 'USER' });
  const userBToken = generateAuthToken({ id: userB_Id, email: 'userb@kudumba.org', role: 'USER' });
  const adminToken = generateAuthToken({ id: admin_Id, email: 'admin@kudumba.org', role: 'ADMIN' });

  before(() => {
    clearMockDocStore();
    _resetMockMembers();
    _resetMockWorkers();
    _resetMockSharePacks();
    clearMockPaymentRequests();
  });

  after(() => {
    clearMockDocStore();
    _resetMockMembers();
    _resetMockWorkers();
    _resetMockSharePacks();
    clearMockPaymentRequests();
  });

  /* ========================================================================
     1. Unauthenticated Requests & Deny-by-Default (401 Unauthorized)
     ======================================================================== */
  describe('1. Server-Side Authentication & Deny-by-Default (401 Unauthorized)', () => {
    it('rejects unauthenticated request to requireAuth with 401', async () => {
      const req: any = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      let statusCode = 0;
      let body: any = null;
      let nextCalled = false;

      const res: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: any) {
          body = payload;
          return this;
        },
      };

      await requireAuth(req, res, () => {
        nextCalled = true;
      });

      assert.equal(statusCode, 401);
      assert.equal(nextCalled, false);
      assert.match(body.error, /Authentication required/i);
    });

    it('rejects unauthenticated request to householdAuth with 401', async () => {
      const req: any = { headers: {} };
      let statusCode = 0;
      let body: any = null;
      let nextCalled = false;

      const res: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: any) {
          body = payload;
          return this;
        },
      };

      await householdAuth(req, res, () => {
        nextCalled = true;
      });

      assert.equal(statusCode, 401);
      assert.equal(nextCalled, false);
      assert.match(body.error, /Authentication required/i);
    });

    it('rejects forged/tampered JWT tokens with 401', async () => {
      const req: any = {
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.forged.signature',
        },
      };
      let statusCode = 0;
      let body: any = null;
      let nextCalled = false;

      const res: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: any) {
          body = payload;
          return this;
        },
      };

      await requireAuth(req, res, () => {
        nextCalled = true;
      });

      assert.equal(statusCode, 401);
      assert.equal(nextCalled, false);
    });

    it('rejects unauthenticated request to admin endpoints with 401', async () => {
      const endpoints = ['/overview', '/users', '/payments'];
      for (const endpoint of endpoints) {
        const req = createMockRequest({ method: 'GET', url: endpoint });
        const res = new MockResponse();
        await executeAdminRoute(req, res);

        assert.equal(res.statusCode, 401, `Endpoint ${endpoint} must return 401 when unauthenticated`);
      }
    });
  });

  /* ========================================================================
     2. Role-Based Access Control (RBAC) - Regular Users Blocked from Admin Actions
     ======================================================================== */
  describe('2. Role-Based Access Control (RBAC) - Regular Users Blocked (403 Forbidden)', () => {
    it('rejects standard user accessing GET /overview with 403 Forbidden', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/overview',
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const res = new MockResponse();
      await executeAdminRoute(req, res);

      assert.equal(res.statusCode, 403);
      const json = res.getParsedJson();
      assert.equal(json.errorCode, 'FORBIDDEN_SUPER_ADMIN');
    });

    it('rejects standard user accessing GET /users with 403 Forbidden', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/users',
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const res = new MockResponse();
      await executeAdminRoute(req, res);

      assert.equal(res.statusCode, 403);
    });

    it('rejects standard user accessing GET /payments with 403 Forbidden', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/payments',
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const res = new MockResponse();
      await executeAdminRoute(req, res);

      assert.equal(res.statusCode, 403);
    });

    it('rejects standard user attempting POST /payments/:id/approve with 403 Forbidden', async () => {
      const fakeId = new Types.ObjectId().toString();
      const req = createMockRequest({
        method: 'POST',
        url: `/payments/${fakeId}/approve`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const res = new MockResponse();
      await executeAdminRoute(req, res);

      assert.equal(res.statusCode, 403);
    });

    it('rejects standard user attempting POST /payments/:id/reject with 403 Forbidden', async () => {
      const fakeId = new Types.ObjectId().toString();
      const req = createMockRequest({
        method: 'POST',
        url: `/payments/${fakeId}/reject`,
        headers: { authorization: `Bearer ${userAToken}` },
        body: { reason: 'Tampered rejection' },
      });
      const res = new MockResponse();
      await executeAdminRoute(req, res);

      assert.equal(res.statusCode, 403);
    });

    it('rejects standard user attempting GET /payments/:id/proof with 403 Forbidden', async () => {
      const fakeId = new Types.ObjectId().toString();
      const req = createMockRequest({
        method: 'GET',
        url: `/payments/${fakeId}/proof`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const res = new MockResponse();
      await executeAdminRoute(req, res);

      assert.equal(res.statusCode, 403);
    });

    it('rejects standard user attempting POST /subscriptions/:id/cancel with 403 Forbidden', async () => {
      const fakeId = new Types.ObjectId().toString();
      const req = createMockRequest({
        method: 'POST',
        url: `/subscriptions/${fakeId}/cancel`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const res = new MockResponse();
      await executeAdminRoute(req, res);

      assert.equal(res.statusCode, 403);
    });

    it('permits authorized Super Admin with ADMIN role to access admin endpoints (e.g. GET /payments)', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/payments',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const res = new MockResponse();
      await executeAdminRoute(req, res);

      assert.equal(res.statusCode, 200);
      const json = res.getParsedJson();
      assert.equal(json.ok, true);
    });
  });

  /* ========================================================================
     3. Document Direct Object Reference (IDOR) & Tenant Isolation
     ======================================================================== */
  describe('3. Document IDOR & Cross-Tenant Data Isolation (403 Forbidden)', () => {
    let userA_DocId: string;
    const testPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    it('User A uploads a private document', async () => {
      const doc = await uploadAndCreateDocument(
        userA_Id,
        {
          originalname: 'usera_tax_return.pdf',
          mimetype: 'application/pdf',
          buffer: testPdfBuffer,
          size: testPdfBuffer.length,
        },
        {
          title: 'User A Tax Return',
          category: 'FINANCE',
          docNumber: 'TAX-2026-A',
        }
      );
      assert.ok(doc);
      userA_DocId = doc.id || doc._id?.toString();
      assert.equal(String(doc.ownerId), userA_Id);
    });

    it('User A can read their own document', async () => {
      const doc = await getDocumentById(userA_DocId, userA_Id);
      assert.ok(doc);
      assert.equal(doc.title, 'User A Tax Return');
    });

    it('User B CANNOT read User A document (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await getDocumentById(userA_DocId, userB_Id);
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Forbidden.*permission/i);
          return true;
        }
      );
    });

    it('User B CANNOT generate download URL for User A document (returns 403 Forbidden)', async () => {
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

    it('User B CANNOT update metadata of User A document (returns 403 Forbidden)', async () => {
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

    it('User B CANNOT delete User A document (returns 403 Forbidden)', async () => {
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

    it('Non-existent document ID returns null / 404', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const doc = await getDocumentById(nonExistentId, userA_Id);
      assert.equal(doc, null);
    });

    it('User B listing documents never leaks User A documents', async () => {
      const docsUserB = await listUserDocuments(userB_Id);
      assert.equal(docsUserB.length, 0);

      const docsUserA = await listUserDocuments(userA_Id);
      assert.equal(docsUserA.length, 1);
      assert.equal(docsUserA[0].title, 'User A Tax Return');
    });
  });

  /* ========================================================================
     4. Household Member IDOR & Cross-Household Separation
     ======================================================================== */
  describe('4. Household Member IDOR & Cross-Household Separation (403 Forbidden)', () => {
    let userA_MemberId: string;

    it('User A creates a household member', async () => {
      const member = await createMember(
        userA_Id,
        {
          nameEn: 'User A Sibling',
          relationEn: 'Sibling',
          phone: '+919876543210',
        },
        { requesterId: userA_Id, requesterRole: 'USER' }
      );
      assert.ok(member);
      userA_MemberId = member._id?.toString() || member.id;
      assert.equal(String(member.ownerId), userA_Id);
    });

    it('User B CANNOT view profile of User A member (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await getMemberProfile(userB_Id, userA_MemberId, {
            requesterId: userB_Id,
            requesterRole: 'USER',
          });
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /access denied/i);
          return true;
        }
      );
    });

    it('User B CANNOT update overview of User A member (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await updateMemberOverview(
            userB_Id,
            userA_MemberId,
            { householdName: 'Tampered Household' },
            { requesterId: userB_Id, requesterRole: 'USER' }
          );
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /access denied/i);
          return true;
        }
      );
    });

    it('User B CANNOT update personal details of User A member (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await updateMemberPersonalDetails(
            userB_Id,
            userA_MemberId,
            { location: 'Kerala, India' },
            { requesterId: userB_Id, requesterRole: 'USER' }
          );
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /access denied/i);
          return true;
        }
      );
    });

    it('User B CANNOT update User A member (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await updateMember(
            userB_Id,
            userA_MemberId,
            { nameEn: 'Compromised Name' },
            { requesterId: userB_Id, requesterRole: 'USER' }
          );
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /access denied/i);
          return true;
        }
      );
    });

    it('User B CANNOT delete User A member (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await deleteMember(
            userA_Id,
            userA_MemberId,
            { requesterId: userB_Id, requesterRole: 'USER' }
          );
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedMemberActionError);
          return true;
        }
      );
    });

    it('Non-existent member ID returns 404 Not Found', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await getMemberProfile(userA_Id, nonExistentId, {
            requesterId: userA_Id,
            requesterRole: 'USER',
          });
        },
        (err: any) => {
          assert.equal(err.statusCode, 404);
          assert.match(err.message, /not found/i);
          return true;
        }
      );
    });
  });

  /* ========================================================================
     5. Service Worker Directory IDOR & Cross-Tenant Separation
     ======================================================================== */
  describe('5. Service Worker Directory IDOR & Cross-Tenant Isolation (403 Forbidden)', () => {
    let userA_WorkerId: string;

    it('User A creates a service worker record', async () => {
      const worker = await createWorker(userA_Id, {
        nameEn: 'Suresh Kumar',
        nameMl: 'സുരേഷ് കുമാർ',
        areaEn: 'Kochi',
        areaMl: 'കൊച്ചി',
        phone: '+919876500001',
        whatsapp: '+919876500001',
      });
      assert.ok(worker);
      userA_WorkerId = worker.id || worker._id?.toString();
      assert.equal(String(worker.ownerId), userA_Id);
    });

    it('User B CANNOT update User A worker (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await updateWorker(userB_Id, userA_WorkerId, { nameEn: 'Compromised Worker' });
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /access denied/i);
          return true;
        }
      );
    });

    it('User B CANNOT delete User A worker (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await deleteWorker(userB_Id, userA_WorkerId);
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /access denied/i);
          return true;
        }
      );
    });

    it('Non-existent worker ID returns 404 Not Found', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await updateWorker(userA_Id, nonExistentId, { nameEn: 'Ghost' });
        },
        (err: any) => {
          assert.equal(err.statusCode, 404);
          assert.match(err.message, /not found/i);
          return true;
        }
      );
    });
  });

  /* ========================================================================
     6. Share Pack IDOR & Cross-Tenant Separation
     ======================================================================== */
  describe('6. Share Pack IDOR & Cross-Tenant Isolation (403 Forbidden)', () => {
    let userA_PackId: string;

    it('User A creates a share pack with User A document', async () => {
      const docs = await listUserDocuments(userA_Id);
      assert.ok(docs.length > 0);
      const userA_DocId = docs[0].id || docs[0]._id?.toString();

      const pack = await createSharePack(userA_Id, {
        titleEn: 'Embassy Verification Pack',
        titleMl: 'എംബസി പാക്ക്',
        recipientEn: 'EMBASSY',
        docIds: [userA_DocId],
      });
      assert.ok(pack);
      userA_PackId = pack.id || pack._id?.toString();
      assert.equal(String(pack.ownerId), userA_Id);
    });

    it('User B CANNOT delete User A share pack (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await deleteSharePack(userB_Id, userA_PackId);
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /access denied/i);
          return true;
        }
      );
    });

    it('Non-existent share pack returns 404 Not Found', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await deleteSharePack(userA_Id, nonExistentId);
        },
        (err: any) => {
          assert.equal(err.statusCode, 404);
          assert.match(err.message, /not found/i);
          return true;
        }
      );
    });
  });

  /* ========================================================================
     7. Sub-Resource Linkage IDOR (Cross-Tenant Resource Association Attack)
     ======================================================================== */
  describe('7. Sub-Resource Linkage IDOR (Cross-Tenant Association Protection)', () => {
    let userB_MemberId: string;
    let userA_DocId: string;
    const testPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    before(async () => {
      const memberB = await createMember(
        userB_Id,
        {
          nameEn: 'User B Daughter',
          relationEn: 'Daughter',
          phone: '+919876543222',
        },
        { requesterId: userB_Id, requesterRole: 'USER' }
      );
      userB_MemberId = memberB._id?.toString() || memberB.id;

      const docA = await uploadAndCreateDocument(
        userA_Id,
        {
          originalname: 'usera_passport.pdf',
          mimetype: 'application/pdf',
          buffer: testPdfBuffer,
          size: testPdfBuffer.length,
        },
        {
          title: 'User A Passport',
          category: 'IDENTITY',
          docNumber: 'Z1234567',
        }
      );
      userA_DocId = docA.id || docA._id?.toString();
    });

    it('User A CANNOT link an uploaded document to User B memberId (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await uploadAndCreateDocument(
            userA_Id,
            {
              originalname: 'illegal_link.pdf',
              mimetype: 'application/pdf',
              buffer: testPdfBuffer,
              size: testPdfBuffer.length,
            },
            {
              title: 'Attempted Cross-Tenant Linkage',
              category: 'IDENTITY',
              memberId: userB_MemberId, // Attempting to link to User B's member
            }
          );
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Forbidden.*household/i);
          return true;
        }
      );
    });

    it('User A CANNOT update existing document to link to User B memberId (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await updateDocumentMetadata(userA_DocId, userA_Id, {
            memberId: userB_MemberId, // Attempting to cross-link
          });
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Forbidden.*household/i);
          return true;
        }
      );
    });

    it('User B CANNOT create a share pack containing User A docId (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await createSharePack(userB_Id, {
            titleEn: 'Malicious Share Pack',
            titleMl: 'പാക്ക്',
            recipientEn: 'BANK',
            docIds: [userA_DocId], // Referencing User A's private document
          });
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Forbidden.*documents/i);
          return true;
        }
      );
    });
  });

  /* ========================================================================
     8. Billing Receipt IDOR Protection
     ======================================================================== */
  describe('8. Billing Receipt IDOR Protection (403 Forbidden)', () => {
    it('User B CANNOT access User A billing receipt (returns 403 Unauthorized/Forbidden)', async () => {
      const fakePaymentId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await getBillingReceipt(userB_Id, fakePaymentId);
        },
        (err: any) => {
          assert.match(err.message, /not found|unauthorized/i);
          return true;
        }
      );
    });
  });

  /* ========================================================================
     9. Manual Payment Workflow IDOR & Cross-Tenant Mutation Prevention
     ======================================================================== */
  describe('9. Manual Payment Request IDOR & Mutation Guard (403 Forbidden)', () => {
    let userA_RequestId: string;

    it('User A creates a pending payment request', async () => {
      const reqDoc = await createPaymentRequest(userA_Id, {
        planId: 'nri-plus',
        duration: 'monthly',
        billingAddress: {
          fullName: 'User A Family Head',
          houseBuilding: 'House 1',
          streetLocality: 'Marine Drive',
          city: 'Kochi',
          state: 'Kerala',
          postalCode: '682031',
          country: 'India',
          phone: '+919876543210',
        },
      });
      assert.ok(reqDoc);
      userA_RequestId = reqDoc.id || reqDoc._id?.toString();
    });

    it('User B CANNOT submit payment proof for User A request ID (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await submitPaymentProof(userB_Id, {
            requestId: userA_RequestId,
            utrNumber: 'UTR20261031TEST1234',
            paymentDate: new Date().toISOString(),
          });
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Access denied.*belong/i);
          return true;
        }
      );
    });

    it('User B CANNOT cancel User A payment request (returns 403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await cancelPaymentRequest(userB_Id, userA_RequestId);
        },
        (err: any) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /Access denied.*belong/i);
          return true;
        }
      );
    });

    it('Non-existent payment request ID returns 404 Not Found', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      await assert.rejects(
        async () => {
          await cancelPaymentRequest(userA_Id, nonExistentId);
        },
        (err: any) => {
          assert.equal(err.statusCode, 404);
          assert.match(err.message, /not found/i);
          return true;
        }
      );
    });

    it('User A can successfully cancel their own payment request', async () => {
      const result = await cancelPaymentRequest(userA_Id, userA_RequestId);
      assert.equal(result, true);
    });
  });

  /* ========================================================================
     10. User Settings Privilege Escalation Protection
     ======================================================================== */
  describe('10. User Settings Privilege Escalation Protection (403 / Rejection)', () => {
    it('Privileged field "role" cannot be modified by user settings update', async () => {
      await assert.rejects(
        async () => {
          await updateProfileSettings(userA_Id, {
            fullName: 'User A',
            role: 'ADMIN',
          } as any);
        },
        /Modifying protected field 'role' is strictly forbidden/i
      );
    });

    it('Privileged field "status" cannot be modified by user settings update', async () => {
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

    it('Authorized user can safely update legitimate profile fields', async () => {
      const updated = await updateProfileSettings(userA_Id, {
        fullName: 'User A Updated Name',
        preferredLang: 'ml',
      });
      assert.equal(updated.fullName, 'User A Updated Name');
      assert.equal(updated.preferredLang, 'ml');
    });
  });
});
