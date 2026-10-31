import React from 'react';
import { Receipt, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

interface BillingScreenProps {
  data: any;
  loading: boolean;
}

export const BillingScreen: React.FC<BillingScreenProps> = ({ data, loading }) => {
  const summary = data?.summary || {
    grossCollectionsInr: 0,
    netCollectionsInr: 0,
    totalGatewayFeesInr: 0,
    totalTaxesInr: 0,
    totalRefundsInr: 0,
    totalSuccessCount: 0,
    totalFailedCount: 0,
    totalRefundedCount: 0,
    gatewayIntegration: { status: 'NOT_CONFIGURED' },
  };

  const transactions = data?.transactions || [];

  return (
    <div className="space-y-6">
      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <span className="text-xs font-semibold text-[#5B6168]">Verified Collections (Gross)</span>
          <p className="text-2xl font-black text-[#0B0B0C] mt-2">₹{summary.grossCollectionsInr}</p>
          <p className="text-xs text-emerald-600 font-medium mt-1">
            {summary.totalSuccessCount} verified payments
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <span className="text-xs font-semibold text-[#5B6168]">Net Processed Revenue</span>
          <p className="text-2xl font-black text-[#0B0B0C] mt-2">₹{summary.netCollectionsInr}</p>
          <p className="text-xs text-[#5B6168] mt-1">Excl. gateway fee & GST</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <span className="text-xs font-semibold text-[#5B6168]">Confirmed Refunds</span>
          <p className="text-2xl font-black text-[#0B0B0C] mt-2">₹{summary.totalRefundsInr}</p>
          <p className="text-xs text-[#5B6168] mt-1">{summary.totalRefundedCount} refunded orders</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <span className="text-xs font-semibold text-[#5B6168]">Payment Gateway Status</span>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                summary.gatewayIntegration.status === 'CONFIGURED' ? 'bg-emerald-500' : 'bg-gray-400'
              }`}
            />
            <span className="text-sm font-bold text-[#0B0B0C]">
              {summary.gatewayIntegration.status === 'CONFIGURED' ? 'Live Webhooks Active' : 'Not Configured'}
            </span>
          </div>
          <p className="text-xs text-[#5B6168] mt-1">
            {summary.gatewayIntegration.status === 'CONFIGURED' ? 'Active Gateway' : 'Manual / Offline Billing'}
          </p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-[#E6E8EC] shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E6E8EC] flex items-center justify-between">
          <h4 className="text-sm font-bold text-[#0B0B0C]">Verified Gateway Transactions</h4>
          <span className="text-xs text-[#5B6168]">Real database ledger</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E6E8EC] bg-[#FAFAFA] text-[#5B6168] font-semibold">
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Gross Amount</th>
                <th className="py-3 px-4">Net Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Gateway</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E8EC]">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#5B6168]">
                    No transactions recorded yet. (Kudumba Vault V1 is currently free for all founding households).
                  </td>
                </tr>
              ) : (
                transactions.map((tx: any) => (
                  <tr key={tx._id} className="hover:bg-[#F9FAFB]">
                    <td className="py-3 px-4 font-mono font-bold text-[#0B0B0C]">
                      {tx.transactionReference}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0B0B0C]">{tx.userId?.name || 'Customer'}</div>
                      <div className="text-[11px] text-[#5B6168]">{tx.userId?.email}</div>
                    </td>
                    <td className="py-3 px-4 font-bold text-[#0B0B0C]">₹{tx.amountInr}</td>
                    <td className="py-3 px-4 text-[#5B6168]">₹{tx.netAmountInr}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          tx.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-700'
                            : tx.status === 'REFUNDED'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#5B6168]">{tx.paymentGateway}</td>
                    <td className="py-3 px-4 text-[#5B6168]">
                      {new Date(tx.createdAt).toLocaleDateString()}
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
