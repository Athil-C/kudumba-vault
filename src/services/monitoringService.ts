import { Request, Response, NextFunction } from 'express';
import os from 'os';
import mongoose from 'mongoose';
import { SystemMetricSample } from '../models/SystemMetricSample';
import { SystemAlert } from '../models/SystemAlert';
import { getSupabaseStorageClient } from './supabaseStorage';

interface LatencyRecord {
  route: string;
  durationMs: number;
  statusCode: number;
  timestamp: number;
}

// In-memory sliding window for live metrics aggregation (bounded to last 500 requests)
const MAX_LATENCY_SAMPLES = 500;
const latencySamples: LatencyRecord[] = [];
let inFlightRequests = 0;
let requestCounterLastMinute = 0;
let lastRpmReset = Date.now();
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

// Track endpoint metrics
const endpointStats: Record<string, { count: number; totalMs: number; errors: number }> = {};

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  inFlightRequests++;
  requestCounterLastMinute++;

  const now = Date.now();
  if (now - lastRpmReset >= 60000) {
    requestCounterLastMinute = 1;
    lastRpmReset = now;
  }

  const start = process.hrtime();

  res.on('finish', () => {
    inFlightRequests = Math.max(0, inFlightRequests - 1);
    const diff = process.hrtime(start);
    const durationMs = diff[0] * 1000 + diff[1] / 1e6;

    // Normalize route to avoid ID leaks
    let route = req.baseUrl + (req.route ? req.route.path : req.path);
    if (!route || route === '') route = req.path;

    // Track sample
    latencySamples.push({
      route,
      durationMs,
      statusCode: res.statusCode,
      timestamp: Date.now(),
    });

    if (latencySamples.length > MAX_LATENCY_SAMPLES) {
      latencySamples.shift();
    }

    if (!endpointStats[route]) {
      endpointStats[route] = { count: 0, totalMs: 0, errors: 0 };
    }
    endpointStats[route].count++;
    endpointStats[route].totalMs += durationMs;
    if (res.statusCode >= 400) {
      endpointStats[route].errors++;
    }
  });

  next();
}

/**
 * Calculates current CPU percentage used by this Node process
 */
export function getProcessCpuPercentage(): number {
  const currentUsage = process.cpuUsage(lastCpuUsage);
  const currentTime = Date.now();
  const timeDiffMs = currentTime - lastCpuTime;

  lastCpuUsage = process.cpuUsage();
  lastCpuTime = currentTime;

  if (timeDiffMs <= 0) return 0;

  // total microseconds spent by user + sys
  const totalMicros = currentUsage.user + currentUsage.system;
  // totalMicros / (timeDiffMs * 1000) gives fraction of 1 core
  const numCpus = os.cpus().length || 1;
  const percent = (totalMicros / (timeDiffMs * 1000 * numCpus)) * 100;

  return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}

/**
 * Measures MongoDB ping latency safely
 */
export async function measureMongoPing(): Promise<{ connected: boolean; pingMs: number }> {
  if (mongoose.connection.readyState !== 1) {
    return { connected: false, pingMs: 0 };
  }
  try {
    const start = Date.now();
    await mongoose.connection.db?.admin().ping();
    return { connected: true, pingMs: Date.now() - start };
  } catch {
    return { connected: false, pingMs: 0 };
  }
}

/**
 * Measures Supabase Storage ping safely
 */
export async function measureSupabasePing(): Promise<{ connected: boolean; pingMs: number }> {
  try {
    const supabase = getSupabaseStorageClient();
    if (!supabase) {
      return { connected: false, pingMs: 0 };
    }
    const start = Date.now();
    const { error } = await supabase.storage.listBuckets();
    return { connected: !error, pingMs: Date.now() - start };
  } catch {
    return { connected: false, pingMs: 0 };
  }
}

/**
 * Computes percentile from a sorted array of numbers
 */
function getPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, Math.min(index, sorted.length - 1))] * 10) / 10;
}

/**
 * Collects current live metrics snapshot
 */
export async function collectCurrentMetrics() {
  const mem = process.memoryUsage();
  const cpuPercent = getProcessCpuPercentage();
  const mongoCheck = await measureMongoPing();
  const supabaseCheck = await measureSupabasePing();

  const durations = latencySamples.map((s) => s.durationMs).sort((a, b) => a - b);
  const avgLatency = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const p50 = getPercentile(durations, 50);
  const p95 = getPercentile(durations, 95);
  const p99 = getPercentile(durations, 99);

  const error4xx = latencySamples.filter((s) => s.statusCode >= 400 && s.statusCode < 500).length;
  const error5xx = latencySamples.filter((s) => s.statusCode >= 500).length;

  return {
    timestamp: new Date(),
    cpu: {
      processPercent: cpuPercent,
      systemPercent: undefined, // Render Free does not expose host-level CPU
      systemPercentAvailable: false,
    },
    memory: {
      rssBytes: mem.rss,
      heapTotalBytes: mem.heapTotal,
      heapUsedBytes: mem.heapUsed,
      externalBytes: mem.external,
      arrayBuffersBytes: mem.arrayBuffers,
      verifiedRenderFreeLimitBytes: 512 * 1024 * 1024, // 512 MiB limit on Render Free
    },
    api: {
      inFlightRequests,
      requestsPerMinute: requestCounterLastMinute,
      avgLatencyMs: Math.round(avgLatency * 10) / 10,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      error4xxCount: error4xx,
      error5xxCount: error5xx,
      slowEndpoints: Object.entries(endpointStats)
        .map(([route, stat]) => ({
          route,
          count: stat.count,
          avgLatencyMs: Math.round((stat.totalMs / (stat.count || 1)) * 10) / 10,
          errors: stat.errors,
        }))
        .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
        .slice(0, 10),
    },
    database: {
      mongoConnected: mongoCheck.connected,
      mongoPingMs: mongoCheck.pingMs,
      activeConnections: (mongoose.connection as any).client?.topology?.s?.servers?.size || 1,
    },
    storage: {
      supabaseConnected: supabaseCheck.connected,
      pingMs: supabaseCheck.pingMs,
    },
  };
}

