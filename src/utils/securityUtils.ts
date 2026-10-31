import crypto from 'crypto';
import mongoose from 'mongoose';

/**
 * Constant-time string comparison to prevent timing attacks on HMACs, tokens, and secrets.
 * Handles strings of different lengths safely without throwing exceptions or leaking timing information.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // Constant-time dummy comparison to prevent short-circuit timing leak
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Escapes all regular expression metacharacters in user-supplied strings.
 * Strictly prevents ReDoS (Regular Expression Denial of Service) and NoSQL regex injection.
 */
export function escapeRegex(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Safely parses and bounds query strings.
 * Rejects non-string inputs (e.g. object queries `{ $ne: '' }` from query parsers).
 */
export function sanitizeQueryString(val: unknown, maxLength = 100): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLength);
}

/**
 * Validates that an identifier matches the standard 24-character hexadecimal MongoDB ObjectId format,
 * or allowed test/mock prefixes.
 */
export function isValidObjectId(id: unknown): boolean {
  if (typeof id !== 'string' || !id) return false;
  if (mongoose.Types.ObjectId.isValid(id)) return true;
  if (
    process.env.NODE_ENV === 'test' &&
    (id.startsWith('mock-') || id.startsWith('unprov_') || id.startsWith('test-'))
  ) {
    return true;
  }
  return false;
}

/**
 * Sanitizes error messages for public client responses.
 * Strictly prevents internal database connection strings, cluster domains,
 * replica set details, Mongoose CastErrors, and stack traces from leaking to clients.
 */
export function sanitizeErrorMessage(
  err: unknown,
  defaultMessage = 'An unexpected error occurred. Please try again later.'
): { message: string; statusCode: number } {
  if (!err) return { message: defaultMessage, statusCode: 500 };

  const rawMsg = err instanceof Error ? err.message : String(err);
  const explicitStatus = (err as any)?.statusCode || (err as any)?.status;

  // 1. Mongoose / BSON CastError (e.g. "Cast to ObjectId failed for value ...")
  if (
    rawMsg.includes('Cast to ObjectId failed') ||
    rawMsg.includes('BSONError') ||
    rawMsg.includes('Argument passed in must be a single String')
  ) {
    return { message: 'Invalid identifier format.', statusCode: 400 };
  }

  // 2. Sensitive database topology & connection leak prevention
  if (
    rawMsg.includes('mongodb') ||
    rawMsg.includes('Mongo') ||
    rawMsg.includes('ECONNREFUSED') ||
    rawMsg.includes('querySrv') ||
    rawMsg.includes('topology') ||
    rawMsg.includes('replica') ||
    rawMsg.includes('Atlas') ||
    rawMsg.includes('timed out') ||
    rawMsg.includes('TLS alert')
  ) {
    return {
      message: 'Database service is currently unavailable. Please try again later.',
      statusCode: 503,
    };
  }

  // 3. Stack trace & internal file path leak prevention
  if (
    (rawMsg.includes('at ') && (rawMsg.includes('.ts:') || rawMsg.includes('.js:'))) ||
    rawMsg.includes('SyntaxError:') ||
    rawMsg.includes('ReferenceError:')
  ) {
    return { message: defaultMessage, statusCode: 500 };
  }

  // 4. Client-safe validation or known operational error
  return {
    message: rawMsg,
    statusCode: typeof explicitStatus === 'number' && explicitStatus >= 400 && explicitStatus < 600
      ? explicitStatus
      : 400,
  };
}
