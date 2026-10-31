import mongoose, { Types } from 'mongoose';
import {
  User,
  isMockDbAllowed,
  getMockUserBySupabaseId,
  findMockUserById,
  updateMockUserById,
} from '../models/User';
import {
  UserSettings,
  INotificationPreferences,
  ISecurityPreferences,
  getMockUserSettingsByUserId,
  setMockUserSettings,
} from '../models/UserSettings';
import { validateDateOfBirth } from '../utils/dobValidation';
import { ensureDatabaseConnected } from '../config/db';

export interface UserProfileSettings {
  id: string;
  fullName: string;
  familyName?: string;
  email: string;
  role: string;
  status: string;
  preferredLang: 'ml' | 'en';
  isEmailVerified: boolean;
  hasDateOfBirth: boolean;
  dateOfBirthMasked: string;
}

export interface UserSettingsResponse {
  profile: UserProfileSettings;
  notificationPreferences: INotificationPreferences;
  securityPreferences: ISecurityPreferences;
  updatedAt?: Date;
}

const DEFAULT_NOTIFICATION_PREFERENCES: INotificationPreferences = {
  reminder60Days: true,
  reminder30Days: true,
  reminder7Days: true,
  reminderExpired: true,
  weeklyDigest: true,
};

const DEFAULT_SECURITY_PREFERENCES: ISecurityPreferences = {
  sessionTimeoutDays: 7,
  inactivityLockEnabled: true,
};

/**
 * Retrieves the unified settings for the authenticated user and their household.
 */
export async function getUserSettings(userId: string): Promise<UserSettingsResponse> {
  if (mongoose.connection.readyState !== 1) {
    await ensureDatabaseConnected();
  }

  const isMockAllowed = isMockDbAllowed();
  if (mongoose.connection.readyState !== 1 && !isMockAllowed) {
    throw new Error('Database service is currently unavailable. Please ensure MongoDB is connected.');
  }

  // 1. Resolve user profile
  let user: any = null;
  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    user = await User.findById(userId);
  } else if (isMockAllowed) {
    user = getMockUserSettingsByUserId(userId)?.user || findMockUserById(userId) || null;
  }

  if (!user && Types.ObjectId.isValid(userId) && mongoose.connection.readyState === 1) {
    // Attempt fallback query
    user = await User.findOne({ _id: userId });
  }

  if (!user) {
    // Default safe user for mock/test runs if not found
    if (isMockAllowed) {
      user = {
        _id: userId,
        id: userId,
        name: 'Household Admin',
        fullName: 'Household Admin',
        familyName: 'Kudumba Vault',
        email: 'user@kudumbavault.com',
        role: 'USER',
        status: 'ACTIVE',
        preferredLang: 'ml',
        dateOfBirth: '1990-01-01',
      };
    } else {
      throw new Error('User profile not found.');
    }
  }

  // 2. Resolve user settings document
  let settingsDoc: any = null;
  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    settingsDoc = await UserSettings.findOne({ userId });
    if (!settingsDoc) {
      // Initialize with default preferences
      settingsDoc = await UserSettings.create({
        userId: new Types.ObjectId(userId),
        householdId: user.familyName || 'default-household',
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
        securityPreferences: { ...DEFAULT_SECURITY_PREFERENCES },
      });
    }
  } else if (isMockAllowed) {
    settingsDoc = getMockUserSettingsByUserId(userId)?.settings;
    if (!settingsDoc) {
      settingsDoc = {
        userId,
        householdId: user.familyName || 'default-household',
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
        securityPreferences: { ...DEFAULT_SECURITY_PREFERENCES },
        updatedAt: new Date(),
      };
      setMockUserSettings(userId, { user, settings: settingsDoc });
    }
  }

  const notificationPreferences: INotificationPreferences = {
    reminder60Days: settingsDoc?.notificationPreferences?.reminder60Days ?? true,
    reminder30Days: settingsDoc?.notificationPreferences?.reminder30Days ?? true,
    reminder7Days: settingsDoc?.notificationPreferences?.reminder7Days ?? true,
    reminderExpired: settingsDoc?.notificationPreferences?.reminderExpired ?? true,
    weeklyDigest: settingsDoc?.notificationPreferences?.weeklyDigest ?? true,
  };

  const securityPreferences: ISecurityPreferences = {
    sessionTimeoutDays: settingsDoc?.securityPreferences?.sessionTimeoutDays ?? 7,
    inactivityLockEnabled: settingsDoc?.securityPreferences?.inactivityLockEnabled ?? true,
  };

  const profile: UserProfileSettings = {
    id: user._id ? user._id.toString() : user.id || userId,
    fullName: user.fullName || user.name || 'Athil',
    familyName: user.familyName || '',
    email: user.email,
    role: user.role || 'USER',
    status: user.status || 'ACTIVE',
    preferredLang: user.preferredLang || 'ml',
    isEmailVerified: true,
    hasDateOfBirth: Boolean(user.dateOfBirth),
    dateOfBirthMasked: '••••-••-••',
  };

  return {
    profile,
    notificationPreferences,
    securityPreferences,
    updatedAt: settingsDoc?.updatedAt || new Date(),
  };
}

