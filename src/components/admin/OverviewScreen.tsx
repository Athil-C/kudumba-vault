import React from 'react';
import {
  Users,
  Home,
  Files,
  CreditCard,
  HardDrive,
  ShieldAlert,
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface OverviewScreenProps {
  data: any;
  loading: boolean;
  onNavigateTab: (tab: any) => void;
}

export const OverviewScreen: React.FC<OverviewScreenProps> = ({ data, loading, onNavigateTab }) => {
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <Activity className="h-8 w-8 text-[#E03A45] animate-spin mb-3" />
        <p className="text-sm font-medium text-[#5B6168]">Loading verified system metrics...</p>
      </div>
    );
  }

  const {
    users = { total: 0, active: 0, suspended: 0 },
    families = { total: 0 },
    documents = { total: 0 },
    subscriptions = { activeCount: 0, verifiedGrossRevenueInr: 0, failedPaymentsInr: 0 },
    systemHealth = {
      mongoConnected: false,
      mongoPingMs: 0,
      supabaseConnected: false,
      supabasePingMs: 0,
      processCpuPercent: 0,
      memoryRssBytes: 0,
      memoryLimitBytes: 512 * 1024 * 1024,
      criticalAlertsCount: 0,
    },
    recentAlerts = [],
    recentAuditLogs = [],
  } = data || {};

  const memoryPercent = Math.min(
    100,
    Math.round(((systemHealth.memoryRssBytes || 0) / (systemHealth.memoryLimitBytes || 512 * 1024 * 1024)) * 100)
  );

  return (
    <div className="space-y-6">
      {/* Top Banner Health Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* MongoDB Status */}
        <div className="bg-white p-4 rounded-xl border border-[#E6E8EC] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#5B6168] uppercase tracking-wider">MongoDB Atlas</span>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`h-2.5 w-2.5 rounded-full ${systemHealth.mongoConnected ? 'bg-emerald-500' : 'bg-red-500'}`}
              />
              <span className="text-sm font-bold text-[#0B0B0C]">
                {systemHealth.mongoConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p className="text-[11px] text-[#5B6168] mt-0.5">
              Ping: {systemHealth.mongoPingMs} ms (Atlas M0 Free)
            </p>
          </div>
          <Server className="h-6 w-6 text-[#5B6168]/50" />
        </div>

        {/* Supabase Storage Status */}
        <div className="bg-white p-4 rounded-xl border border-[#E6E8EC] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#5B6168] uppercase tracking-wider">Supabase Storage</span>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`h-2.5 w-2.5 rounded-full ${systemHealth.supabaseConnected ? 'bg-emerald-500' : 'bg-red-500'}`}
              />
              <span className="text-sm font-bold text-[#0B0B0C]">
                {systemHealth.supabaseConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p className="text-[11px] text-[#5B6168] mt-0.5">
              Ping: {systemHealth.supabasePingMs} ms (Private Bucket)
            </p>
          </div>
          <HardDrive className="h-6 w-6 text-[#5B6168]/50" />
        </div>

        {/* Process CPU */}
        <div className="bg-white p-4 rounded-xl border border-[#E6E8EC] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#5B6168] uppercase tracking-wider">Node.js Process CPU</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-[#0B0B0C]">{systemHealth.processCpuPercent}%</span>
              {systemHealth.processCpuPercent >= 80 && (
                <span className="text-[10px] font-bold text-[#E03A45] bg-red-50 px-1.5 py-0.5 rounded">High</span>
              )}
            </div>
            <p className="text-[11px] text-[#5B6168] mt-0.5">Process measurement</p>
          </div>
          <Activity className="h-6 w-6 text-[#5B6168]/50" />
        </div>

        {/* Memory Pressure */}
        <div className="bg-white p-4 rounded-xl border border-[#E6E8EC] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#5B6168] uppercase tracking-wider">Process Memory (RSS)</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-[#0B0B0C]">
                {Math.round((systemHealth.memoryRssBytes || 0) / (1024 * 1024))} MiB
              </span>
              <span className="text-[11px] font-medium text-[#5B6168]">({memoryPercent}% of 512 MiB)</span>
            </div>
            <p className="text-[11px] text-[#5B6168] mt-0.5">Render Free container</p>
          </div>
          <HardDrive className="h-6 w-6 text-[#5B6168]/50" />
        </div>
      </div>

      {/* Core Counts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Registered Users */}
        <div
          onClick={() => onNavigateTab('users')}
          className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs hover:border-[#E03A45]/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5B6168]">Total Registered Users</span>
            <div className="p-2 bg-[#FFF5F5] rounded-lg text-[#E03A45]">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#0B0B0C] mt-2">{users.total}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-[#5B6168]">
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="h-3 w-3" /> {users.active} Active
            </span>
            {users.suspended > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <XCircle className="h-3 w-3" /> {users.suspended} Suspended
              </span>
            )}
          </div>
        </div>

        {/* Total Families */}
        <div
          onClick={() => onNavigateTab('families')}
          className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs hover:border-[#E03A45]/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5B6168]">Total Verified Families</span>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Home className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#0B0B0C] mt-2">{families.total}</p>
          <p className="text-xs text-[#5B6168] mt-2">Active household groups</p>
        </div>

        {/* Total Documents */}
        <div
          onClick={() => onNavigateTab('documents')}
          className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs hover:border-[#E03A45]/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5B6168]">Stored Documents</span>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <Files className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#0B0B0C] mt-2">{documents.total}</p>
          <p className="text-xs text-[#5B6168] mt-2">Active metadata records</p>
        </div>

        {/* Active Subscriptions */}
        <div
          onClick={() => onNavigateTab('plans')}
          className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs hover:border-[#E03A45]/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5B6168]">Subscriptions</span>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#0B0B0C] mt-2">{subscriptions.activeCount}</p>
          <p className="text-xs text-[#5B6168] mt-2">
            Verified Collections: ₹{subscriptions.verifiedGrossRevenueInr}
          </p>
        </div>
      </div>

      {/* Bottom Section: Recent Critical Alerts & Recent Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Security Alerts */}
        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#E03A45]" />
              <h3 className="text-sm font-bold text-[#0B0B0C]">Active Alerts & Bottlenecks</h3>
            </div>
            <button
              onClick={() => onNavigateTab('security')}
              className="text-xs text-[#E03A45] hover:underline font-semibold cursor-pointer"
            >
              View All
            </button>
          </div>

          {recentAlerts.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs font-medium text-[#5B6168]">No active alerts or performance bottlenecks detected.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAlerts.map((alert: any) => (
                <div
                  key={alert._id}
                  className="p-3 rounded-lg border border-[#E6E8EC] bg-[#FAFAFA] flex items-start justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <p className="text-xs font-bold text-[#0B0B0C]">{alert.title}</p>
                    </div>
                    <p className="text-xs text-[#5B6168] mt-1">{alert.message}</p>
                  </div>
                  <span className="text-[10px] text-[#5B6168] whitespace-nowrap ml-2">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Audit Logs */}
        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#5B6168]" />
              <h3 className="text-sm font-bold text-[#0B0B0C]">Recent Admin Activity</h3>
            </div>
            <button
              onClick={() => onNavigateTab('audit-logs')}
              className="text-xs text-[#E03A45] hover:underline font-semibold cursor-pointer"
            >
              View All
            </button>
          </div>

          {recentAuditLogs.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs font-medium text-[#5B6168]">No administrative actions recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E6E8EC]">
              {recentAuditLogs.map((log: any) => (
                <div key={log._id} className="py-2.5 flex items-center justify-between">
                  <div className="truncate pr-3">
                    <p className="text-xs font-bold text-[#0B0B0C]">{log.action}</p>
                    <p className="text-[11px] text-[#5B6168] truncate">
                      By {log.adminEmail} • Category: {log.category}
                    </p>
                  </div>
                  <span className="text-[10px] text-[#5B6168] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
