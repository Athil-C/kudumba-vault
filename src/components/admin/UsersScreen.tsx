import React, { useState } from 'react';
import { Search, UserCheck, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { apiUpdateUserStatus, apiDeleteUserAndData, apiReconcileUser, apiReconcileAllUsers } from '../../services/adminApiClient';

interface UsersScreenProps {
  data: any;
  loading: boolean;
  onRefresh: () => void;
}

export const UsersScreen: React.FC<UsersScreenProps> = ({ data, loading, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const rawUsers = data?.users;
  const users = Array.isArray(rawUsers) ? rawUsers : [];
  const pagination = data?.pagination || { total: users.length, page: 1, totalPages: 1 };

  const handleToggleStatus = async (user: any) => {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmMsg = `Are you sure you want to change status for ${user.email} to ${nextStatus}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoading(user._id);
      setErrorMessage(null);
      setSuccessMessage(null);
      await apiUpdateUserStatus(user._id, nextStatus, 'Admin panel action');
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update user status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (user: any) => {
    const confirmMsg = `WARNING: Are you sure you want to permanently delete user "${user.name}" (${user.email})?\n\nThis will permanently delete:\n• The user account from the database\n• All uploaded documents and physical storage files\n• All family members, workers, and share packs\n• All subscriptions and history\n\nThis action CANNOT be undone. Proceed?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoading(user._id);
      setErrorMessage(null);
      setSuccessMessage(null);
      await apiDeleteUserAndData(user._id);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete user and user data');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconcileUser = async (user: any) => {
    try {
      setActionLoading(user._id);
      setErrorMessage(null);
      setSuccessMessage(null);
      const res = await apiReconcileUser(user.supabaseUserId, user.email);
      setSuccessMessage(res.message || `Successfully provisioned MongoDB profile for ${user.email}`);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reconcile user profile');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconcileAll = async () => {
    try {
      setActionLoading('all');
      setErrorMessage(null);
      setSuccessMessage(null);
      const res = await apiReconcileAllUsers();
      setSuccessMessage(res.message || 'Bulk reconciliation completed successfully.');
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reconcile all accounts');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter((u: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      u.name?.toLowerCase().includes(term) ||
      u.fullName?.toLowerCase().includes(term) ||
      u.email?.toLowerCase().includes(term)
    );
  });

  const unprovisionedCount = users.filter((u: any) => u.isUnprovisioned || u.status === 'UNPROVISIONED').length;

  return (
    <div className="space-y-4">
      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#E6E8EC]">
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5B6168]" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8F9FA] border border-[#E6E8EC] rounded-lg focus:outline-none focus:border-[#E03A45]"
          />
        </div>
        <div className="text-xs text-[#5B6168] self-end sm:self-center">
          Showing <span className="font-bold text-[#0B0B0C]">{filteredUsers.length}</span> of {pagination.total} users
        </div>
      </div>

      {unprovisionedCount > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>{unprovisionedCount} unprovisioned Supabase account(s)</strong> detected missing a MongoDB profile.
            </span>
          </div>
          <button
            onClick={handleReconcileAll}
            disabled={actionLoading === 'all'}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${actionLoading === 'all' ? 'animate-spin' : ''}`} />
            <span>{actionLoading === 'all' ? 'Reconciling All...' : 'Reconcile All Profiles'}</span>
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-[#E6E8EC] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E6E8EC] bg-[#FAFAFA] text-[#5B6168] font-semibold">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Family Members</th>
                <th className="py-3 px-4">Documents</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4">Registered</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E8EC]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#5B6168]">
                    No registered user records found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u: any) => (
                  <tr key={u._id} className="hover:bg-[#F9FAFB] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#0B0B0C]">{u.name}</div>
                      <div className="text-[11px] text-[#5B6168]">{u.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : u.status === 'UNPROVISIONED' || u.isUnprovisioned
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? (
                          <CheckCircle2 className="h-2.5 w-2.5" />
                        ) : u.status === 'UNPROVISIONED' || u.isUnprovisioned ? (
                          <AlertTriangle className="h-2.5 w-2.5" />
                        ) : (
                          <XCircle className="h-2.5 w-2.5" />
                        )}
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#0B0B0C]">{u.familyMemberCount || 0}</td>
                    <td className="py-3 px-4 font-semibold text-[#0B0B0C]">{u.documentCount || 0}</td>
                    <td className="py-3 px-4 text-[#5B6168]">
                      {u.lastActivityAt ? new Date(u.lastActivityAt).toLocaleDateString() : 'None'}
                    </td>
                    <td className="py-3 px-4 text-[#5B6168]">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {u.isUnprovisioned || u.status === 'UNPROVISIONED' ? (
                          <button
                            onClick={() => handleReconcileUser(u)}
                            disabled={actionLoading === u._id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold text-blue-700 hover:bg-blue-50 border border-blue-200 cursor-pointer transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3 w-3 ${actionLoading === u._id ? 'animate-spin' : ''}`} />
                            <span>{actionLoading === u._id ? 'Reconciling...' : 'Reconcile Profile'}</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleToggleStatus(u)}
                              disabled={actionLoading === u._id}
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                                u.status === 'ACTIVE'
                                  ? 'text-amber-700 hover:bg-amber-50 border border-amber-200'
                                  : 'text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
                              }`}
                            >
                              {actionLoading === u._id
                                ? 'Updating...'
                                : u.status === 'ACTIVE'
                                ? 'Suspend'
                                : 'Restore'}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={actionLoading === u._id}
                              title="Delete user and all data from database"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold text-red-700 hover:bg-red-50 border border-red-200 cursor-pointer transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
