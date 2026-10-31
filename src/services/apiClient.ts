/**
 * Kudumba Vault API Client
 * Centralized, typed HTTP client for authenticated backend interactions.
 * Sends Bearer token via Authorization header and credentials: 'include'.
 */

export interface SafeUser {
  id: string;
  name: string;
  fullName?: string;
  familyName?: string;
  email: string;
  role: string;
  status: string;
  preferredLang: 'ml' | 'en';
  supabaseUserId?: string;
  isEmailVerified?: boolean;
  lastActivityAt?: string | Date;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiError {
  message: string;
  statusCode: number;
}

export const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

let currentAccessToken: string | null = null;
let inactivityCallback: ((msg: string) => void) | null = null;
let unauthorizedCallback: ((msg: string) => void) | null = null;

// Diagnostics tracking for requests
export interface ApiDiagnosticEntry {
  url: string;
  method: string;
  status: number;
  trigger: string;
  repeatCount: number;
  hasToken: boolean;
  timestamp: string;
}

const endpointRequestCounters = new Map<string, { count: number; lastTime: number }>();
const diagnosticLog: ApiDiagnosticEntry[] = [];
let unauthorizedCooldownUntil = 0;

// In-flight and cached states to eliminate infinite polling loops
let inFlightMePromise: Promise<SafeUser | null> | null = null;
let lastMeCache: { token: string | null; user: SafeUser | null; time: number } | null = null;

let inFlightSubscriptionPromise: Promise<EntitlementStatusClient> | null = null;
let lastSubscriptionCache: {
  token: string | null;
  entitlement: EntitlementStatusClient;
  time: number;
} | null = null;

export function invalidateUserCache(): void {
  lastMeCache = null;
  inFlightMePromise = null;
}

export function invalidateSubscriptionCache(): void {
  lastSubscriptionCache = null;
  inFlightSubscriptionPromise = null;
}

export function updateSubscriptionCache(entitlement: EntitlementStatusClient): void {
  lastSubscriptionCache = {
    token: currentAccessToken,
    entitlement,
    time: Date.now(),
  };
}

export function getApiDiagnostics(): ApiDiagnosticEntry[] {
  return [...diagnosticLog];
}

export function clearApiDiagnostics(): void {
  endpointRequestCounters.clear();
  diagnosticLog.length = 0;
  unauthorizedCooldownUntil = 0;
  invalidateUserCache();
  invalidateSubscriptionCache();
}

export function logSanitizedDiagnostic(params: {
  url: string;
  method?: string;
  status: number;
  trigger?: string;
}) {
  const method = params.method || 'GET';
  // Strip query parameters to avoid logging tokens, OTPs, or signatures
  const sanitizedUrl = params.url.split('?')[0];
  const key = `${method} ${sanitizedUrl}`;
  const now = Date.now();
  const existing = endpointRequestCounters.get(key) || { count: 0, lastTime: 0 };
  const count = now - existing.lastTime < 10000 ? existing.count + 1 : 1;
  endpointRequestCounters.set(key, { count, lastTime: now });

  const entry: ApiDiagnosticEntry = {
    url: sanitizedUrl,
    method,
    status: params.status,
    trigger: params.trigger || 'unknown',
    repeatCount: count,
    hasToken: Boolean(currentAccessToken),
    timestamp: new Date().toISOString(),
  };

  diagnosticLog.push(entry);
  if (diagnosticLog.length > 50) {
    diagnosticLog.shift();
  }

  if (process.env.NODE_ENV !== 'test') {
    // Sanitized diagnostic only: strictly no tokens, passwords, or personal details
    console.debug(
      `[Kudumba API Diagnostic] ${entry.method} ${entry.url} | Status: ${entry.status} | Trigger: ${entry.trigger} | Repeat: ${entry.repeatCount} | Authed: ${entry.hasToken}`
    );
  }
}

export function registerInactivityHandler(handler: (msg: string) => void) {
  inactivityCallback = handler;
}

export function registerUnauthorizedHandler(handler: (msg: string) => void) {
  unauthorizedCallback = handler;
}

export function setApiAccessToken(token: string | null) {
  if (currentAccessToken !== token) {
    currentAccessToken = token;
    // Invalidate request caches on session/token transition
    invalidateUserCache();
    invalidateSubscriptionCache();
  }
}

export function getApiAccessToken(): string | null {
  return currentAccessToken;
}

export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (currentAccessToken) {
    headers['Authorization'] = `Bearer ${currentAccessToken}`;
  }
  return headers;
}

