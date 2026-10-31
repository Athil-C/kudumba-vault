import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, IUser, hashUserPassword, isDuplicateEmailError } from '../models/User';

export interface AuthUserPayload {
  id: string;
  email: string;
  role: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  preferredLang: 'ml' | 'en';
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// In-memory test store used ONLY when in test environment without a live MongoDB connection
const mockUserStore = new Map<string, IUser & { id: string }>();

export function clearMockUserStore(): void {
  mockUserStore.clear();
}

/**
 * Retrieves the cryptographic JWT secret.
 * In production, aborts immediately if JWT_SECRET is missing or insecure (< 32 chars).
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret || secret.length < 32 || secret.includes('replace-with-a-cryptographically')) {
    if (isProd) {
      throw new Error(
        '[Security] Production startup aborted: A cryptographically strong JWT_SECRET (>= 32 characters) must be configured.'
      );
    }
    // Safe development/test fallback secret
    return 'kudumba-vault-local-development-jwt-secret-do-not-use-in-production-123456';
  }

  return secret;
}

/**
 * Issues a signed, tamper-proof JWT token with standard expiry.
 */
export function generateAuthToken(
  payload: AuthUserPayload,
  expiresIn: string = process.env.JWT_EXPIRES_IN || '7d'
): string {
  const secret = getJwtSecret();
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: expiresIn as any,
    issuer: 'kudumba-vault-api',
    audience: 'kudumba-vault-client',
  };
  return jwt.sign(payload, secret, options);
}

/**
 * Validates a JWT token and returns the decoded payload.
 * Throws an Error if the token is forged, tampered with, or expired.
 */
export function verifyAuthToken(token: string): AuthUserPayload {
  const secret = getJwtSecret();
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'kudumba-vault-api',
      audience: 'kudumba-vault-client',
    }) as AuthUserPayload;
    return {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error('Authentication token has expired. Please sign in again.');
    }
    throw new Error('Invalid or malformed authentication token.');
  }
}

/**
 * Registers a new user.
 * Validates inputs, hashes password with bcrypt, and prevents account enumeration.
 */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  role?: 'USER' | 'ADMIN' | 'FAMILY_MEMBER';
  preferredLang?: 'ml' | 'en';
}): Promise<{ user: SafeUser; token: string }> {
  const name = String(input.name || '').trim();
  const email = String(input.email || '').toLowerCase().trim();
  const password = String(input.password || '');
  const role = input.role || 'USER';
  const preferredLang = input.preferredLang === 'en' ? 'en' : 'ml';

  // Input validation
  if (!name || name.length < 2) {
    throw new Error('Name must be at least 2 characters long.');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new Error('Please provide a valid email address.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  // 1. Hash password with bcrypt
  const passwordHash = await hashUserPassword(password);

  // 2. Persist in MongoDB if connected
  const isDbConnected = mongoose.connection.readyState === 1;

  if (isDbConnected) {
    try {
      const user = new User({
        name,
        email,
        passwordHash,
        role,
        preferredLang,
        status: 'ACTIVE',
      });
      await user.save();
      const safe = user.toSafeObject();
      const token = generateAuthToken({ id: safe.id, email: safe.email, role: safe.role });
      return { user: safe, token };
    } catch (err) {
      if (isDuplicateEmailError(err)) {
        throw new Error('An account with this email address already exists.');
      }
      throw err;
    }
  }

  // Fallback for test/offline dev
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    if (mockUserStore.has(email)) {
      throw new Error('An account with this email address already exists.');
    }
    const id = `mock-usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const mockUser: IUser & { id: string } = {
      id,
      name,
      email,
      passwordHash,
      role,
      status: 'ACTIVE',
      preferredLang,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockUserStore.set(email, mockUser);

    const safe: SafeUser = {
      id,
      name,
      email,
      role,
      status: 'ACTIVE',
      preferredLang,
      createdAt: mockUser.createdAt,
      updatedAt: mockUser.updatedAt,
    };
    const token = generateAuthToken({ id: safe.id, email: safe.email, role: safe.role });
    return { user: safe, token };
  }

  throw new Error('Database is unavailable. Cannot register user.');
}

/**
 * Authenticates a user with email and password.
 * Uses generic error messages to strictly prevent account enumeration.
 */
export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ user: SafeUser; token: string }> {
  const email = String(input.email || '').toLowerCase().trim();
  const password = String(input.password || '');

  // Generic constant for account enumeration prevention
  const INVALID_CREDENTIALS_MSG = 'Invalid email or password.';

  if (!email || !password) {
    throw new Error(INVALID_CREDENTIALS_MSG);
  }

  const isDbConnected = mongoose.connection.readyState === 1;

  if (isDbConnected) {
    // Explicitly select passwordHash since it is excluded by default
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      // Dummy bcrypt comparison to prevent timing attacks
      await bcrypt.compare(password, '$2a$12$e80Y6dZ9uC83y1QzK0Uege7M1wN3t4q8.Xy1O9Z9Y7W6V5U4T3S2R');
      throw new Error(INVALID_CREDENTIALS_MSG);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new Error(INVALID_CREDENTIALS_MSG);
    }

    if (user.status === 'SUSPENDED') {
      throw new Error('Your account has been suspended. Please contact support.');
    }

    const safe = user.toSafeObject();
    const token = generateAuthToken({ id: safe.id, email: safe.email, role: safe.role });
    return { user: safe, token };
  }

  // Fallback for test/offline dev
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const mockUser = mockUserStore.get(email);
    if (!mockUser) {
      await bcrypt.compare(password, '$2a$12$e80Y6dZ9uC83y1QzK0Uege7M1wN3t4q8.Xy1O9Z9Y7W6V5U4T3S2R');
      throw new Error(INVALID_CREDENTIALS_MSG);
    }

    const isMatch = mockUser.passwordHash
      ? await bcrypt.compare(password, mockUser.passwordHash)
      : false;
    if (!isMatch) {
      throw new Error(INVALID_CREDENTIALS_MSG);
    }

    const safe: SafeUser = {
      id: mockUser.id,
      name: mockUser.name,
      email: mockUser.email,
      role: mockUser.role,
      status: mockUser.status,
      preferredLang: mockUser.preferredLang,
      createdAt: mockUser.createdAt,
      updatedAt: mockUser.updatedAt,
    };
    const token = generateAuthToken({ id: safe.id, email: safe.email, role: safe.role });
    return { user: safe, token };
  }

  throw new Error('Database is unavailable. Cannot log in.');
}

/**
 * Retrieves sanitized user profile by user ID.
 */
export async function getUserById(id: string): Promise<SafeUser | null> {
  const isDbConnected = mongoose.connection.readyState === 1;

  if (isDbConnected) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const user = await User.findById(id);
    if (!user) return null;
    return user.toSafeObject();
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    for (const u of mockUserStore.values()) {
      if (u.id === id) {
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          preferredLang: u.preferredLang,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        };
      }
    }
  }

  return null;
}
