import React, { useState } from 'react';
import { History, Filter, Search } from 'lucide-react';

interface AuditLogsScreenProps {
  data: any;
  loading: boolean;
}

export const AuditLogsScreen: React.FC<AuditLogsScreenProps> = ({ data, loading }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const rawLogs = data?.logs;
  const logs = Array.isArray(rawLogs) ? rawLogs : [];
  const pagination = data?.pagination || { total: logs.length, page: 1, totalPages: 1 };

  const filteredLogs = logs.filter((log: any) => {
    if (!selectedCategory) return true;
    return log.category === selectedCategory;
  });

  return (
    <div className="space-y-4">
      {/* Category Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#E6E8EC]">
        <div className="flex flex-wrap gap-1.5">
          {['', 'AUTH', 'USER_MANAGEMENT', 'FAMILY_MANAGEMENT', 'SETTINGS', 'SECURITY', 'DOCUMENT'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#E03A45] text-white shadow-xs'
                  : 'bg-[#F8F9FA] text-[#5B6168] hover:bg-[#F4F5F7]'
              }`}
            >
              {cat === '' ? 'All Logs' : cat}
            </button>
          ))}
        </div>

        <span className="text-xs text-[#5B6168]">
          Total Logged Actions: <span className="font-bold text-[#0B0B0C]">{pagination.total}</span>
        </span>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-[#E6E8EC] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E6E8EC] bg-[#FAFAFA] text-[#5B6168] font-semibold">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Admin Email</th>
                <th className="py-3 px-4">Target</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E8EC]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#5B6168]">
                    No administrative audit logs found for this filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log: any) => (
                  <tr key={log._id} className="hover:bg-[#F9FAFB]">
                    <td className="py-3 px-4 text-[#5B6168] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-bold text-[#0B0B0C]">{log.action}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F4F5F7] text-[#0B0B0C] border border-[#E6E8EC]">
                        {log.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#5B6168]">{log.adminEmail}</td>
                    <td className="py-3 px-4 text-[#5B6168]">
                      {log.targetType ? `${log.targetType} (${log.targetId?.slice(-6)})` : 'Global'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          log.severity === 'CRITICAL'
                            ? 'bg-red-100 text-red-700'
                            : log.severity === 'WARNING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          log.outcome === 'SUCCESS' ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
                        }`}
                      >
                        {log.outcome}
                      </span>
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
