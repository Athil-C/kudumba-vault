import mongoose, { Model, Schema, HydratedDocument } from 'mongoose';
import bcrypt from 'bcryptjs';
import { validateDateOfBirth } from '../utils/dobValidation';
import { evaluateInactivity, isGenuineReauth } from '../utils/inactivity';

export type UserRole = 'USER' | 'ADMIN' | 'FAMILY_MEMBER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';

export interface IUser {
  name: string;
  fullName?: string;
  familyName?: string;
  email: string;
  supabaseUserId?: string;
  dateOfBirth?: string;
  passwordHash?: string;
  role: UserRole;
  status: UserStatus;
  preferredLang: 'ml' | 'en';
  phone?: string;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
  toSafeObject(): Omit<IUser, 'passwordHash'> & { id: string };
}

export interface IUserModelStatics extends Model<IUser, {}, IUserMethods> {
  findOrCreateBySupabaseUser(params: {
    supabaseUserId: string;
    email: string;
    fullName?: string;
    familyName?: string;
    dateOfBirth?: string;
    preferredLang?: 'ml' | 'en';
    isEmailVerified?: boolean;
    touchActivity?: boolean;
    lastSignInAt?: string | Date;
  }): Promise<HydratedDocument<IUser, IUserMethods>>;
  recordActivity(userId: string): Promise<void>;
}

export type UserModelType = IUserModelStatics;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UserSchema = new Schema<IUser, UserModelType, IUserMethods>(
  {
    name: {
      type: String,
      required: [true, 'User name is required.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters.'],
      maxlength: [100, 'Name cannot exceed 100 characters.'],
    },
    fullName: {
      type: String,
      trim: true,
      maxlength: [120, 'Full name cannot exceed 120 characters.'],
    },
    familyName: {
      type: String,
      trim: true,
      maxlength: [120, 'Family name cannot exceed 120 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email address is required.'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [emailRegex, 'Please provide a valid email address.'],
      index: true,
    },
    supabaseUserId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // Sparse allows legacy accounts without supabaseUserId to coexist safely
      index: true,
    },
    dateOfBirth: {
      type: String,
      trim: true,
      validate: {
        validator: function (v: string | undefined) {
          if (!v) return true; // Optional for legacy accounts
          return validateDateOfBirth(v).valid;
        },
        message: 'Invalid date of birth. Must be a valid non-future date formatted as YYYY-MM-DD.',
      },
    },
    passwordHash: {
      type: String,
      required: [
        function (this: any) {
          // Password hash is required for legacy accounts that lack a Supabase identity
          return !this.supabaseUserId;
        },
        'Password hash is required.',
      ],
      select: false, // Excluded from default queries to prevent accidental leakage
    },
    role: {
      type: String,
      enum: {
        values: ['USER', 'ADMIN', 'FAMILY_MEMBER'],
        message: 'Invalid role: {VALUE}',
      },
      default: 'USER',
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'SUSPENDED', 'PENDING'],
        message: 'Invalid status: {VALUE}',
      },
      default: 'ACTIVE',
    },
    preferredLang: {
      type: String,
      enum: ['ml', 'en'],
      default: 'ml',
    },
    phone: {
      type: String,
      trim: true,
      default: undefined,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const copy = { ...ret } as unknown as Record<string, unknown>;
        delete copy.passwordHash;
        delete copy.__v;
        // Never expose dateOfBirth unnecessarily in general API responses
        delete copy.dateOfBirth;
        copy.id = ret._id?.toString();
        return copy;
      },
    },
    toObject: {
      transform(_doc, ret) {
        const copy = { ...ret } as unknown as Record<string, unknown>;
        delete copy.passwordHash;
        delete copy.__v;
        delete copy.dateOfBirth;
        copy.id = ret._id?.toString();
        return copy;
      },
    },
  }
);

// Method: Verify password with bcrypt (retained for legacy compatibility)
UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.passwordHash) {
    return false;
  }
  return bcrypt.compare(candidate, this.passwordHash);
};

// Method: Explicit safe object without password hash or sensitive fields
UserSchema.methods.toSafeObject = function (): Omit<IUser, 'passwordHash'> & { id: string } {
  const obj = this.toObject() as unknown as Record<string, unknown>;
  delete obj.passwordHash;
  delete obj.__v;
  delete obj.dateOfBirth;
  obj.id = this._id.toString();
  return obj as unknown as Omit<IUser, 'passwordHash'> & { id: string };
};

const mockSbUserStore = new Map<string, any>();

