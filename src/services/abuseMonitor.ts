import { createSystemAlert } from './monitoringService';

export interface AbuseViolationEntry {
  identifier: string; // IP address or userId
  ip?: string;
  userId?: string;
  endpoint: string;
  reason: string;
  violationsCount: number;
  firstViolationAt: number;
  lastViolationAt: number;
}

const abuseStore = new Map<string, AbuseViolationEntry>();
const ABUSE_WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding evaluation window
const WARNING_THRESHOLD = 5; // Alert at 5 violations
const CRITICAL_THRESHOLD = 10; // Escalate alert at 10+ violations

export function clearAbuseViolations(): void {
  abuseStore.clear();
}

export function getAbuseViolations(identifier: string): AbuseViolationEntry | undefined {
  const entry = abuseStore.get(identifier);
  if (!entry) return undefined;
  if (Date.now() - entry.lastViolationAt > ABUSE_WINDOW_MS) {
    abuseStore.delete(identifier);
    return undefined;
  }
  return entry;
}

/**
 * Records an abuse violation (e.g. rate limit exceeded, brute-force attempt, tampering).
 * Automatically triggers deduplicated SystemAlerts in the database when thresholds are crossed.
 */
export async function recordAbuseViolation(params: {
  ip: string;
  userId?: string;
  endpoint: string;
  reason: string;
}): Promise<{ violationCount: number; alerted: boolean }> {
  const now = Date.now();
  const identifier = params.userId ? `user:${params.userId}` : `ip:${params.ip}`;
  const existing = abuseStore.get(identifier);

  let currentCount = 1;
  if (existing && now - existing.lastViolationAt <= ABUSE_WINDOW_MS) {
    existing.violationsCount++;
    existing.lastViolationAt = now;
    existing.endpoint = params.endpoint;
    existing.reason = params.reason;
    currentCount = existing.violationsCount;
  } else {
    abuseStore.set(identifier, {
      identifier,
      ip: params.ip,
      userId: params.userId,
      endpoint: params.endpoint,
      reason: params.reason,
      violationsCount: 1,
      firstViolationAt: now,
      lastViolationAt: now,
    });
    currentCount = 1;
  }

  let alerted = false;
  if (currentCount >= WARNING_THRESHOLD) {
    const severity = currentCount >= CRITICAL_THRESHOLD ? 'CRITICAL' : 'WARNING';
    const alertTitle = currentCount >= CRITICAL_THRESHOLD
      ? `Critical Abuse Pattern: ${params.reason}`
      : `Security Abuse Detected: ${params.reason}`;

    try {
      await createSystemAlert({
        category: 'SECURITY',
        severity,
        title: alertTitle,
        message: `High volume of security / rate-limit violations from ${identifier} on ${params.endpoint}. Count: ${currentCount} within 15 minutes.`,
        measuredEvidence: {
          identifier,
          ip: params.ip,
          userId: params.userId,
          endpoint: params.endpoint,
          reason: params.reason,
          violationsCount: currentCount,
          lastViolationAt: new Date(now).toISOString(),
        },
        recommendedAction: currentCount >= CRITICAL_THRESHOLD
          ? 'Urgent: Consider temporary IP block / firewall rule or account review.'
          : 'Monitor client activity and inspect application logs for suspicious payloads.',
      });
      alerted = true;
    } catch (alertErr) {
      console.warn('[AbuseMonitor] Non-fatal alert dispatch error:', alertErr);
    }
  }

  return { violationCount: currentCount, alerted };
}
