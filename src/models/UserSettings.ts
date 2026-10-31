import mongoose, { Schema, Model, Types } from 'mongoose';
import { isMockDbAllowed } from './User';

export interface INotificationPreferences {
  reminder60Days: boolean;
  reminder30Days: boolean;
  reminder7Days: boolean;
  reminderExpired: boolean;
  weeklyDigest: boolean;
}

export interface ISecurityPreferences {
  sessionTimeoutDays: number;
  inactivityLockEnabled: boolean;
}

export interface ISavedBillingAddress {
  fullName: string;
  houseBuilding: string;
  streetLocality: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
}

export interface IUserSettings {
  userId: Types.ObjectId;
  householdId: string;
  notificationPreferences: INotificationPreferences;
  securityPreferences: ISecurityPreferences;
  billingAddress?: ISavedBillingAddress;
  createdAt: Date;
  updatedAt: Date;
}

export type UserSettingsModelType = Model<IUserSettings>;

const UserSettingsSchema = new Schema<IUserSettings, UserSettingsModelType>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    householdId: {
      type: String,
      default: 'default-household',
      trim: true,
      index: true,
    },
    notificationPreferences: {
      reminder60Days: { type: Boolean, default: true },
      reminder30Days: { type: Boolean, default: true },
      reminder7Days: { type: Boolean, default: true },
      reminderExpired: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: true },
    },
    securityPreferences: {
      sessionTimeoutDays: { type: Number, default: 7, min: 1, max: 90 },
      inactivityLockEnabled: { type: Boolean, default: true },
    },
    billingAddress: {
      fullName: { type: String, trim: true },
      houseBuilding: { type: String, trim: true },
      streetLocality: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true, default: 'India' },
      postalCode: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const copy = { ...ret } as unknown as Record<string, unknown>;
        delete copy.__v;
        copy.id = ret._id?.toString();
        delete copy._id;
        return copy;
      },
    },
  }
);

export const UserSettingsModel: UserSettingsModelType =
  (mongoose.models.UserSettings as UserSettingsModelType) ||
  mongoose.model<IUserSettings, UserSettingsModelType>('UserSettings', UserSettingsSchema);

export const UserSettings = UserSettingsModel;

// In-memory test store fallback for hermetic test execution
const mockUserSettingsStore = new Map<string, any>();

export function clearMockUserSettingsStore(): void {
  mockUserSettingsStore.clear();
}

export function getMockUserSettingsByUserId(userId: string): any {
  return mockUserSettingsStore.get(userId);
}

export function setMockUserSettings(userId: string, data: any): void {
  mockUserSettingsStore.set(userId, data);
}