export class ApiClientError extends Error {
  statusCode: number;
  errorCode?: string;
  requiresReauth?: boolean;
  diagnostics?: any;

  constructor(message: string, statusCode: number, errorCode?: string, requiresReauth?: boolean, diagnostics?: any) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.requiresReauth = requiresReauth;
    this.diagnostics = diagnostics;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return {} as T;
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
    let errorCode: string | undefined = undefined;
    let requiresReauth = false;
    let diagnostics: any = undefined;
    if (isJson) {
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        errorCode = errorData.errorCode || errorData.code;
        requiresReauth = Boolean(errorData.requiresReauth);
        diagnostics = errorData.diagnostics;
      } catch {
        // Fall back to status text
      }
    }
    if (errorCode === 'INACTIVITY_TIMEOUT' || requiresReauth) {
      inactivityCallback?.(errorMessage);
    } else if (res.status === 401 && currentAccessToken) {
      unauthorizedCallback?.(errorMessage);
    }
    throw new ApiClientError(errorMessage, res.status, errorCode, requiresReauth, diagnostics);
  }

  if (isJson) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

// ----------------------------------------------------
// Authentication Endpoints
// ----------------------------------------------------

export async function apiRegister(data: {
  name: string;
  email: string;
  password: string;
  preferredLang?: 'ml' | 'en';
}): Promise<{ ok: boolean; user: SafeUser; token?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function apiLogin(data: {
  email: string;
  password: string;
}): Promise<{ ok: boolean; user: SafeUser; token?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function apiLogout(): Promise<{ ok: boolean; message: string }> {
  setApiAccessToken(null);
  lastMeCache = null;
  lastSubscriptionCache = null;
  inFlightMePromise = null;
  inFlightSubscriptionPromise = null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return await handleResponse(res);
  } catch (err) {
    return { ok: true, message: 'Logged out locally.' };
  }
}

export async function apiGetMe(options?: {
  force?: boolean;
  signal?: AbortSignal;
  trigger?: string;
}): Promise<SafeUser | null> {
  const token = currentAccessToken;
  if (!token) return null;

  // 1. Return short-lived cache if identical token fetched within last 3 seconds and not forced
  if (
    !options?.force &&
    lastMeCache &&
    lastMeCache.token === token &&
    Date.now() - lastMeCache.time < 3000
  ) {
    return lastMeCache.user;
  }

  // 2. Return in-flight request to prevent duplicate parallel fetches
  if (inFlightMePromise) {
    return inFlightMePromise;
  }

  // 3. Stop retries during unauthorized 401/403 cooldown
  if (Date.now() < unauthorizedCooldownUntil) {
    logSanitizedDiagnostic({
      url: '/api/auth/me',
      status: 401,
      trigger: `${options?.trigger || 'apiGetMe'}:cooldown`,
    });
    return null;
  }

  inFlightMePromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
        signal: options?.signal,
      });

      logSanitizedDiagnostic({
        url: '/api/auth/me',
        status: res.status,
        trigger: options?.trigger || 'apiGetMe',
      });

      if (res.status === 401 || res.status === 403 || res.status === 404) {
        if (res.status === 401 || res.status === 403) {
          unauthorizedCooldownUntil = Date.now() + 5000;
        }
        lastMeCache = null;
        return null;
      }

      const data = await handleResponse<{ ok: boolean; user: SafeUser }>(res);
      const user = data.user || null;
      lastMeCache = { token, user, time: Date.now() };
      return user;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return null;
      }
      if (
        err instanceof ApiClientError &&
        (err.statusCode === 401 || err.statusCode === 403 || err.statusCode === 404)
      ) {
        lastMeCache = null;
        return null;
      }
      throw err;
    } finally {
      inFlightMePromise = null;
    }
  })();

  return inFlightMePromise;
}

