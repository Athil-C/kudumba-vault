import React from 'react';
import {
  LayoutDashboard,
  Users,
  Home,
  CreditCard,
  Receipt,
  QrCode,
  Files,
  HardDrive,
  Activity,
  Database,
  ShieldAlert,
  History,
  Server,
  Settings,
  ArrowLeft,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type AdminTab =
  | 'overview'
  | 'users'
  | 'families'
  | 'plans'
  | 'payments'
  | 'billing'
  | 'documents'
  | 'storage'
  | 'diagnostics'
  | 'database'
  | 'security'
  | 'audit-logs'
  | 'server-health'
  | 'settings';

interface SuperAdminLayoutProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onBackToApp: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  children: React.ReactNode;
}

const navItems: { tab: AdminTab; label: string; icon: React.ElementType }[] = [
  { tab: 'overview', label: 'Overview', icon: LayoutDashboard },
  { tab: 'users', label: 'Users', icon: Users },
  { tab: 'families', label: 'Families', icon: Home },
  { tab: 'plans', label: 'Plans & Subs', icon: CreditCard },
  { tab: 'payments', label: 'UPI Payments', icon: QrCode },
  { tab: 'billing', label: 'Billing & Finance', icon: Receipt },
  { tab: 'documents', label: 'Documents', icon: Files },
  { tab: 'storage', label: 'Storage', icon: HardDrive },
  { tab: 'diagnostics', label: 'System Diagnostics', icon: Activity },
  { tab: 'database', label: 'Database Monitoring', icon: Database },
  { tab: 'security', label: 'Security Centre', icon: ShieldAlert },
  { tab: 'audit-logs', label: 'Audit Logs', icon: History },
  { tab: 'server-health', label: 'Server & Integrations', icon: Server },
  { tab: 'settings', label: 'Settings', icon: Settings },
];

export const SuperAdminLayout: React.FC<SuperAdminLayoutProps> = ({
  activeTab,
  onSelectTab,
  onBackToApp,
  onRefresh,
  isRefreshing = false,
  children,
}) => {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-[#0B0B0C] font-sans antialiased overflow-hidden">
      {/* Super Admin Coral-Red Sidebar */}
      <aside className="w-64 bg-[#E03A45] flex flex-col justify-between text-white shrink-0 shadow-lg z-20">
        <div>
          {/* Brand header */}
          <div className="p-5 border-b border-white/15 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-white text-base shadow-xs">
                  KV
                </div>
                <div>
                  <h1 className="font-extrabold text-base tracking-tight leading-none text-white">
                    Kudumba Vault
                  </h1>
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-white/80 bg-white/10 px-1.5 py-0.5 rounded mt-1 inline-block">
                    Super Admin
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-210px)]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  onClick={() => onSelectTab(item.tab)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-[#E03A45] font-bold shadow-xs'
                      : 'text-white/90 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#E03A45]' : 'text-white/80'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/15 bg-black/10">
          <div className="flex items-center justify-between mb-3">
            <div className="truncate pr-2">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Administrator'}</p>
              <p className="text-[11px] text-white/70 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => logout()}
              title="Sign Out"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={onBackToApp}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Vault</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#FFFFFF]">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-[#E6E8EC] bg-white flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-[#0B0B0C] capitalize">
              {navItems.find((n) => n.tab === activeTab)?.label || 'Overview'}
            </h2>
            <span className="text-[11px] font-medium text-[#5B6168] bg-[#F4F5F7] px-2 py-0.5 rounded-full border border-[#E6E8EC]">
              Production Telemetry
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E6E8EC] hover:bg-[#F4F5F7] text-xs font-semibold text-[#0B0B0C] transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#E03A45]' : 'text-[#5B6168]'}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
            </button>
          </div>
        </header>

        {/* Scrollable View Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#FAFAFA]">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
};
