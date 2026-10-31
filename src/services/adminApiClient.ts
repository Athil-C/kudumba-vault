import { API_BASE as CLIENT_API_BASE, getApiAccessToken, invalidateSubscriptionCache } from './apiClient';

const API_BASE = `${CLIENT_API_BASE}/api/admin`;

async function adminFetch(endpoint: string, options: RequestInit = {}) {
  const token = getApiAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Admin API Error (${res.status})`);
  }

  return data;
}

export async function apiGetAdminOverview() {
  return adminFetch('/overview');
}

export async function apiGetAdminUsers(params: { page?: number; limit?: number; search?: string; status?: string; role?: string } = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  if (params.status) q.set('status', params.status);
  if (params.role) q.set('role', params.role);
  return adminFetch(`/users?${q.toString()}`);
}

export async function apiUpdateUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', reason?: string) {
  return adminFetch(`/users/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, reason }),
  });
}

export async function apiDeleteUserAndData(id: string) {
  return adminFetch(`/users/${id}`, {
    method: 'DELETE',
  });
}

export async function apiReconcileUser(supabaseUserId?: string, email?: string) {
  return adminFetch('/users/reconcile', {
    method: 'POST',
    body: JSON.stringify({ supabaseUserId, email }),
  });
}

export async function apiReconcileAllUsers() {
  return adminFetch('/users/reconcile-all', {
    method: 'POST',
  });
}

export async function apiGetAdminFamilies(params: { page?: number; limit?: number; search?: string } = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  return adminFetch(`/families?${q.toString()}`);
}

export async function apiGetAdminPlans() {
  return adminFetch('/plans');
}

export async function apiGetAdminSubscriptions(params: { page?: number; limit?: number; status?: string } = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.status) q.set('status', params.status);
  return adminFetch(`/subscriptions?${q.toString()}`);
}

export async function apiGetAdminBilling(params: { page?: number; limit?: number } = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  return adminFetch(`/billing?${q.toString()}`);
}

export async function apiGetAdminDocuments(params: { page?: number; limit?: number; category?: string; search?: string } = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.category) q.set('category', params.category);
  if (params.search) q.set('search', params.search);
  return adminFetch(`/documents?${q.toString()}`);
}

export async function apiGetAdminStorage() {
  return adminFetch('/storage');
}

export async function apiGetAdminDiagnostics() {
  return adminFetch('/system-diagnostics');
}

export async function apiGetAdminDatabaseMonitoring() {
  return adminFetch('/database-monitoring');
}

export async function apiGetAdminSecurity(params: { page?: number; limit?: number; status?: string } = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.status) q.set('status', params.status);
  return adminFetch(`/security?${q.toString()}`);
}

export async function apiAcknowledgeAlert(id: string) {
  return adminFetch(`/security/alerts/${id}/acknowledge`, { method: 'POST' });
}

export async function apiResolveAlert(id: string, notes?: string) {
  return adminFetch(`/security/alerts/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export async function apiGetAdminAuditLogs(params: { page?: number; limit?: number; category?: string } = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.category) q.set('category', params.category);
  return adminFetch(`/audit-logs?${q.toString()}`);
}

export async function apiGetAdminServerHealth() {
  return adminFetch('/server-health');
}

export async function apiGetAdminSettings() {
  return adminFetch('/settings');
}

export async function apiUpdateAdminSettings(settings: any) {
  return adminFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ----------------------------------------------------
// Manual UPI Payments Admin Endpoints
// ----------------------------------------------------

export async function apiGetAdminPaymentRequests(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminFetch(`/payments${q}`);
}

export async function apiApprovePaymentRequest(id: string) {
  const result = await adminFetch(`/payments/${id}/approve`, {
    method: 'POST',
  });
  invalidateSubscriptionCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kudumba:subscription-updated'));
  }
  return result;
}

export async function apiRejectPaymentRequest(id: string, reason: string) {
  return adminFetch(`/payments/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function apiAdminCancelSubscription(
  subscriptionOrPaymentId: string,
  payload: { mode: 'END_OF_PERIOD' | 'IMMEDIATE'; reason?: string; isPaymentId?: boolean }
) {
  invalidateSubscriptionCache();
  const endpoint = payload.isPaymentId
    ? `/payments/${encodeURIComponent(subscriptionOrPaymentId)}/cancel-subscription`
    : `/subscriptions/${encodeURIComponent(subscriptionOrPaymentId)}/cancel`;

  return adminFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      mode: payload.mode,
      reason: payload.reason,
    }),
  });
}

export async function apiGetAdminUpiSettings() {
  return adminFetch('/upi-settings');
}

export async function apiUpdateAdminUpiSettings(settings: any) {
  return adminFetch('/upi-settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

/**
 * Fetches the authenticated payment proof screenshot binary Blob.
 * Uses the active admin access token via Authorization header.
 * Strictly never exposes auth tokens in query parameters or URLs.
 */
export async function apiGetAdminPaymentProofBlob(requestId: string): Promise<Blob> {
  const token = getApiAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(requestId)}/proof`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => null);
    const errorMsg =
      errorJson?.error ||
      (res.status === 404
        ? 'Screenshot file not found on storage server.'
        : res.status === 401 || res.status === 403
        ? 'Authentication required to view payment proof.'
        : `Failed to load payment proof (${res.status})`);
    const err = new Error(errorMsg);
    (err as any).status = res.status;
    throw err;
  }

  return res.blob();
}
