import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminAuditEvent extends Document {
  timestamp: Date;
  action: string;
  category: 'AUTH' | 'USER_MANAGEMENT' | 'FAMILY_MANAGEMENT' | 'PLAN' | 'BILLING' | 'DOCUMENT' | 'SETTINGS' | 'SECURITY';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  adminId: string;
  adminEmail: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  outcome: 'SUCCESS' | 'FAILURE';
  createdAt: Date;
}

const AdminAuditEventSchema = new Schema<IAdminAuditEvent>(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    action: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['AUTH', 'USER_MANAGEMENT', 'FAMILY_MANAGEMENT', 'PLAN', 'BILLING', 'DOCUMENT', 'SETTINGS', 'SECURITY'],
      index: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ['INFO', 'WARNING', 'CRITICAL'],
      default: 'INFO',
      index: true,
    },
    adminId: { type: String, required: true, index: true },
    adminEmail: { type: String, required: true, trim: true, lowercase: true },
    targetId: { type: String, trim: true, index: true },
    targetType: { type: String, trim: true },
    details: { type: Schema.Types.Mixed },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    outcome: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS', index: true },
  },
  {
    timestamps: true,
  }
);

AdminAuditEventSchema.index({ timestamp: -1 });
AdminAuditEventSchema.index({ category: 1, timestamp: -1 });

export const AdminAuditEvent = mongoose.model<IAdminAuditEvent>('AdminAuditEvent', AdminAuditEventSchema);
