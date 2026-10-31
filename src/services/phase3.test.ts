import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();
process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';
process.env.ALLOW_MOCK_STORAGE = 'true';

import {
  verifyFileSignature,
  validateDocumentFile,
  generatePrivateStoragePath,
  createDocumentSignedUrl,
  deleteDocumentFromStorage,
} from './supabaseStorage';
import {
  generateAuthToken,
  verifyAuthToken,
  registerUser,
  loginUser,
  getUserById,
  clearMockUserStore,
} from './authService';
import {
  requireAuth,
  parseCookieHeader,
  assertDocumentOwnership,
} from '../middleware/auth';

describe('Phase 3: Secure Supabase Storage & Authentication Services', () => {
  describe('File Signature & Magic-Byte Verification', () => {
    it('authenticates valid PDF magic bytes (%PDF-)', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
      const res = verifyFileSignature(pdfBuffer);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.detectedMime, 'application/pdf');
    });

    it('authenticates valid PNG magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      const res = verifyFileSignature(pngBuffer);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.detectedMime, 'image/png');
    });

    it('authenticates valid JPEG magic bytes', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const res = verifyFileSignature(jpegBuffer);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.detectedMime, 'image/jpeg');
    });

    it('authenticates valid WebP magic bytes (RIFF....WEBP)', () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x20, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      const res = verifyFileSignature(webpBuffer);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.detectedMime, 'image/webp');
    });

    it('strictly catches and rejects spoofed files (e.g. executable disguised as PDF)', () => {
      // Windows PE executable header: MZ (0x4D 0x5A)
      const disguisedExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
      const res = verifyFileSignature(disguisedExe);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes('Disallowed or forged file signature'));

      const fileCheck = validateDocumentFile({
        originalname: 'innocent_passport.pdf',
        mimetype: 'application/pdf',
        buffer: disguisedExe,
      });
      assert.strictEqual(fileCheck.valid, false);
      assert.ok(fileCheck.error?.includes('magic-bytes do not match') || fileCheck.error?.includes('Disallowed'));
    });

    it('detects MIME type mismatches (declared JPEG but binary PNG)', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const fileCheck = validateDocumentFile({
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: pngBuffer,
      });
      assert.strictEqual(fileCheck.valid, false);
      assert.ok(fileCheck.error?.includes('MIME type spoofing detected'));
    });

    it('sanitizes dangerous characters and directory traversal in original file names', () => {
      const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const fileCheck = validateDocumentFile({
        originalname: '../../../../etc/shadow.pdf',
        mimetype: 'application/pdf',
        buffer: validPdf,
      });
      assert.strictEqual(fileCheck.valid, true);
      assert.strictEqual(fileCheck.sanitizedFileName.includes('..'), false);
      assert.strictEqual(fileCheck.sanitizedFileName.includes('/'), false);
    });
  });

  describe('Storage Keys & Private Signed URLs', () => {
    it('generates unpredictable server-side storage paths under users/ namespace', () => {
      const userId = 'usr-kudumba-101';
      const key1 = generatePrivateStoragePath(userId, 'driving_license.pdf');
      const key2 = generatePrivateStoragePath(userId, 'driving_license.pdf');

      assert.ok(key1.startsWith(`users/${userId}/`), 'Must be scoped under user folder');
      assert.ok(!key1.includes('http://') && !key1.includes('https://'), 'Must be relative storage key');
      assert.notStrictEqual(key1, key2, 'Keys must have distinct random UUIDs');
    });

    it('generates short-lived signed URLs with expiration timestamp', async () => {
      const storagePath = 'users/usr-101/uuid-sample.pdf';
      const result = await createDocumentSignedUrl(storagePath, 900); // 15 min

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.expiresIn, 900);
      assert.ok(result.signedUrl, 'Signed URL must be generated');
      assert.ok(result.signedUrl.includes(storagePath), 'Signed URL must reference storage path');
    });

    it('handles cleanup deletion of storage objects safely', async () => {
      const result = await deleteDocumentFromStorage('users/usr-101/orphaned-doc.pdf');
      assert.strictEqual(result.success, true);
    });
  });

  describe('JWT Token Lifecycle & Tamper Resistance', () => {
    const payload = {
      id: 'usr-456',
      email: 'sreedevi@kudumba.in',
      role: 'USER',
    };

    it('generates and decodes authentic JWT tokens', () => {
      const token = generateAuthToken(payload);
      const decoded = verifyAuthToken(token);

      assert.strictEqual(decoded.id, payload.id);
      assert.strictEqual(decoded.email, payload.email);
      assert.strictEqual(decoded.role, payload.role);
    });

    it('rejects tampered or forged JWT tokens', () => {
      const token = generateAuthToken(payload);
      // Tamper signature by altering the last characters
      const tampered = token.slice(0, -6) + 'abcdef';

      assert.throws(
        () => {
          verifyAuthToken(tampered);
        },
        {
          name: 'Error',
          message: /Invalid or malformed authentication token/,
        }
      );
    });

    it('rejects expired JWT tokens cleanly', async () => {
      // Issue a token with 0 second expiry
      const expiredToken = generateAuthToken(payload, '0s');

      // Wait 50ms to ensure expiration
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.throws(
        () => {
          verifyAuthToken(expiredToken);
        },
        {
          name: 'Error',
          message: /Authentication token has expired/,
        }
      );
    });
  });

  describe('User Registration & Account Enumeration Prevention', () => {
    const testEmail = `household_${Date.now()}@kudumba.in`;

    it('registers a user securely and excludes passwordHash from output', async () => {
      clearMockUserStore();
      const res = await registerUser({
        name: 'Sreedevi Menon',
        email: testEmail,
        password: 'ValidSecretPassword123!',
        preferredLang: 'ml',
      });

      assert.strictEqual(res.user.name, 'Sreedevi Menon');
      assert.strictEqual(res.user.email, testEmail.toLowerCase());
      assert.strictEqual((res.user as any).passwordHash, undefined, 'passwordHash must never be exposed');
      assert.ok(res.token, 'Must return JWT token');

      // Verify token contains correct user ID
      const decoded = verifyAuthToken(res.token);
      assert.strictEqual(decoded.id, res.user.id);
    });

    it('rejects duplicate email registrations safely', async () => {
      await assert.rejects(
        async () => {
          await registerUser({
            name: 'Duplicate Sreedevi',
            email: testEmail,
            password: 'AnotherPassword123!',
          });
        },
        {
          name: 'Error',
          message: /An account with this email address already exists/,
        }
      );
    });

    it('authenticates valid credentials and issues JWT token', async () => {
      const loginRes = await loginUser({
        email: testEmail,
        password: 'ValidSecretPassword123!',
      });

      assert.strictEqual(loginRes.user.email, testEmail.toLowerCase());
      assert.ok(loginRes.token, 'Must issue JWT token on login');
    });

    it('strictly prevents account enumeration with generic error messages', async () => {
      // 1. Non-existent email
      await assert.rejects(
        async () => {
          await loginUser({
            email: 'nonexistent_user_xyz@kudumba.in',
            password: 'SomePassword123!',
          });
        },
        {
          name: 'Error',
          message: 'Invalid email or password.',
        }
      );

      // 2. Existing email with incorrect password
      await assert.rejects(
        async () => {
          await loginUser({
            email: testEmail,
            password: 'WrongPasswordTotally!',
          });
        },
        {
          name: 'Error',
          message: 'Invalid email or password.',
        }
      );
    });

    it('retrieves sanitized user profile by user ID', async () => {
      const loginRes = await loginUser({
        email: testEmail,
        password: 'ValidSecretPassword123!',
      });

      const user = await getUserById(loginRes.user.id);
      assert.ok(user, 'User should be found');
      assert.strictEqual(user.id, loginRes.user.id);
      assert.strictEqual((user as any).passwordHash, undefined);
    });
  });

  describe('Authorization & Insecure Direct Object Reference (IDOR) Protection', () => {
    it('authorizes document owner to read and delete document', () => {
      const ownerId = 'usr-owner-123';
      const isAllowed = assertDocumentOwnership(ownerId, ownerId, 'USER');
      assert.strictEqual(isAllowed, true);
    });

    it('strictly forbids a foreign user from accessing another user document (IDOR Prevention)', () => {
      const ownerId = 'usr-victim-123';
      const hackerUserId = 'usr-attacker-999';

      const isAllowed = assertDocumentOwnership(ownerId, hackerUserId, 'USER');
      assert.strictEqual(isAllowed, false, 'User B must never access User A document');
    });

    it('allows system admin override when role is ADMIN', () => {
      const ownerId = 'usr-victim-123';
      const adminUserId = 'usr-admin-001';

      const isAllowed = assertDocumentOwnership(ownerId, adminUserId, 'ADMIN');
      assert.strictEqual(isAllowed, true);
    });
  });

  describe('Cookie Parsing & requireAuth Middleware', () => {
    it('parses raw cookie headers correctly', () => {
      const header = 'theme=dark; kv_token=sample.jwt.token; lang=ml';
      const cookies = parseCookieHeader(header);

      assert.strictEqual(cookies.theme, 'dark');
      assert.strictEqual(cookies.kv_token, 'sample.jwt.token');
      assert.strictEqual(cookies.lang, 'ml');
    });

    it('requireAuth extracts token from Authorization Bearer header', (t, done) => {
      const token = generateAuthToken({ id: 'usr-1', email: 'u1@kudumba.in', role: 'USER' });
      const req: any = {
        headers: { authorization: `Bearer ${token}` },
      };
      const res: any = {};
      const next = () => {
        assert.strictEqual(req.user?.id, 'usr-1');
        assert.strictEqual(req.user?.email, 'u1@kudumba.in');
        done();
      };

      requireAuth(req, res, next);
    });

    it('requireAuth extracts token from HttpOnly cookie kv_token', (t, done) => {
      const token = generateAuthToken({ id: 'usr-2', email: 'u2@kudumba.in', role: 'USER' });
      const req: any = {
        headers: { cookie: `kv_token=${token}` },
      };
      const res: any = {};
      const next = () => {
        assert.strictEqual(req.user?.id, 'usr-2');
        assert.strictEqual(req.user?.email, 'u2@kudumba.in');
        done();
      };

      requireAuth(req, res, next);
    });

    it('requireAuth rejects unauthenticated requests with 401', () => {
      const req: any = { headers: {} };
      let statusCode = 0;
      let jsonBody: any = null;
      const res: any = {
        status(c: number) {
          statusCode = c;
          return this;
        },
        json(b: any) {
          jsonBody = b;
        },
      };
      const next = () => {
        assert.fail('Should not call next for unauthenticated request');
      };

      requireAuth(req, res, next);
      assert.strictEqual(statusCode, 401);
      assert.ok(jsonBody?.error?.includes('Authentication required'));
    });
  });
});