/**
 * Updates household and profile settings securely.
 */
export async function updateProfileSettings(
  userId: string,
  data: {
    fullName?: string;
    householdName?: string;
    familyName?: string;
    dateOfBirth?: string;
    preferredLang?: 'ml' | 'en';
  }
): Promise<UserProfileSettings> {
  if (mongoose.connection.readyState !== 1) {
    await ensureDatabaseConnected();
  }

  const isMockAllowed = isMockDbAllowed();
  if (mongoose.connection.readyState !== 1 && !isMockAllowed) {
    throw new Error('Database service is currently unavailable. Please ensure MongoDB is connected.');
  }

  let user: any = null;
  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    user = await User.findById(userId);
  } else if (isMockAllowed) {
    user = getMockUserSettingsByUserId(userId)?.user || findMockUserById(userId) || null;
  }

  if (!user && isMockAllowed) {
    user = {
      _id: userId,
      id: userId,
      name: 'Household Admin',
      fullName: 'Household Admin',
      familyName: 'Kudumba Vault',
      email: 'user@kudumbavault.com',
      role: 'USER',
      status: 'ACTIVE',
      preferredLang: 'ml',
    };
  }

  if (!user) {
    throw new Error('User profile not found.');
  }

  // 0. Protect against modification of privileged / immutable fields
  const FORBIDDEN_FIELDS = ['role', 'status', 'email', 'passwordHash', 'isAdmin', 'isEmailVerified', 'supabaseUserId', '_id', 'id'];
  for (const field of FORBIDDEN_FIELDS) {
    if (field in (data as any)) {
      throw new Error(`Modifying protected field '${field}' is strictly forbidden.`);
    }
  }

  // 1. Validate & update fullName
  if (typeof data.fullName === 'string') {
    const cleanFull = data.fullName.trim();
    if (cleanFull.length < 2) {
      throw new Error('Full name must be at least 2 characters.');
    }
    if (cleanFull.length > 120) {
      throw new Error('Full name cannot exceed 120 characters.');
    }
    user.fullName = cleanFull;
    user.name = cleanFull;
  }

  // 2. Validate & update familyName / householdName
  const rawHousehold = data.householdName !== undefined ? data.householdName : data.familyName;
  if (typeof rawHousehold === 'string') {
    const cleanHousehold = rawHousehold.trim();
    if (cleanHousehold.length < 2) {
      throw new Error('Household name must be at least 2 characters.');
    }
    if (cleanHousehold.length > 120) {
      throw new Error('Household name cannot exceed 120 characters.');
    }
    user.familyName = cleanHousehold;
  }

  // 3. Validate & update dateOfBirth securely
  if (data.dateOfBirth !== undefined && data.dateOfBirth !== null && data.dateOfBirth.trim() !== '') {
    const dobValidation = validateDateOfBirth(data.dateOfBirth);
    if (!dobValidation.valid || !dobValidation.normalized) {
      throw new Error(dobValidation.error || 'Invalid date of birth provided.');
    }
    user.dateOfBirth = dobValidation.normalized;
  }

  // 4. Update preferred language
  if (data.preferredLang === 'ml' || data.preferredLang === 'en') {
    user.preferredLang = data.preferredLang;
  }

  // Persist user changes
  if (mongoose.connection.readyState === 1 && typeof user.save === 'function') {
    await user.save();
    // Also keep UserSettings.householdId aligned
    if (user.familyName) {
      await UserSettings.findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { householdId: user.familyName },
        { upsert: true }
      );
    }
    // Also keep HouseholdMember owner synchronized if present
    if (Types.ObjectId.isValid(userId)) {
      try {
        const { HouseholdMemberModel } = await import('../models/HouseholdMember');
        if (user.familyName) {
          await HouseholdMemberModel.updateMany(
            { ownerId: new Types.ObjectId(userId) },
            { $set: { householdName: user.familyName } }
          );
        }
        if (user.fullName) {
          await HouseholdMemberModel.updateMany(
            { ownerId: new Types.ObjectId(userId), role: 'OWNER' },
            { $set: { nameEn: user.fullName } }
          );
        }
      } catch (memberErr) {
        // Non-blocking member sync notice
      }
    }
  } else if (isMockAllowed) {
    const currentMock = getMockUserSettingsByUserId(userId) || {};
    currentMock.user = user;
    if (currentMock.settings && user.familyName) {
      currentMock.settings.householdId = user.familyName;
    }
    setMockUserSettings(userId, currentMock);

    // Also update mock user store
    updateMockUserById(userId, user);
    if (user.supabaseUserId) {
      updateMockUserById(user.supabaseUserId, user);
    }
  }

  return {
    id: user._id ? user._id.toString() : user.id || userId,
    fullName: user.fullName || user.name,
    familyName: user.familyName || '',
    email: user.email,
    role: user.role || 'USER',
    status: user.status || 'ACTIVE',
    preferredLang: user.preferredLang || 'ml',
    isEmailVerified: true,
    hasDateOfBirth: Boolean(user.dateOfBirth),
    dateOfBirthMasked: '••••-••-••',
  };
}

