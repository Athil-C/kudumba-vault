import React, { useState } from 'react';
import { Settings, Save, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { apiUpdateAdminSettings } from '../../services/adminApiClient';

interface SettingsScreenProps {
  data: any;
  loading: boolean;
  onRefresh: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ data, loading, onRefresh }) => {
  const currentSettings = data?.settings || {};

  const [cpuWarning, setCpuWarning] = useState<number>(
    currentSettings.alertThresholds?.cpuWarningPercent ?? 80
  );
  const [memoryCriticalMb, setMemoryCriticalMb] = useState<number>(
    Math.round((currentSettings.alertThresholds?.memoryCriticalBytes ?? 480 * 1024 * 1024) / (1024 * 1024))
  );
  const [emailAlerts, setEmailAlerts] = useState<boolean>(
    currentSettings.notifications?.enableEmailAlerts ?? true
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await apiUpdateAdminSettings({
        alertThresholds: {
          ...currentSettings.alertThresholds,
          cpuWarningPercent: Number(cpuWarning),
          memoryCriticalBytes: Number(memoryCriticalMb) * 1024 * 1024,
        },
        notifications: {
          ...currentSettings.notifications,
          enableEmailAlerts: emailAlerts,
        },
      });
      setSuccess(true);
      onRefresh();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update administrative settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
        <h3 className="text-base font-extrabold text-[#0B0B0C]">Super Admin Configuration</h3>
        <p className="text-xs text-[#5B6168] mt-0.5">
          Fine-tune resource warning thresholds, notifications, and security policies.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Alert Thresholds */}
        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs space-y-4">
          <h4 className="text-sm font-bold text-[#0B0B0C]">Automated Health Thresholds</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B0B0C] mb-1">
                Node CPU Warning Threshold (%)
              </label>
              <input
                type="number"
                min="10"
                max="100"
                value={cpuWarning}
                onChange={(e) => setCpuWarning(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs bg-[#F8F9FA] border border-[#E6E8EC] rounded-lg focus:outline-none focus:border-[#E03A45]"
              />
              <span className="text-[11px] text-[#5B6168]">Triggers system alert if sustained above this level.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B0B0C] mb-1">
                Memory Critical Ceiling (MiB)
              </label>
              <input
                type="number"
                min="100"
                max="512"
                value={memoryCriticalMb}
                onChange={(e) => setMemoryCriticalMb(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs bg-[#F8F9FA] border border-[#E6E8EC] rounded-lg focus:outline-none focus:border-[#E03A45]"
              />
              <span className="text-[11px] text-[#5B6168]">Render Free container limit is 512 MiB.</span>
            </div>
          </div>
        </div>

        {/* Email Alerts */}
        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs space-y-4">
          <h4 className="text-sm font-bold text-[#0B0B0C]">Notification Routing</h4>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="emailAlerts"
              checked={emailAlerts}
              onChange={(e) => setEmailAlerts(e.target.checked)}
              className="h-4 w-4 text-[#E03A45] rounded border-[#E6E8EC] focus:ring-[#E03A45]"
            />
            <label htmlFor="emailAlerts" className="text-xs font-semibold text-[#0B0B0C]">
              Forward critical system failures to configured Admin Gmail addresses
            </label>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>Settings successfully persisted and applied!</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#E03A45] hover:bg-[#C42F3A] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