export function clearMockSbUserStore(): void {
  mockSbUserStore.clear();
}

export function getMockUserBySupabaseId(supabaseUserId: string): any {
  return mockSbUserStore.get(supabaseUserId);
}

export function findMockUserById(userId: string): any {
  for (const user of mockSbUserStore.values()) {
    if (user.id === userId || user._id?.toString() === userId) {
      return user;
    }
  }
  return null;
}

export function updateMockUserById(userId: string, updates: Record<string, any>): any {
  for (const [sbUid, user] of mockSbUserStore.entries()) {
    if (user.id === userId || user._id?.toString() === userId) {
      Object.assign(user, updates);
      return user;
    }
  }
  return null;
}

export function isMockDbAllowed(): boolean {
  const isTest =
    process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    process.execArgv.includes('--test');
  return (
    process.env.NODE_ENV !== 'production' &&
    (isTest || process.env.ALLOW_MOCK_DB === 'true')
  );
}

/**
 * Idempotently finds or creates a MongoDB profile tied to a Supabase User ID.
 * Safely migrates existing legacy email records if a profile already existed.
 */
UserSchema.statics.findOrCreateBySupabaseUser = async function (params: {
  supabaseUserId: string;
  email: string;
  fullName?: string;
  familyName?: string;
  dateOfBirth?: string;
  preferredLang?: 'ml' | 'en';
  isEmailVerified?: boolean;
  touchActivity?: boolean;
  lastSignInAt?: string | Date;
}) {
  const {
    supabaseUserId,
    email,
    fullName,
    familyName,
    dateOfBirth,
    preferredLang,
    isEmailVerified,
    touchActivity,
    lastSignInAt,
  } = params;
  const normalizedEmail = email.trim().toLowerCase();

  // Hermetic test-runner fallback when Mongoose has no active database connection
  if (mongoose.connection.readyState !== 1) {
    if (!isMockDbAllowed()) {
      console.error('[User] Database connection is unavailable and mock fallback is disabled.');
      throw new Error('Database is currently unavailable. Please ensure MongoDB is connected.');
    }

    let existing = mockSbUserStore.get(supabaseUserId);
    if (existing) {
      if (fullName && !existing.fullName) {
        existing.fullName = fullName;
        existing.name = fullName;
      }
      if (familyName && !existing.familyName) existing.familyName = familyName;
      if (dateOfBirth && !existing.dateOfBirth) existing.dateOfBirth = dateOfBirth;
      if (touchActivity) {
        if (existing.lastActivityAt) {
          const inact = evaluateInactivity(existing.lastActivityAt);
          if (!inact.expired || isGenuineReauth(existing.lastActivityAt, lastSignInAt)) {
            existing.lastActivityAt = new Date();
          }
        } else {
          existing.lastActivityAt = new Date();
        }
      }
      return existing;
    }
    for (const [existingUid, existingUser] of mockSbUserStore.entries()) {
      if (existingUser.email === normalizedEmail && existingUid !== supabaseUserId) {
        throw new Error('Account email is already linked to another identity reference.');
      }
    }
    let normalizedDob: string | undefined = undefined;
    if (dateOfBirth) {
      const dobVal = validateDateOfBirth(dateOfBirth);
      if (dobVal.valid && dobVal.normalized) {
        normalizedDob = dobVal.normalized;
      }
    }
    const mockObjectId = new mongoose.Types.ObjectId();
    const mockObj = {
      _id: mockObjectId,
      id: mockObjectId.toString(),
      supabaseUserId,
      email: normalizedEmail,
      fullName: fullName || normalizedEmail.split('@')[0],
      name: fullName || normalizedEmail.split('@')[0],
      familyName: familyName || undefined,
      dateOfBirth: normalizedDob,
      role: 'USER',
      status: 'ACTIVE',
      preferredLang: preferredLang || 'ml',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockSbUserStore.set(supabaseUserId, mockObj);
    return mockObj;
  }

  // 1. Try to find by supabaseUserId first
  let user = await this.findOne({ supabaseUserId });
  if (user) {
    let updated = false;
    if (fullName && !user.fullName) {
      user.fullName = fullName;
      user.name = fullName;
      updated = true;
    }
    if (familyName && !user.familyName) {
      user.familyName = familyName;
      updated = true;
    }
    if (dateOfBirth && !user.dateOfBirth) {
      const dobVal = validateDateOfBirth(dateOfBirth);
      if (dobVal.valid && dobVal.normalized) {
        user.dateOfBirth = dobVal.normalized;
        updated = true;
      }
    }
    if (touchActivity) {
      if (user.lastActivityAt) {
        const inact = evaluateInactivity(user.lastActivityAt);
        if (!inact.expired || isGenuineReauth(user.lastActivityAt, lastSignInAt)) {
          user.lastActivityAt = new Date();
          updated = true;
        }
      } else {
        user.lastActivityAt = new Date();
        updated = true;
      }
    } else if (!user.lastActivityAt) {
      user.lastActivityAt = user.updatedAt || user.createdAt || new Date();
      updated = true;
    }
    if (updated) {
      await user.save();
    }
    return user;
  }

  // 2. Safe migration: Check if a user with this email already exists without a supabaseUserId
  user = await this.findOne({ email: normalizedEmail });
  if (user) {
    // If the record was already linked to a DIFFERENT supabaseUserId, reject hijacking
    if (user.supabaseUserId && user.supabaseUserId !== supabaseUserId) {
      throw new Error('Account email is already linked to another identity reference.');
    }
    // Prevent unverified accounts from claiming an existing profile
    if (!isEmailVerified) {
      throw new Error('Email verification required before linking existing account profile.');
    }
    // If user has a passwordHash (legacy local account), do not allow silent takeover
    if (user.passwordHash) {
      throw new Error('This email belongs to an existing local account. Direct takeover is forbidden.');
    }
    user.supabaseUserId = supabaseUserId;
    if (fullName && !user.fullName) {
      user.fullName = fullName;
      user.name = fullName;
    }
    if (familyName && !user.familyName) {
      user.familyName = familyName;
    }
    if (dateOfBirth && !user.dateOfBirth) {
      const dobVal = validateDateOfBirth(dateOfBirth);
      if (dobVal.valid && dobVal.normalized) {
        user.dateOfBirth = dobVal.normalized;
      }
    }
    user.lastActivityAt = new Date();
    await user.save();
    return user;
  }

  // 3. Create new user profile in MongoDB
  let normalizedDob: string | undefined = undefined;
  if (dateOfBirth) {
    const dobVal = validateDateOfBirth(dateOfBirth);
    if (!dobVal.valid || !dobVal.normalized) {
      console.warn(`[User] Non-fatal dateOfBirth validation notice for user ${normalizedEmail}: ${dobVal.error}. Proceeding without DOB.`);
    } else {
      normalizedDob = dobVal.normalized;
    }
  }

  const displayName = fullName?.trim() || normalizedEmail.split('@')[0];
  try {
    const newUser = await this.create({
      supabaseUserId,
      email: normalizedEmail,
      fullName: displayName,
      name: displayName,
      familyName: familyName?.trim() || undefined,
      dateOfBirth: normalizedDob,
      role: 'USER',
      status: 'ACTIVE',
      preferredLang: preferredLang || 'ml',
      lastActivityAt: new Date(),
    });

    return newUser;
  } catch (err: any) {
    // If concurrent creation occurred, resolve existing user record idempotently
    if (err && err.code === 11000) {
      const existingUser = await this.findOne({
        $or: [{ supabaseUserId }, { email: normalizedEmail }],
      });
      if (existingUser) {
        if (!existingUser.supabaseUserId && supabaseUserId) {
          existingUser.supabaseUserId = supabaseUserId;
          await existingUser.save();
        }
        return existingUser;
      }
    }
    throw err;
  }
};

/**
 * Updates a user's lastActivityAt timestamp upon qualifying activity.
 */
UserSchema.statics.recordActivity = async function (userId: string) {
  if (mongoose.connection.readyState !== 1) {
    if (isMockDbAllowed()) {
      for (const user of mockSbUserStore.values()) {
        if (user._id?.toString() === userId || user.id === userId) {
          user.lastActivityAt = new Date();
          break;
        }
      }
    }
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return;
  }
  await this.findByIdAndUpdate(userId, { $set: { lastActivityAt: new Date() } });
};

// Static: Safe password hashing helper
export async function hashUserPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

// Static: Safe duplicate email detection helper
export function isDuplicateEmailError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    if (errObj.code === 11000 && (errObj.keyPattern as Record<string, unknown>)?.email) {
      return true;
    }
  }
  return false;
}

export const User: UserModelType =
  (mongoose.models.User as unknown as UserModelType) ||
  mongoose.model<IUser, UserModelType>('User', UserSchema);

(User as any).mockSbUserStore = mockSbUserStore;