/**
 * Updates notification milestone preferences.
 */
export async function updateNotificationSettings(
  userId: string,
  prefs: Partial<INotificationPreferences>
): Promise<INotificationPreferences> {
  if (mongoose.connection.readyState !== 1) {
    await ensureDatabaseConnected();
  }

  const isMockAllowed = isMockDbAllowed();
  if (mongoose.connection.readyState !== 1 && !isMockAllowed) {
    throw new Error('Database service is currently unavailable. Please ensure MongoDB is connected.');
  }

  const allowedKeys: (keyof INotificationPreferences)[] = [
    'reminder60Days',
    'reminder30Days',
    'reminder7Days',
    'reminderExpired',
    'weeklyDigest',
  ];

  const updateFields: Partial<INotificationPreferences> = {};
  for (const key of allowedKeys) {
    if (prefs[key] !== undefined) {
      if (typeof prefs[key] !== 'boolean') {
        throw new Error(`Notification preference ${key} must be a boolean.`);
      }
      updateFields[key] = prefs[key];
    }
  }

  if (Object.keys(updateFields).length === 0) {
    throw new Error('No valid notification preferences supplied for update.');
  }

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    const query = { userId: new Types.ObjectId(userId) };
    const setQuery: Record<string, any> = {};
    for (const [k, v] of Object.entries(updateFields)) {
      setQuery[`notificationPreferences.${k}`] = v;
    }

    const updated = await UserSettings.findOneAndUpdate(
      query,
      { $set: setQuery },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return {
      reminder60Days: updated.notificationPreferences.reminder60Days ?? true,
      reminder30Days: updated.notificationPreferences.reminder30Days ?? true,
      reminder7Days: updated.notificationPreferences.reminder7Days ?? true,
      reminderExpired: updated.notificationPreferences.reminderExpired ?? true,
      weeklyDigest: updated.notificationPreferences.weeklyDigest ?? true,
    };
  } else if (isMockAllowed) {
    const currentMock = getMockUserSettingsByUserId(userId) || {
      settings: {
        userId,
        householdId: 'default-household',
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
        securityPreferences: { ...DEFAULT_SECURITY_PREFERENCES },
      },
    };
    currentMock.settings.notificationPreferences = {
      ...currentMock.settings.notificationPreferences,
      ...updateFields,
    };
    currentMock.settings.updatedAt = new Date();
    setMockUserSettings(userId, currentMock);
    return currentMock.settings.notificationPreferences;
  }

  throw new Error('Failed to update notification settings.');
}

/**
 * Updates security and session preferences.
 */
export async function updateSecuritySettings(
  userId: string,
  sec: Partial<ISecurityPreferences>
): Promise<ISecurityPreferences> {
  if (mongoose.connection.readyState !== 1) {
    await ensureDatabaseConnected();
  }

  const isMockAllowed = isMockDbAllowed();
  if (mongoose.connection.readyState !== 1 && !isMockAllowed) {
    throw new Error('Database service is currently unavailable. Please ensure MongoDB is connected.');
  }

  const updateFields: Partial<ISecurityPreferences> = {};
  if (sec.sessionTimeoutDays !== undefined) {
    const days = Number(sec.sessionTimeoutDays);
    if (isNaN(days) || days < 1 || days > 90) {
      throw new Error('sessionTimeoutDays must be an integer between 1 and 90.');
    }
    updateFields.sessionTimeoutDays = days;
  }

  if (sec.inactivityLockEnabled !== undefined) {
    if (typeof sec.inactivityLockEnabled !== 'boolean') {
      throw new Error('inactivityLockEnabled must be a boolean.');
    }
    updateFields.inactivityLockEnabled = sec.inactivityLockEnabled;
  }

  if (Object.keys(updateFields).length === 0) {
    throw new Error('No valid security preferences supplied for update.');
  }

  if (mongoose.connection.readyState === 1 && Types.ObjectId.isValid(userId)) {
    const query = { userId: new Types.ObjectId(userId) };
    const setQuery: Record<string, any> = {};
    for (const [k, v] of Object.entries(updateFields)) {
      setQuery[`securityPreferences.${k}`] = v;
    }

    const updated = await UserSettings.findOneAndUpdate(
      query,
      { $set: setQuery },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return {
      sessionTimeoutDays: updated.securityPreferences.sessionTimeoutDays ?? 7,
      inactivityLockEnabled: updated.securityPreferences.inactivityLockEnabled ?? true,
    };
  } else if (isMockAllowed) {
    const currentMock = getMockUserSettingsByUserId(userId) || {
      settings: {
        userId,
        householdId: 'default-household',
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
        securityPreferences: { ...DEFAULT_SECURITY_PREFERENCES },
      },
    };
    currentMock.settings.securityPreferences = {
      ...currentMock.settings.securityPreferences,
      ...updateFields,
    };
    currentMock.settings.updatedAt = new Date();
    setMockUserSettings(userId, currentMock);
    return currentMock.settings.securityPreferences;
  }

  throw new Error('Failed to update security settings.');
}