export async function apiSyncProfile(data: {
  fullName?: string;
  familyName?: string;
  dateOfBirth?: string;
  preferredLang?: 'ml' | 'en';
}): Promise<{ ok: boolean; user: SafeUser }> {
  const res = await fetch(`${API_BASE}/api/auth/sync-profile`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export interface UserProfileSettingsClient {
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

export interface NotificationPreferencesClient {
  reminder60Days: boolean;
  reminder30Days: boolean;
  reminder7Days: boolean;
  reminderExpired: boolean;
  weeklyDigest: boolean;
}

export interface SecurityPreferencesClient {
  sessionTimeoutDays: number;
  inactivityLockEnabled: boolean;
}

export interface UserSettingsResponseClient {
  ok: boolean;
  profile: UserProfileSettingsClient;
  notificationPreferences: NotificationPreferencesClient;
  securityPreferences: SecurityPreferencesClient;
  updatedAt?: string;
}

export async function apiGetSettings(): Promise<UserSettingsResponseClient> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function apiUpdateProfileSettings(data: {
  fullName?: string;
  householdName?: string;
  familyName?: string;
  dateOfBirth?: string;
  preferredLang?: 'ml' | 'en';
}): Promise<{ ok: boolean; profile: UserProfileSettingsClient }> {
  const res = await fetch(`${API_BASE}/api/settings/profile`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const result = await handleResponse<{ ok: boolean; profile: UserProfileSettingsClient }>(res);
  invalidateUserCache();
  return result;
}

export async function apiUpdateNotificationSettings(
  prefs: Partial<NotificationPreferencesClient>
): Promise<{ ok: boolean; notificationPreferences: NotificationPreferencesClient }> {
  const res = await fetch(`${API_BASE}/api/settings/notifications`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(prefs),
  });
  return handleResponse(res);
}

export async function apiUpdateSecuritySettings(
  sec: Partial<SecurityPreferencesClient>
): Promise<{ ok: boolean; securityPreferences: SecurityPreferencesClient }> {
  const res = await fetch(`${API_BASE}/api/settings/security`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(sec),
  });
  return handleResponse(res);
}

export async function apiResendVerification(email: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ email }),
  });
  return handleResponse(res);
}

export async function apiForgotPassword(email: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ email }),
  });
  return handleResponse(res);
}

export async function apiVerifyRecoveryDob(dateOfBirth: string): Promise<{
  ok: boolean;
  message: string;
  resetAuthorizationToken: string;
  expiresIn: number;
}> {
  const res = await fetch(`${API_BASE}/api/auth/verify-recovery-dob`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ dateOfBirth }),
  });
  return handleResponse(res);
}

export async function apiResetPassword(data: {
  resetAuthorizationToken: string;
  newPassword: string;
  confirmPassword?: string;
}): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// ----------------------------------------------------
// Document Management Endpoints
// ----------------------------------------------------

export async function apiGetDocuments(filter?: {
  category?: string;
  status?: string;
}): Promise<any[]> {
  const params = new URLSearchParams();
  if (filter?.category && filter.category !== 'ALL') {
    params.set('category', filter.category);
  }
  if (filter?.status) {
    params.set('status', filter.status);
  }

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/documents${queryStr}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await handleResponse<{ ok: boolean; count: number; documents: any[] }>(res);
  return data.documents || [];
}


