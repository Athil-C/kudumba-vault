import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import { User } from '../models/User';
import { requireAuth, assertDocumentOwnership } from '../middleware/auth';

describe('Auth Identity Mapping & Mock DB Cast Error Fix', () => {
  const testSupabaseUid = 'c67f03a1-8816-4f67-bf11-cbfd6383c8d7';
  const testEmail = 'tester@kudumbavault.test';

  it('1. findOrCreateBySupabaseUser returns a valid MongoDB ObjectId and never a mock string', async () => {
    const user = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSupabaseUid,
      email: testEmail,
      fullName: 'Athil',
      isEmailVerified: true,
    });

    const idStr = user._id.toString();

    // Verify it is NOT the faulty string
    assert.notStrictEqual(idStr, `mock-mongo-id-${testSupabaseUid}`);
    assert.strictEqual(idStr.startsWith('mock-mongo-id-'), false);

    // Verify it is a valid 24-character hex MongoDB ObjectId
    assert.strictEqual(
      mongoose.Types.ObjectId.isValid(idStr),
      true,
      'user._id must be a valid 24-character hexadecimal ObjectId'
    );
    assert.strictEqual(idStr.length, 24);

    // Verify Supabase UUID is preserved separately
    assert.strictEqual(user.supabaseUserId, testSupabaseUid);
  });

  it('2. findOrCreateBySupabaseUser is idempotent and preserves the same ObjectId', async () => {
    const firstCall = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSupabaseUid,
      email: testEmail,
      fullName: 'Athil',
      isEmailVerified: true,
    });

    const secondCall = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSupabaseUid,
      email: testEmail,
      fullName: 'Athil Updated',
      isEmailVerified: true,
    });

    assert.strictEqual(
      firstCall._id.toString(),
      secondCall._id.toString(),
      'Repeated synchronization calls must return identical ObjectId'
    );
  });

  it('3. requireAuth populates req.user.id with a valid ObjectId, not a mock string', async () => {
    let nextCalled = false;
    let statusCode = 0;
    let responseBody: any = null;

    const req: any = {
      headers: {
        authorization: `Bearer mock-token:${testSupabaseUid}:${testEmail}:verified`,
      },
      path: '/api/auth/me',
      method: 'GET',
    };

    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
    };

    const next = () => {
      nextCalled = true;
    };

    await requireAuth(req, res, next);

    assert.strictEqual(nextCalled, true, 'requireAuth must succeed for verified user');
    assert.ok(req.user);
    assert.strictEqual(req.user.supabaseUserId, testSupabaseUid);
    assert.strictEqual(
      mongoose.Types.ObjectId.isValid(req.user.id),
      true,
      'req.user.id must be a valid ObjectId'
    );
    assert.strictEqual(req.user.id.includes('mock-mongo-id'), false);
  });

  it('4. assertDocumentOwnership correctly validates access using the resolved ObjectId', async () => {
    const user = await User.findOrCreateBySupabaseUser({
      supabaseUserId: testSupabaseUid,
      email: testEmail,
      fullName: 'Athil',
      isEmailVerified: true,
    });

    const ownerObjectId = user._id;
    const currentUserId = user._id.toString();

    // Owner access should be allowed
    assert.strictEqual(
      assertDocumentOwnership(ownerObjectId, currentUserId, 'USER'),
      true
    );

    // Another user should be denied
    const otherUserId = new mongoose.Types.ObjectId().toString();
    assert.strictEqual(
      assertDocumentOwnership(ownerObjectId, otherUserId, 'USER'),
      false
    );

    // Supabase UUID should NOT match document ownerId directly (separate identifiers)
    assert.strictEqual(
      assertDocumentOwnership(ownerObjectId, testSupabaseUid, 'USER'),
      false,
      'Supabase UUID should never be confused with document ownerId'
    );
  });

  it('5. Disconnected state throws clear error when mock mode is disabled', async () => {
    const prevAllowMock = process.env.ALLOW_MOCK_DB;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevLifecycle = process.env.npm_lifecycle_event;

    try {
      process.env.ALLOW_MOCK_DB = 'false';
      process.env.NODE_ENV = 'development';
      delete process.env.npm_lifecycle_event;

      // Mock readyState !== 1 is current state in this test runner
      await assert.rejects(
        async () => {
          await User.findOrCreateBySupabaseUser({
            supabaseUserId: 'unconnected-sb-id',
            email: 'unconnected@example.com',
          });
        },
        {
          name: 'Error',
          message: /Database is currently unavailable/i,
        }
      );
    } finally {
      process.env.ALLOW_MOCK_DB = prevAllowMock;
      process.env.NODE_ENV = prevNodeEnv;
      if (prevLifecycle !== undefined) process.env.npm_lifecycle_event = prevLifecycle;
    }
  });
});
