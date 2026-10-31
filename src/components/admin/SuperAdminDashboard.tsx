import React, { useState, useEffect, useCallback } from 'react';
import { SuperAdminLayout, AdminTab } from './SuperAdminLayout';
import { OverviewScreen } from './OverviewScreen';
import { UsersScreen } from './UsersScreen';
import { FamiliesScreen } from './FamiliesScreen';
import { PlansScreen } from './PlansScreen';
import { PaymentsScreen } from './PaymentsScreen';
import { BillingScreen } from './BillingScreen';
import { DocumentsScreen } from './DocumentsScreen';
import { StorageScreen } from './StorageScreen';
import { DiagnosticsScreen } from './DiagnosticsScreen';
import { DatabaseScreen } from './DatabaseScreen';
import { SecurityScreen } from './SecurityScreen';
import { AuditLogsScreen } from './AuditLogsScreen';
import { ServerHealthScreen } from './ServerHealthScreen';
import { SettingsScreen } from './SettingsScreen';
import {
  apiGetAdminOverview,
  apiGetAdminUsers,
  apiGetAdminFamilies,
  apiGetAdminPlans,
  apiGetAdminSubscriptions,
  apiGetAdminBilling,
  apiGetAdminDocuments,
  apiGetAdminStorage,
  apiGetAdminDiagnostics,
  apiGetAdminDatabaseMonitoring,
  apiGetAdminSecurity,
  apiGetAdminAuditLogs,
  apiGetAdminServerHealth,
  apiGetAdminSettings,
} from '../../services/adminApiClient';
import { ShieldAlert, ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SuperAdminDashboardProps {
  onBackToApp: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onBackToApp }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    // Read route or hash if provided
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/super-admin/')) {
        const sub = path.replace('/super-admin/', '') as AdminTab;
        return sub || 'overview';
      }
    }
    return 'overview';
  });

  const [tabData, setTabData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync browser URL cleanly without page reload
  const handleSelectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/super-admin/${tab}`);
    }
  };

  const fetchTabData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let res: any = null;

      switch (activeTab) {
        case 'overview':
          res = await apiGetAdminOverview();
          break;
        case 'users':
          res = await apiGetAdminUsers();
          break;
        case 'families':
          res = await apiGetAdminFamilies();
          break;
        case 'plans': {
          const [plansRes, subsRes] = await Promise.all([
            apiGetAdminPlans(),
            apiGetAdminSubscriptions(),
          ]);
          res = {
            data: {
              plans: plansRes?.data?.plans || [],
              subscriptions: subsRes?.data?.subscriptions || [],
              statusBreakdown: subsRes?.data?.statusBreakdown || {},
            },
          };
          break;
        }
        case 'billing':
          res = await apiGetAdminBilling();
          break;
        case 'documents':
          res = await apiGetAdminDocuments();
          break;
        case 'storage':
          res = await apiGetAdminStorage();
          break;
        case 'diagnostics':
          res = await apiGetAdminDiagnostics();
          break;
        case 'database':
          res = await apiGetAdminDatabaseMonitoring();
          break;
        case 'security':
          res = await apiGetAdminSecurity();
          break;
        case 'audit-logs':
          res = await apiGetAdminAuditLogs();
          break;
        case 'server-health':
          res = await apiGetAdminServerHealth();
          break;
        case 'settings':
          res = await apiGetAdminSettings();
          break;
        default:
          res = await apiGetAdminOverview();
      }

      setTabData(res?.data || null);
    } catch (err: any) {
      console.error('[Admin] Fetch tab error:', err);
      setError(err.message || 'Failed to fetch admin telemetry');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchTabData();
  }, [fetchTabData]);

  // Authorization Guard: Require authenticated user with ADMIN role
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 bg-red-100 text-red-700 rounded-2xl mb-4">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h1 className="text-xl font-extrabold text-[#0B0B0C]">Super Admin Access Required</h1>
        <p className="text-xs text-[#5B6168] mt-2 max-w-md">
          {!user ? (
            'You are not currently logged in. Please sign in to Kudumba Vault with an administrator account to unlock this panel.'
          ) : (
            `Your account (${user.email}) has role "${user.role || 'USER'}". An administrator role is required.`
          )}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <button
            onClick={onBackToApp}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#E03A45] hover:bg-[#C42F3A] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Go to Kudumba Vault Sign In</span>
          </button>

          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#E6E8EC] hover:bg-[#F4F5F7] text-[#0B0B0C] text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[#5B6168]" />
            <span>Re-check Session</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <SuperAdminLayout
      activeTab={activeTab}
      onSelectTab={handleSelectTab}
      onBackToApp={onBackToApp}
      onRefresh={fetchTabData}
      isRefreshing={loading}
    >
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={fetchTabData}
            className="font-bold underline cursor-pointer ml-4 shrink-0"
          >
            Retry Check
          </button>
        </div>
      )}

      {activeTab === 'overview' && (
        <OverviewScreen data={tabData} loading={loading} onNavigateTab={handleSelectTab} />
      )}
      {activeTab === 'users' && (
        <UsersScreen data={tabData} loading={loading} onRefresh={fetchTabData} />
      )}
      {activeTab === 'families' && (
        <FamiliesScreen data={tabData} loading={loading} />
      )}
      {activeTab === 'plans' && (
        <PlansScreen data={tabData} loading={loading} />
      )}
      {activeTab === 'payments' && (
        <PaymentsScreen />
      )}
      {activeTab === 'billing' && (
        <BillingScreen data={tabData} loading={loading} />
      )}
      {activeTab === 'documents' && (
        <DocumentsScreen data={tabData} loading={loading} />
      )}
      {activeTab === 'storage' && (
        <StorageScreen data={tabData} loading={loading} />
      )}
      {activeTab === 'diagnostics' && (
        <DiagnosticsScreen data={tabData} loading={loading} />
      )}
      {activeTab === 'database' && (
        <DatabaseScreen data={tabData} loading={loading} />
      )}
      {activeTab === 'security' && (
        <SecurityScreen data={tabData} loading={loading} onRefresh={fetchTabData} />
      )}
      {activeTab === 'audit-logs' && (
        <AuditLogsScreen data={tabData} loading={loading} />
      )}
      {activeTab === 'server-health' && (
        <ServerHealthScreen data={tabData} loading={loading} />
      )}
      {activeTab === 'settings' && (
        <SettingsScreen data={tabData} loading={loading} onRefresh={fetchTabData} />
      )}
    </SuperAdminLayout>
  );
};