/**
 * Background sample recorder (runs periodically, e.g. every 60 seconds)
 * Persists bounded samples to SystemMetricSample and checks for active alerts
 */
export async function sampleAndPersistMetrics() {
  try {
    if (mongoose.connection.readyState !== 1) return;

    const current = await collectCurrentMetrics();

    // Persist to MongoDB
    await SystemMetricSample.create({
      timestamp: current.timestamp,
      cpu: {
        processPercent: current.cpu.processPercent,
      },
      memory: {
        rssBytes: current.memory.rssBytes,
        heapTotalBytes: current.memory.heapTotalBytes,
        heapUsedBytes: current.memory.heapUsedBytes,
        externalBytes: current.memory.externalBytes,
        arrayBuffersBytes: current.memory.arrayBuffersBytes,
      },
      api: {
        inFlightRequests: current.api.inFlightRequests,
        requestsPerMinute: current.api.requestsPerMinute,
        avgLatencyMs: current.api.avgLatencyMs,
        p95LatencyMs: current.api.p95LatencyMs,
        p99LatencyMs: current.api.p99LatencyMs,
        error4xxCount: current.api.error4xxCount,
        error5xxCount: current.api.error5xxCount,
      },
      database: {
        mongoConnected: current.database.mongoConnected,
        mongoPingMs: current.database.mongoPingMs,
      },
      storage: {
        supabaseConnected: current.storage.supabaseConnected,
        pingMs: current.storage.pingMs,
      },
    });

    // Check automated bottleneck rules
    if (current.cpu.processPercent >= 85) {
      await createSystemAlert({
        category: 'CPU',
        severity: current.cpu.processPercent >= 95 ? 'CRITICAL' : 'WARNING',
        title: 'High Process CPU Utilization',
        message: `Node.js process CPU reached ${current.cpu.processPercent}%. Sustained CPU load may cause request queueing.`,
        measuredEvidence: { processPercent: current.cpu.processPercent },
        recommendedAction: 'Inspect top slow endpoints or consider upgrading from Render Free single-core container.',
      });
    }

    if (current.memory.rssBytes >= 420 * 1024 * 1024) {
      await createSystemAlert({
        category: 'MEMORY',
        severity: current.memory.rssBytes >= 480 * 1024 * 1024 ? 'CRITICAL' : 'WARNING',
        title: 'High Process Memory Pressure',
        message: `RSS Memory has reached ${Math.round(current.memory.rssBytes / (1024 * 1024))} MiB. Render Free container limit is 512 MiB.`,
        measuredEvidence: { rssBytes: current.memory.rssBytes, heapUsedBytes: current.memory.heapUsedBytes },
        recommendedAction: 'Trigger manual garbage collection, check for memory leaks in cache objects, or upgrade hosting tier.',
      });
    }

    if (!current.database.mongoConnected) {
      await createSystemAlert({
        category: 'DATABASE',
        severity: 'CRITICAL',
        title: 'MongoDB Atlas Connection Lost',
        message: 'Primary database ping failed. Customer vault operations will fail until restored.',
        measuredEvidence: { mongoPingMs: current.database.mongoPingMs },
        recommendedAction: 'Verify Atlas cluster status, IP whitelist rules, or connection string credentials.',
      });
    }
  } catch (err) {
    console.error('[Monitoring] Metric sampling error:', err);
  }
}

/**
 * Creates deduplicated system alerts
 */
export async function createSystemAlert(params: {
  category: 'CPU' | 'MEMORY' | 'DATABASE' | 'STORAGE' | 'API' | 'SECURITY' | 'WEBHOOK';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  measuredEvidence?: Record<string, any>;
  recommendedAction?: string;
}) {
  try {
    if (mongoose.connection.readyState !== 1) return;

    // Deduplicate: check if an ACTIVE alert in the same category with identical title exists in the last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const existing = await SystemAlert.findOne({
      category: params.category,
      title: params.title,
      status: 'ACTIVE',
      timestamp: { $gte: fifteenMinutesAgo },
    });

    if (existing) {
      // Update evidence and timestamp rather than spamming
      existing.timestamp = new Date();
      existing.measuredEvidence = params.measuredEvidence;
      await existing.save();
      return existing;
    }

    return await SystemAlert.create({
      category: params.category,
      severity: params.severity,
      title: params.title,
      message: params.message,
      measuredEvidence: params.measuredEvidence,
      recommendedAction: params.recommendedAction,
      status: 'ACTIVE',
    });
  } catch (err) {
    console.error('[Monitoring] Alert creation error:', err);
  }
}

let samplingTimer: NodeJS.Timeout | null = null;

export function startMonitoringDaemon(intervalSeconds = 60) {
  if (samplingTimer) clearInterval(samplingTimer);
  samplingTimer = setInterval(() => {
    sampleAndPersistMetrics();
  }, intervalSeconds * 1000);
}
