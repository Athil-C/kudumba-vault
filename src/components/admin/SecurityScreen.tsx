import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, Clock, AlertTriangle, Check } from 'lucide-react';
import { apiAcknowledgeAlert, apiResolveAlert } from '../../services/adminApiClient';

interface SecurityScreenProps {
  data: any;
  loading: boolean;
  onRefresh: () => void;
}

export const SecurityScreen: React.FC<SecurityScreenProps> = ({ data, loading, onRefresh }) => {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const rawAlerts = data?.alerts;
  const alerts = Array.isArray(rawAlerts) ? rawAlerts : [];
  const unresolvedCritical = data?.unresolvedCritical || 0;

  const handleAcknowledge = async (id: string) => {
    try {
      await apiAcknowledgeAlert(id);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async (id: string) => {
    const notes = window.prompt('Resolution notes (optional):');
    try {
      setResolvingId(id);
      await apiResolveAlert(id, notes || 'Resolved by Super Admin');
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Security Status Header */}
      <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#FFF5F5] text-[#E03A45] rounded-xl">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#0B0B0C]">Security Incident Monitoring</h3>
            <p className="text-xs text-[#5B6168] mt-0.5">
              Automated detection of failed auth, unauthorized access, and resource degradation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {unresolvedCritical > 0 ? (
            <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-600 animate-ping" />
              {unresolvedCritical} Critical Alerts
            </span>
          ) : (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Security Posture Healthy
            </span>
          )}
        </div>
      </div>

      {/* Alerts List */}
      <div className="bg-white rounded-xl border border-[#E6E8EC] shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E6E8EC] flex items-center justify-between">
          <h4 className="text-sm font-bold text-[#0B0B0C]">Logged Security Events & Alerts</h4>
          <span className="text-xs text-[#5B6168]">Real application audit logs</span>
        </div>

        <div className="divide-y divide-[#E6E8EC]">
          {alerts.length === 0 ? (
            <div className="py-12 text-center text-[#5B6168] text-xs">
              No security events or alerts recorded in the database.
            </div>
          ) : (
            alerts.map((alert: any) => (
              <div key={alert._id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-red-100 text-red-800'
                          : alert.severity === 'WARNING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-xs font-bold text-[#0B0B0C]">{alert.title}</span>
                    <span className="text-[10px] text-[#5B6168] bg-[#F4F5F7] px-1.5 py-0.5 rounded">
                      {alert.category}
                    </span>
                  </div>
                  <p className="text-xs text-[#5B6168]">{alert.message}</p>
                  {alert.recommendedAction && (
                    <p className="text-[11px] text-[#E03A45] font-medium">
                      Action: {alert.recommendedAction}
                    </p>
                  )}
                  <p className="text-[10px] text-[#5B6168]">
                    Recorded: {new Date(alert.timestamp).toLocaleString()}
                    {alert.status !== 'ACTIVE' && ` • Status: ${alert.status}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {alert.status === 'ACTIVE' && (
                    <>
                      <button
                        onClick={() => handleAcknowledge(alert._id)}
                        className="px-2.5 py-1 text-xs border border-[#E6E8EC] rounded-lg hover:bg-[#F4F5F7] font-semibold text-[#0B0B0C] cursor-pointer"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => handleResolve(alert._id)}
                        disabled={resolvingId === alert._id}
                        className="px-2.5 py-1 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold cursor-pointer"
                      >
                        Resolve
                      </button>
                    </>
                  )}
                  {alert.status === 'ACKNOWLEDGED' && (
                    <button
                      onClick={() => handleResolve(alert._id)}
                      disabled={resolvingId === alert._id}
                      className="px-2.5 py-1 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold cursor-pointer"
                    >
                      Resolve
                    </button>
                  )}
                  {alert.status === 'RESOLVED' && (
                    <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Resolved
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
