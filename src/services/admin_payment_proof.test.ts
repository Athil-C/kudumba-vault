process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';
process.env.JWT_SECRET = 'test-super-secret-jwt-key-for-admin-tests-2026';

import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

import { adminRouter } from '../routes/adminRoutes';
import { clearMockPaymentRequests, getMockPaymentRequests } from '../models/PaymentRequest';
import { generateAuthToken } from './authService';
import { apiGetAdminPaymentProofBlob } from './adminApiClient';
import { setApiAccessToken, getApiAccessToken } from './apiClient';

/**
 * High-fidelity Mock Response extending stream.Writable
 * Natively supports fileStream.pipe(res), res.setHeader, res.status, res.json, res.send
 */
class MockResponse extends Writable {
  statusCode: number = 200;
  headers: Record<string, string> = {};
  bodyChunks: Buffer[] = [];
  jsonBody: any = null;
  headersSent: boolean = false;

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
}) {
  const req: any = {
    method: options.method || 'GET',
    url: options.url,
    originalUrl: `/api/admin${options.url}`,
    headers: options.headers || {},
    user: options.user,
    ip: '127.0.0.1',
    query: {},
    params: {},
  };
  return req;
}

function executeRoute(req: any, res: MockResponse): Promise<void> {
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

test('Kudumba Vault — Admin Authenticated UPI Payment Proof System', async (t) => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-super-secret-jwt-key-for-admin-tests-2026';
  const adminId = '507f1f77bcf86cd799439001';
  const userId = '507f1f77bcf86cd799439002';

  const validAdminToken = generateAuthToken({
    id: adminId,
    email: 'superadmin@kudumbavault.com',
    role: 'ADMIN',
  });

  const regularUserToken = generateAuthToken({
    id: userId,
    email: 'member@kudumbavault.com',
    role: 'USER',
  });

  // Temporary test directory and sample proof files
  const testProofDir = path.resolve(process.cwd(), 'uploads/test_proofs');
  const samplePngPath = path.join(testProofDir, 'test_proof_sample.png');
  const sampleJpgPath = path.join(testProofDir, 'test_proof_sample.jpg');
  const sampleWebpPath = path.join(testProofDir, 'test_proof_sample.webp');

  const samplePngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );

  t.before(() => {
    if (!fs.existsSync(testProofDir)) {
      fs.mkdirSync(testProofDir, { recursive: true });
    }
    fs.writeFileSync(samplePngPath, samplePngBytes);
    fs.writeFileSync(sampleJpgPath, samplePngBytes);
    fs.writeFileSync(sampleWebpPath, samplePngBytes);
  });

  t.after(() => {
    try {
      if (fs.existsSync(samplePngPath)) fs.unlinkSync(samplePngPath);
      if (fs.existsSync(sampleJpgPath)) fs.unlinkSync(sampleJpgPath);
      if (fs.existsSync(sampleWebpPath)) fs.unlinkSync(sampleWebpPath);
      if (fs.existsSync(testProofDir)) fs.rmdirSync(testProofDir);
    } catch {}
  });

  t.beforeEach(() => {
    clearMockPaymentRequests();
    setApiAccessToken(null);
  });

  // ---------------------------------------------------------------------------
  // Test 1: Super Admin can retrieve payment proof with valid JWT Bearer token
  // ---------------------------------------------------------------------------
  await t.test('1. Super Admin retrieves payment proof binary with valid JWT Bearer token', async () => {
    const reqId = 'req_test_proof_valid_01';
    getMockPaymentRequests().set(reqId, {
      _id: reqId,
      id: reqId,
      userId,
      subscriptionPlanId: 'nri-plus',
      utrNumber: 'UTR998877665544',
      payableAmount: 249,
      proofFilePath: samplePngPath,
      proofOriginalName: 'gpay_receipt_249.png',
      proofMimeType: 'image/png',
      proofFileSize: samplePngBytes.length,
      status: 'PENDING',
      createdAt: new Date(),
    });

    const req = createMockRequest({
      url: `/payments/${reqId}/proof`,
      headers: {
        authorization: `Bearer ${validAdminToken}`,
      },
    });
    const res = new MockResponse();

    await executeRoute(req, res);

    assert.equal(res.statusCode, 200, 'Super Admin must receive 200 OK');
    assert.equal(res.getHeader('content-type'), 'image/png');
    assert.equal(res.getHeader('x-content-type-options'), 'nosniff');
    assert.equal(res.getHeader('cache-control'), 'private, no-cache, no-store, must-revalidate');
    assert.ok(
      res.getHeader('content-disposition')?.includes('inline; filename="gpay_receipt_249.png"'),
      'Content-Disposition must safely include original filename'
    );

    const buffer = res.getBodyBuffer();
    assert.equal(buffer.length, samplePngBytes.length);
    assert.deepEqual(buffer, samplePngBytes);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Unauthenticated request is rejected with HTTP 401
  // ---------------------------------------------------------------------------
  await t.test('2. Unauthenticated request to /api/admin/payments/:id/proof is rejected with 401', async () => {
    const reqId = 'req_test_proof_unauth_02';
    getMockPaymentRequests().set(reqId, {
      _id: reqId,
      proofFilePath: samplePngPath,
      proofOriginalName: 'proof.png',
      status: 'PENDING',
    });

    // Request with no Authorization header (simulates browser <img src="..."> or new tab click)
    const req = createMockRequest({
      url: `/payments/${reqId}/proof`,
      headers: {},
    });
    const res = new MockResponse();

    await executeRoute(req, res);

    assert.equal(res.statusCode, 401, 'Unauthenticated request must be rejected with 401');
    const json = res.getParsedJson();
    assert.equal(json?.ok, false);
    assert.match(json?.error || '', /authentication required/i);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Non-admin authenticated user (role 'USER') is rejected with HTTP 403
  // ---------------------------------------------------------------------------
  await t.test('3. Non-admin authenticated user (role USER) is rejected with 403 Forbidden', async () => {
    const reqId = 'req_test_proof_user_03';
    getMockPaymentRequests().set(reqId, {
      _id: reqId,
      proofFilePath: samplePngPath,
      proofOriginalName: 'proof.png',
      status: 'PENDING',
    });

    const req = createMockRequest({
      url: `/payments/${reqId}/proof`,
      headers: {
        authorization: `Bearer ${regularUserToken}`,
      },
    });
    const res = new MockResponse();

    await executeRoute(req, res);

    assert.equal(res.statusCode, 403, 'Non-admin user must receive 403 Forbidden');
    const json = res.getParsedJson();
    assert.equal(json?.ok, false);
    assert.equal(json?.errorCode, 'FORBIDDEN_SUPER_ADMIN');
    assert.match(json?.error || '', /Super Administrator privileges required/i);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Missing proof file or non-existent payment ID returns HTTP 404
  // ---------------------------------------------------------------------------
  await t.test('4. Non-existent payment ID returns HTTP 404 without leaking server paths', async () => {
    const req = createMockRequest({
      url: '/payments/req_does_not_exist_404/proof',
      headers: {
        authorization: `Bearer ${validAdminToken}`,
      },
    });
    const res = new MockResponse();

    await executeRoute(req, res);

    assert.equal(res.statusCode, 404, 'Non-existent payment ID must return 404');
    const json = res.getParsedJson();
    assert.equal(json?.ok, false);
    assert.equal(json?.error, 'Payment screenshot not found.');
    // Must never leak server path
    assert.equal(json?.filePath, undefined);
  });

  await t.test('4b. Payment request with missing disk file returns 404', async () => {
    const reqId = 'req_missing_file_404';
    getMockPaymentRequests().set(reqId, {
      _id: reqId,
      proofFilePath: path.resolve(process.cwd(), 'uploads/nonexistent_file_987654.png'),
      proofOriginalName: 'nonexistent.png',
      status: 'PENDING',
    });

    const req = createMockRequest({
      url: `/payments/${reqId}/proof`,
      headers: {
        authorization: `Bearer ${validAdminToken}`,
      },
    });
    const res = new MockResponse();

    await executeRoute(req, res);

    assert.equal(res.statusCode, 404, 'Missing file on storage server must return 404');
    const json = res.getParsedJson();
    assert.equal(json?.ok, false);
    assert.match(json?.error || '', /not found/i);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Path traversal attack prevention
  // ---------------------------------------------------------------------------
  await t.test('5. Path traversal in requestId parameter is rejected with 400', async () => {
    const req = createMockRequest({
      url: '/payments/..%2F..%2Fetc%2Fpasswd/proof',
      headers: {
        authorization: `Bearer ${validAdminToken}`,
      },
    });
    const res = new MockResponse();

    await executeRoute(req, res);

    assert.equal(res.statusCode, 400, 'Path traversal in ID parameter must return 400 Bad Request');
    const json = res.getParsedJson();
    assert.equal(json?.ok, false);
    assert.match(json?.error || '', /valid payment request id is required/i);
  });

  await t.test('5b. Malicious proofFilePath outside project root is rejected with 403', async () => {
    const reqId = 'req_malicious_path_05';
    // File outside process.cwd()
    const forbiddenExternalPath = path.resolve('C:\\Windows\\System32\\drivers\\etc\\hosts');
    getMockPaymentRequests().set(reqId, {
      _id: reqId,
      proofFilePath: forbiddenExternalPath,
      proofOriginalName: 'hosts',
      status: 'PENDING',
    });

    const req = createMockRequest({
      url: `/payments/${reqId}/proof`,
      headers: {
        authorization: `Bearer ${validAdminToken}`,
      },
    });
    const res = new MockResponse();

    await executeRoute(req, res);

    assert.equal(res.statusCode, 403, 'Path traversal outside root must return 403 Forbidden');
    const json = res.getParsedJson();
    assert.equal(json?.ok, false);
    assert.match(json?.error || '', /access denied/i);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Safe MIME types and CRLF sanitization in Content-Disposition
  // ---------------------------------------------------------------------------
  await t.test('6. Enforces correct MIME types (.jpg, .webp) and sanitizes header injection', async () => {
    const reqJpg = 'req_mime_jpg';
    getMockPaymentRequests().set(reqJpg, {
      _id: reqJpg,
      proofFilePath: sampleJpgPath,
      proofOriginalName: 'receipt\r\nInjected-Header: evil\r\nfilename.jpg',
      proofMimeType: 'image/jpeg',
      status: 'PENDING',
    });

    const req = createMockRequest({
      url: `/payments/${reqJpg}/proof`,
      headers: {
        authorization: `Bearer ${validAdminToken}`,
      },
    });
    const res = new MockResponse();

    await executeRoute(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader('content-type'), 'image/jpeg');
    const disp = res.getHeader('content-disposition');
    assert.ok(disp && !disp.includes('\r') && !disp.includes('\n'), 'Must strip CRLF from headers');
    assert.ok(disp?.includes('.jpg'));
  });

  // ---------------------------------------------------------------------------
  // Test 7: Frontend apiGetAdminPaymentProofBlob and Object URL lifecycle
  // ---------------------------------------------------------------------------
  await t.test('7. apiGetAdminPaymentProofBlob sends Bearer token and does not leak credentials in URL', async () => {
    const reqId = 'req_client_blob_07';
    getMockPaymentRequests().set(reqId, {
      _id: reqId,
      proofFilePath: samplePngPath,
      proofOriginalName: 'screen.png',
      proofMimeType: 'image/png',
      status: 'PENDING',
    });

    // Set token in apiClient state
    setApiAccessToken(validAdminToken);

    // Mock fetch to verify exact headers and URL structure
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: any, init?: any) => {
        capturedUrl = typeof input === 'string' ? input : input.url;
        if (init?.headers) {
          const h = new Headers(init.headers);
          h.forEach((val, key) => {
            capturedHeaders[key.toLowerCase()] = val;
          });
        }
        // Return a mock response with a valid blob
        return new Response(samplePngBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }) as typeof fetch;

      const blob = await apiGetAdminPaymentProofBlob(reqId);

      assert.ok(blob instanceof Blob, 'Client must retrieve a Blob');
      assert.equal(blob.type, 'image/png');
      assert.equal(blob.size, samplePngBytes.length);

      // Verify no token query param in URL
      assert.ok(!capturedUrl.includes('token='), 'URL must never contain credentials');
      assert.ok(!capturedUrl.includes('Bearer'), 'Bearer token must not appear in URL');
      assert.equal(capturedHeaders['authorization'], `Bearer ${validAdminToken}`);
    } finally {
      globalThis.fetch = originalFetch;
      setApiAccessToken(null);
    }
  });

  await t.test('7b. Object URL creation and revocation lifecycle operates safely', () => {
    const fakeBlob = new Blob([samplePngBytes], { type: 'image/png' });

    if (typeof URL.createObjectURL === 'function') {
      const createdUrl = URL.createObjectURL(fakeBlob);
      assert.ok(typeof createdUrl === 'string' && createdUrl.startsWith('blob:'));
      assert.doesNotThrow(() => {
        URL.revokeObjectURL(createdUrl);
      }, 'Revoking object URL must succeed cleanly without throwing');
    } else {
      assert.equal(fakeBlob.size, samplePngBytes.length);
    }
  });
});
