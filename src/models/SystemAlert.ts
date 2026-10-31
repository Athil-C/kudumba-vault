import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemAlert extends Document {
  timestamp: Date;
  category: 'CPU' | 'MEMORY' | 'DATABASE' | 'STORAGE' | 'API' | 'SECURITY' | 'WEBHOOK';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  measuredEvidence?: Record<string, any>;
  recommendedAction?: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  notes?: string;
  createdAt: Date;
}

const SystemAlertSchema = new Schema<ISystemAlert>(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    category: {
      type: String,
      required: true,
      enum: ['CPU', 'MEMORY', 'DATABASE', 'STORAGE', 'API', 'SECURITY', 'WEBHOOK'],
      index: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ['INFO', 'WARNING', 'CRITICAL'],
      default: 'WARNING',
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    measuredEvidence: { type: Schema.Types.Mixed },
    recommendedAction: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'],
      default: 'ACTIVE',
      index: true,
    },
    acknowledgedBy: { type: String, trim: true },
    acknowledgedAt: { type: Date },
    resolvedAt: { type: Date },
    notes: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

SystemAlertSchema.index({ status: 1, severity: 1, timestamp: -1 });

export const SystemAlert = mongoose.model<ISystemAlert>('SystemAlert', SystemAlertSchema);