export async function apiUploadDocument(
  file: File | Blob,
  fileName: string,
  metadata: {
    title: string;
    category: string;
    docNumber?: string;
    expiryDate?: string;
    issuedAt?: string;
    notes?: string;
    titleMl?: string;
    categoryMl?: string;
    ownerNameEn?: string;
    ownerNameMl?: string;
    memberId?: string;
    authorityEn?: string;
    authorityMl?: string;
    renewalHistory?: any[];
  }
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('title', metadata.title);
  formData.append('category', metadata.category);
  if (metadata.docNumber) formData.append('docNumber', metadata.docNumber);
  if (metadata.expiryDate) formData.append('expiryDate', metadata.expiryDate);
  if (metadata.issuedAt) formData.append('issuedAt', metadata.issuedAt);
  if (metadata.notes) formData.append('notes', metadata.notes);
  if (metadata.titleMl) formData.append('titleMl', metadata.titleMl);
  if (metadata.categoryMl) formData.append('categoryMl', metadata.categoryMl);
  if (metadata.ownerNameEn) formData.append('ownerNameEn', metadata.ownerNameEn);
  if (metadata.ownerNameMl) formData.append('ownerNameMl', metadata.ownerNameMl);
  if (metadata.memberId) formData.append('memberId', metadata.memberId);
  if (metadata.authorityEn) formData.append('authorityEn', metadata.authorityEn);
  if (metadata.authorityMl) formData.append('authorityMl', metadata.authorityMl);
  if (metadata.renewalHistory) {
    formData.append('renewalHistory', JSON.stringify(metadata.renewalHistory));
  }

  const res = await fetch(`${API_BASE}/api/documents/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: formData,
  });

  const data = await handleResponse<{ ok: boolean; document: any; storageStats?: StorageUsageStats }>(res);
  if (data.storageStats && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kudumba:storage-updated', { detail: data.storageStats }));
  }
  return data.document;
}

export async function apiGetDocument(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/documents/${id}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await handleResponse<{ ok: boolean; document: any }>(res);
  return data.document;
}

export async function apiGetDownloadUrl(
  id: string
): Promise<{ downloadUrl: string; expiresIn: number; fileName: string; mimeType: string }> {
  const res = await fetch(`${API_BASE}/api/documents/${id}/download`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function apiUpdateDocument(
  id: string,
  updates: {
    title?: string;
    category?: string;
    docNumber?: string;
    expiryDate?: string | null;
    issuedAt?: string | null;
    notes?: string;
    titleMl?: string;
    categoryMl?: string;
    ownerNameEn?: string;
    ownerNameMl?: string;
    memberId?: string;
    authorityEn?: string;
    authorityMl?: string;
    renewalHistory?: any[];
  }
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/documents/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  const data = await handleResponse<{ ok: boolean; document: any }>(res);
  return data.document;
}

export async function apiDeleteDocument(id: string): Promise<{ success: boolean; storageStats?: StorageUsageStats }> {
  const res = await fetch(`${API_BASE}/api/documents/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await handleResponse<{ ok: boolean; success: boolean; storageStats?: StorageUsageStats }>(res);
  if (data.storageStats && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kudumba:storage-updated', { detail: data.storageStats }));
  }
  return data;
}

export async function apiGetExpiringDocuments(days = 60): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/documents/expiring?days=${days}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await handleResponse<{ ok: boolean; count: number; documents: any[] }>(res);
  return data.documents || [];
}

export interface StorageUsageStats {
  usedBytes: number;
  quotaBytes: number;
  percentageUsed: number;
  documentCount: number;
  planName: string;
  quotaGiB: number;
  usedGiB: number;
  categoryBreakdown: Record<string, { count: number; bytes: number }>;
}

export async function apiGetStorageUsage(): Promise<StorageUsageStats | null> {
  try {
    const res = await fetch(`${API_BASE}/api/documents/storage-usage`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      return null;
    }
    const data = await handleResponse<{ ok: boolean; stats: StorageUsageStats }>(res);
    return data.stats || null;
  } catch (err) {
    console.warn('[ApiClient] Failed to fetch storage usage:', err);
    return null;
  }
}



// ----------------------------------------------------
// Household Member Endpoints
// ----------------------------------------------------

export async function apiGetMembers(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/members`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await handleResponse<{ ok: boolean; count: number; members: any[] }>(res);
  return data.members || [];
}

export async function apiCreateMember(memberData: any): Promise<any> {
  const res = await fetch(`${API_BASE}/api/members`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(memberData),
  });
  const data = await handleResponse<{ ok: boolean; member: any }>(res);
  return data.member;
}

export async function apiUpdateMember(id: string, updates: any): Promise<any> {
  const res = await fetch(`${API_BASE}/api/members/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  const data = await handleResponse<{ ok: boolean; member: any }>(res);
  return data.member;
}

