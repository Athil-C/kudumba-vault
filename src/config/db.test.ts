import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMongoUri, connectDatabase, getDatabaseStatus } from './db';

describe('Database Connection Manager & Security', () => {
  it('sanitizes credentials from mongodb+srv URIs', () => {
    const raw = 'mongodb+srv://admin_user:SuperSecretPassword123@cluster0.abcde.mongodb.net/kudumba_vault?retryWrites=true';
    const sanitized = sanitizeMongoUri(raw);
    assert.strictEqual(sanitized.includes('SuperSecretPassword123'), false);
    assert.strictEqual(sanitized.includes('***:***@cluster0.abcde.mongodb.net'), true);
  });

  it('sanitizes credentials from standard mongodb URIs with ports', () => {
    const raw = 'mongodb://root:my_secret_pass@127.0.0.1:27017/kudumba_vault?authSource=admin';
    const sanitized = sanitizeMongoUri(raw);
    assert.strictEqual(sanitized.includes('my_secret_pass'), false);
    assert.strictEqual(sanitized.includes('***:***@127.0.0.1:27017'), true);
  });

  it('handles empty or missing URIs safely', () => {
    assert.strictEqual(sanitizeMongoUri(undefined), 'undefined');
    assert.strictEqual(sanitizeMongoUri(''), 'undefined');
  });

  it('aborts and throws immediately in production if MONGODB_URI is missing', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevUri = process.env.MONGODB_URI;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.MONGODB_URI;

      await assert.rejects(
        async () => {
          await connectDatabase();
        },
        {
          name: 'Error',
          message: /Production startup aborted: MONGODB_URI is required/,
        }
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevUri !== undefined) process.env.MONGODB_URI = prevUri;
    }
  });

  it('allows mock fallback in explicit test mode without throwing', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevUri = process.env.MONGODB_URI;
    try {
      process.env.NODE_ENV = 'test';
      delete process.env.MONGODB_URI;

      const status = await connectDatabase();
      assert.strictEqual(status.isMock, true);
      assert.strictEqual(status.connected, false);

      const currentStatus = getDatabaseStatus();
      assert.strictEqual(currentStatus.isMock, true);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevUri !== undefined) process.env.MONGODB_URI = prevUri;
    }
  });
});
