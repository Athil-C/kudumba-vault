import React, { useState } from 'react';
import { CreditCard, Check, Clock, ShieldCheck, Filter } from 'lucide-react';

interface PlansScreenProps {
  data: any;
  loading: boolean;
}

export const PlansScreen: React.FC<PlansScreenProps> = ({ data, loading }) => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const plans = data?.plans || [];
  const subscriptions = data?.subscriptions || [];
  const statusBreakdown = data?.statusBreakdown || {
    trialing: 0,
    active: 0,
    expired: 0,
    canceled: 0,
    past_due: 0,
    pending_payment: 0,
  };

  const filteredSubs = subscriptions.filter((s: any) => {
    if (!statusFilter) return true;
    return s.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner: Plan Architectures */}
      <div>
        <h3 className="text-sm font-bold text-[#0B0B0C]">Active Subscription Architecture</h3>
        <p className="text-xs text-[#5B6168] mt-0.5">
          Authoritative plan tiers configured across Kudumba Vault with 7-Day Free Trial.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((p: any) => (
          <div
            key={p.id}
            className={`bg-white rounded-xl border p-5 flex flex-col justify-between shadow-2xs ${
              p.cadence === 'FREE' ? 'border-[#E03A45]' : 'border-[#E6E8EC]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    p.cadence === 'FREE' ? 'bg-[#FFF5F5] text-[#E03A45]' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {p.cadence}
                </span>
                <span className="text-xs text-[#5B6168] font-medium">
                  {p.activeUsers || 0} Registered Accounts
                </span>
              </div>

              <h4 className="text-base font-extrabold text-[#0B0B0C] mt-3">{p.nameEn}</h4>
              <p className="text-xs text-[#5B6168] font-malayalam mt-0.5">{p.nameMl}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#0B0B0C]">₹{p.priceInr}</span>
                <span className="text-xs text-[#5B6168]">
                  {p.cadence === 'FREE' ? '7-Day Free Trial included' : '/ month'}
                </span>
              </div>

              <ul className="mt-5 space-y-2 text-xs text-[#0B0B0C]">
                {p.features?.map((f: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-[#E6E8EC]">
              <span className="text-[11px] text-[#5B6168]">
                {p.cadence === 'FREE' ? 'Primary active tier for all founding families.' : 'Future scheduled tier.'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Subscription Breakdown & Status Table */}
      <div className="bg-white rounded-xl border border-[#E6E8EC] shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E6E8EC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-[#0B0B0C]">Subscriber & Trial Management</h4>
            <p className="text-xs text-[#5B6168] mt-0.5">Authoritative MongoDB subscription records</p>
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: '', label: 'All' },
              { id: 'trialing', label: `Trialing (${statusBreakdown.trialing})` },
              { id: 'active', label: `Active (${statusBreakdown.active})` },
              { id: 'expired', label: `Expired (${statusBreakdown.expired})` },
              { id: 'canceled', label: `Canceled (${statusBreakdown.canceled})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-[#E03A45] text-white shadow-xs'
                    : 'bg-[#F8F9FA] text-[#5B6168] hover:bg-[#F4F5F7]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E6E8EC] bg-[#FAFAFA] text-[#5B6168] font-semibold">
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Trial End / Renewal</th>
                <th className="py-3 px-4">Environment</th>
                <th className="py-3 px-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E8EC]">
              {filteredSubs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#5B6168]">
                    No subscription records found for this filter.
                  </td>
                </tr>
              ) : (
                filteredSubs.map((s: any) => (
                  <tr key={s._id} className="hover:bg-[#F9FAFB]">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#0B0B0C]">{s.userId?.name || 'Customer'}</div>
                      <div className="text-[11px] text-[#5B6168]">{s.userId?.email}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#0B0B0C]">{s.planName || s.planId}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          s.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : s.status === 'trialing'
                            ? 'bg-blue-100 text-blue-700'
                            : s.status === 'expired'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#5B6168]">
                      {s.trialEnd ? new Date(s.trialEnd).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      {s.isSimulatedDev ? (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          DEV SIMULATED
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#5B6168]">Standard</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#5B6168]">
                      {new Date(s.createdAt).toLocaleDateString()}
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