export async function apiDeleteMember(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/members/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

// ----------------------------------------------------
// Member Profile & Sectional Editing Endpoints
// ----------------------------------------------------

export async function apiGetProfile(memberId?: string): Promise<any> {
  const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : '';
  const res = await fetch(`${API_BASE}/api/profile${query}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await handleResponse<{ ok: boolean; profile: any }>(res);
  return data.profile;
}

export async function apiUpdateProfileOverview(payload: {
  memberId: string;
  householdName?: string;
  relationEn?: string;
  relationMl?: string;
  residencyStatus?: string;
  vaultId?: string;
}): Promise<{ ok: boolean; profile: any; member: any }> {
  const res = await fetch(`${API_BASE}/api/profile/overview`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<{ ok: boolean; profile: any; member: any }>(res);
}

export async function apiUpdateProfilePersonalDetails(payload: {
  memberId: string;
  location?: string;
  email?: string;
  whatsapp?: string;
  homePhone?: string;
}): Promise<{ ok: boolean; profile: any; member: any }> {
  const res = await fetch(`${API_BASE}/api/profile/personal-details`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<{ ok: boolean; profile: any; member: any }>(res);
}

// ----------------------------------------------------
// Service Worker Directory Endpoints
// ----------------------------------------------------

export async function apiGetWorkers(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/workers`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await handleResponse<{ ok: boolean; count: number; workers: any[] }>(res);
  return data.workers || [];
}

export async function apiCreateWorker(workerData: any): Promise<any> {
  const res = await fetch(`${API_BASE}/api/workers`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(workerData),
  });
  const data = await handleResponse<{ ok: boolean; worker: any }>(res);
  return data.worker;
}

export async function apiUpdateWorker(id: string, updates: any): Promise<any> {
  const res = await fetch(`${API_BASE}/api/workers/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  const data = await handleResponse<{ ok: boolean; worker: any }>(res);
  return data.worker;
}

export async function apiDeleteWorker(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/workers/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

// ----------------------------------------------------
// Share Pack Endpoints
// ----------------------------------------------------

export async function apiGetSharePacks(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/share-packs`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await handleResponse<{ ok: boolean; count: number; sharePacks: any[] }>(res);
  return data.sharePacks || [];
}

export async function apiCreateSharePack(packData: any): Promise<any> {
  const res = await fetch(`${API_BASE}/api/share-packs`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(packData),
  });
  const data = await handleResponse<{ ok: boolean; sharePack: any }>(res);
  return data.sharePack;
}

export async function apiDeleteSharePack(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/share-packs/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

// ----------------------------------------------------
// Subscription & Free Trial Endpoints
// ----------------------------------------------------

export interface EntitlementStatusClient {
  subscriptionId?: string;
  planId: string;
  planName: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired' | 'pending_payment';
  isActiveOrTrialing: boolean;
  isTrialing: boolean;
  trialStart?: string;
  trialEnd?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  cancellationMode?: 'END_OF_PERIOD' | 'IMMEDIATE';
  cancellationReason?: string;
  cancelledAt?: string;
  cancellationRequestedAt?: string;
  gracePeriodEnd?: string;
  retentionStatus?: 'active' | 'trial_active' | 'in_grace_period' | 'grace_expired' | 'scheduled_for_deletion' | 'retained_paid';
  inGracePeriod?: boolean;
  gracePeriodExpired?: boolean;
  hoursRemainingInGrace?: number;
  daysRemainingInTrial: number;
  hoursRemainingInTrial?: number;
  trialExpired: boolean;
  trialConsumed?: boolean;
  canUpload: boolean;
  canDownloadOrView: boolean;
  storageQuotaBytes: number;
  usedBytes: number;
  availableBytes: number;
  maxFileSizeBytes: number;
  maxFamilyMembers?: number;
  maxDocuments?: number;
  currentDocumentCount?: number;
  featuresEn?: string[];
  featuresMl?: string[];
  priceInr?: number;
  cadence?: 'FREE' | 'MONTHLY' | 'ANNUAL';
  isSimulatedDev: boolean;
}

export async function apiCheckTrialEligibility(email: string): Promise<{ hasUsedTrial: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/trial-eligibility?email=${encodeURIComponent(email)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse<{ hasUsedTrial: boolean; message?: string }>(res);
}

export async function apiGetSubscriptionStatus(options?: {
  force?: boolean;
  signal?: AbortSignal;
  trigger?: string;
}): Promise<EntitlementStatusClient> {
  const token = currentAccessToken;

  // 1. Return short-lived cache if within last 3 seconds and not forced
  if (
    !options?.force &&
    lastSubscriptionCache &&
    lastSubscriptionCache.token === token &&
    Date.now() - lastSubscriptionCache.time < 3000
  ) {
    return lastSubscriptionCache.entitlement;
  }

  // 2. Deduplicate in-flight fetch
  if (inFlightSubscriptionPromise) {
    return inFlightSubscriptionPromise;
  }

  // 3. Stop retries during unauthorized cooldown
  if (Date.now() < unauthorizedCooldownUntil) {
    logSanitizedDiagnostic({
      url: '/api/subscription/status',
      status: 401,
      trigger: `${options?.trigger || 'subscription'}:cooldown`,
    });
    if (lastSubscriptionCache?.entitlement) {
      return lastSubscriptionCache.entitlement;
    }
    throw new ApiClientError('Unauthorized request throttled during cooldown.', 401);
  }

  inFlightSubscriptionPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/subscription/status`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
        signal: options?.signal,
      });

      logSanitizedDiagnostic({
        url: '/api/subscription/status',
        status: res.status,
        trigger: options?.trigger || 'apiGetSubscriptionStatus',
      });

      if (res.status === 401 || res.status === 403) {
        unauthorizedCooldownUntil = Date.now() + 5000;
        lastSubscriptionCache = null;
      }

      const data = await handleResponse<{ ok: boolean; entitlement: EntitlementStatusClient }>(res);
      lastSubscriptionCache = { token, entitlement: data.entitlement, time: Date.now() };
      return data.entitlement;
    } finally {
      inFlightSubscriptionPromise = null;
    }
  })();

  return inFlightSubscriptionPromise;
}

export async function apiSimulateSubscriptionDev(
  action: 'START_TRIAL' | 'EXPIRE_TRIAL' | 'SIMULATE_UPGRADE' | 'CANCEL'
): Promise<EntitlementStatusClient> {
  const res = await fetch(`${API_BASE}/api/subscription/simulate`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ action }),
  });
  const data = await handleResponse<{ ok: boolean; entitlement: EntitlementStatusClient }>(res);
  invalidateSubscriptionCache();
  if (data?.entitlement) {
    updateSubscriptionCache(data.entitlement);
  }
  return data.entitlement;
}

// ----------------------------------------------------
// Manual UPI Payments Client Endpoints
// ----------------------------------------------------

export interface BillingAddressClient {
  fullName: string;
  houseBuilding: string;
  streetLocality: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
}

export interface PlanPriceCalculationClient {
  planId: string;
  planName: string;
  monthlyRate: number;
  duration: 'monthly' | 'quarterly' | 'yearly';
  durationMonths: number;
  baseTotal: number;
  planSavings: number;
  subtotalPayable: number;
  couponCode?: string;
  couponDiscount: number;
  finalPayable: number;
  currency: string;
  featuresEn: string[];
  featuresMl: string[];
}

export interface PaymentRequestClient {
  _id: string;
  id?: string;
  userId: string;
  subscriptionPlanId: string;
  planNameSnapshot: string;
  billingDuration: 'monthly' | 'quarterly' | 'yearly';
  durationMonths: number;
  monthlyRate: number;
  baseTotal: number;
  planSavings: number;
  couponCode?: string;
  couponDiscount: number;
  payableAmount: number;
  currency: string;
  utrNumber?: string;
  paymentDate?: string;
  proofFilePath?: string;
  billingAddressSnapshot: BillingAddressClient;
  remarks?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentPaymentStatusClient {
  ok: boolean;
  hasPendingRequest?: boolean;
  activeRequest: PaymentRequestClient | null;
  savedBillingAddress: BillingAddressClient | null;
  upiConfig: {
    upiId: string;
    merchantName: string;
    whatsappNumber: string;
    instructionsEn: string;
    instructionsMl: string;
  };
  upiUri?: string;
  qrSvg?: string;
  qrDataUrl?: string;
}

export async function apiCalculatePlanPrice(params: {
  planId: string;
  duration: 'monthly' | 'quarterly' | 'yearly';
  couponCode?: string;
}): Promise<{ ok: boolean; pricing: PlanPriceCalculationClient }> {
  const res = await fetch(`${API_BASE}/api/payments/calculate-price`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(params),
  });
  return handleResponse(res);
}

export async function apiGetUpiConfig(): Promise<{ ok: boolean; config: any }> {
  const res = await fetch(`${API_BASE}/api/payments/config`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function apiCreatePaymentRequest(params: {
  planId: string;
  duration: 'monthly' | 'quarterly' | 'yearly';
  billingAddress: BillingAddressClient;
  couponCode?: string;
  saveBillingAddress?: boolean;
}): Promise<{
  ok: boolean;
  request: PaymentRequestClient;
  upiUri: string;
  qrSvg: string;
  qrDataUrl: string;
  upiConfig: { upiId: string; merchantName: string; whatsappNumber: string };
}> {
  const res = await fetch(`${API_BASE}/api/payments/request`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(params),
  });
  return handleResponse(res);
}

export async function apiGetCurrentPaymentStatus(): Promise<CurrentPaymentStatusClient> {
  const res = await fetch(`${API_BASE}/api/payments/current`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function apiSubmitPaymentProof(
  formData: FormData
): Promise<{ ok: boolean; message: string; request: PaymentRequestClient }> {
  const res = await fetch(`${API_BASE}/api/payments/submit-proof`, {
    method: 'POST',
    headers: getAuthHeaders(), // Let browser set multipart boundary
    credentials: 'include',
    body: formData,
  });
  return handleResponse(res);
}

export async function apiCancelPaymentRequest(
  requestId: string
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/payments/cancel`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ requestId }),
  });
  return handleResponse(res);
}

