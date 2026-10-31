import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemMetricSample extends Document {
  timestamp: Date;
  cpu: {
    processPercent: number;
    systemPercent?: number;
  };
  memory: {
    rssBytes: number;
    heapTotalBytes: number;
    heapUsedBytes: number;
    externalBytes: number;
    arrayBuffersBytes: number;
  };
  api: {
    inFlightRequests: number;
    requestsPerMinute: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    error4xxCount: number;
    error5xxCount: number;
  };
  database: {
    mongoConnected: boolean;
    mongoPingMs: number;
    activeConnections?: number;
  };
  storage: {
    supabaseConnected: boolean;
    pingMs: number;
  };
  createdAt: Date;
}

const SystemMetricSampleSchema = new Schema<ISystemMetricSample>(
  {
    timestamp: { type: Date, default: Date.now },
    cpu: {
      processPercent: { type: Number, default: 0 },
      systemPercent: { type: Number },
    },
    memory: {
      rssBytes: { type: Number, required: true },
      heapTotalBytes: { type: Number, required: true },
      heapUsedBytes: { type: Number, required: true },
      externalBytes: { type: Number, default: 0 },
      arrayBuffersBytes: { type: Number, default: 0 },
    },
    api: {
      inFlightRequests: { type: Number, default: 0 },
      requestsPerMinute: { type: Number, default: 0 },
      avgLatencyMs: { type: Number, default: 0 },
      p95LatencyMs: { type: Number, default: 0 },
      p99LatencyMs: { type: Number, default: 0 },
      error4xxCount: { type: Number, default: 0 },
      error5xxCount: { type: Number, default: 0 },
    },
    database: {
      mongoConnected: { type: Boolean, default: false },
      mongoPingMs: { type: Number, default: 0 },
      activeConnections: { type: Number },
    },
    storage: {
      supabaseConnected: { type: Boolean, default: false },
      pingMs: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically expire metrics after 7 days to preserve Atlas M0 free tier storage
SystemMetricSampleSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const SystemMetricSample = mongoose.model<ISystemMetricSample>('SystemMetricSample', SystemMetricSampleSchema);
