import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminSettings extends Document {
  key: string;
  alertThresholds: {
    cpuWarningPercent: number;
    cpuCriticalPercent: number;
    memoryWarningBytes: number;
    memoryCriticalBytes: number;
    apiLatencyWarningMs: number;
    api5xxRateWarningPercent: number;
    mongoPingCriticalMs: number;
  };
  monitoring: {
    samplingIntervalSeconds: number;
    retentionDays: number;
  };
  notifications: {
    adminEmails: string[];
    enableEmailAlerts: boolean;
    notifyOnCriticalOnly: boolean;
    cooldownMinutes: number;
  };
  security: {
    mfaEnforcedForSuperAdmin: boolean;
    sessionTimeoutMinutes: number;
    rateLimitAdminPerHour: number;
  };
  updatedBy?: string;
  updatedAt: Date;
}

const AdminSettingsSchema = new Schema<IAdminSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    alertThresholds: {
      cpuWarningPercent: { type: Number, default: 80 },
      cpuCriticalPercent: { type: Number, default: 95 },
      memoryWarningBytes: { type: Number, default: 400 * 1024 * 1024 }, // 400MB
      memoryCriticalBytes: { type: Number, default: 480 * 1024 * 1024 }, // 480MB (Render free ~512MB)
      apiLatencyWarningMs: { type: Number, default: 1500 },
      api5xxRateWarningPercent: { type: Number, default: 5 },
      mongoPingCriticalMs: { type: Number, default: 500 },
    },
    monitoring: {
      samplingIntervalSeconds: { type: Number, default: 60 },
      retentionDays: { type: Number, default: 7 },
    },
    notifications: {
      adminEmails: [{ type: String, trim: true, lowercase: true }],
      enableEmailAlerts: { type: Boolean, default: true },
      notifyOnCriticalOnly: { type: Boolean, default: false },
      cooldownMinutes: { type: Number, default: 30 },
    },
    security: {
      mfaEnforcedForSuperAdmin: { type: Boolean, default: false },
      sessionTimeoutMinutes: { type: Number, default: 60 },
      rateLimitAdminPerHour: { type: Number, default: 1000 },
    },
    updatedBy: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

export const AdminSettings = mongoose.model<IAdminSettings>('AdminSettings', AdminSettingsSchema);