// ----------------------------------------------------------------------------
// Billing & Invoicing Client Types and Methods
// ----------------------------------------------------------------------------

export interface BillingOverviewClient {
  ok: boolean;
  subscription: {
    planId: string;
    planName: string;
    status: string;
    priceInr: number;
    cadence: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    trialStart?: string;
    trialEnd?: string;
    cancelAtPeriodEnd: boolean;
    cancelledAt?: string;
  };
  entitlements: EntitlementStatusClient;
  currentPlan: {
    id: string;
    nameEn: string;
    nameMl: string;
    storageQuotaBytes: number;
    maxFamilyMembers: number;
    maxFileSizeMb: number;
  };
  unifiedStatus:
    | 'FREE'
    | 'ACTIVE'
    | 'PENDING PAYMENT'
    | 'CANCELLATION SCHEDULED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'PAYMENT REJECTED';
  statusBadge: {
    labelEn: string;
    labelMl: string;
    type: 'success' | 'warning' | 'error' | 'neutral' | 'info';
  };
  latestApprovedPayment: {
    id: string;
    paymentRequestId?: string;
    amount: number;
    currency: string;
    utrNumber: string;
    paymentDate: string;
    paymentChannel: string;
    verificationStatus: 'APPROVED';
    approvedAt: string;
    approvedByEmail?: string;
  } | null;
  activeRequest: {
    id: string;
    subscriptionPlanId: string;
    planNameSnapshot: string;
    payableAmount: number;
    utrNumber?: string;
    paymentDate?: string;
    status: 'PENDING' | 'REJECTED';
    rejectionReason?: string;
    billingDuration: string;
  } | null;
  billingCycle: string;
  expiryOrRenewalDate: string | null;
  cancellation: {
    isScheduled: boolean;
    cancelAtPeriodEnd: boolean;
    cancelledAt?: string;
    effectiveUntil?: string;
    daysRemaining?: number;
  };
  notice: {
    isMaintenance: boolean;
    messageEn: string;
    messageMl: string;
    supportEmail: string;
    whatsappNumber: string;
  } | null;
}

export interface BillingHistoryItemClient {
  id: string;
  invoiceNumber: string;
  date: string;
  description: string;
  planId: string;
  planName: string;
  billingDuration: string;
  durationMonths: number;
  amount: number;
  currency: string;
  status: 'PAID' | 'PENDING' | 'REJECTED' | 'CANCELLED';
  utrNumber?: string;
  hasReceipt: boolean;
  receiptId?: string;
  rejectionReason?: string;
  approvedAt?: string;
}

export interface BillingHistoryResponseClient {
  ok: boolean;
  records: BillingHistoryItemClient[];
  total: number;
  page: number;
  totalPages: number;
}

export interface BillingReceiptClient {
  receiptNumber: string;
  receiptDate: string;
  customerName: string;
  householdName: string;
  customerEmail: string;
  billingAddress: {
    fullName?: string;
    houseBuilding?: string;
    streetLocality?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    phone?: string;
  } | null;
  planId: string;
  planName: string;
  billingDuration: string;
  durationMonths: number;
  amountPaid: number;
  currency: string;
  utrNumber: string;
  paymentMethod: string;
  status: 'PAID';
  verifiedBy: string;
  verifiedAt: string;
  disclaimer: string;
}

export async function apiGetBillingOverview(): Promise<BillingOverviewClient> {
  const res = await fetch(`${API_BASE}/api/billing/overview`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function apiGetBillingHistory(page = 1, limit = 10): Promise<BillingHistoryResponseClient> {
  const res = await fetch(`${API_BASE}/api/billing/history?page=${page}&limit=${limit}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function apiGetBillingReceipt(paymentId: string): Promise<{ ok: boolean; receipt: BillingReceiptClient }> {
  const res = await fetch(`${API_BASE}/api/billing/receipts/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function apiCancelBillingSubscription(params?: {
  cancelAtPeriodEnd?: boolean;
  reason?: string;
}): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/billing/cancel`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(params || {}),
  });
  return handleResponse(res);
}
