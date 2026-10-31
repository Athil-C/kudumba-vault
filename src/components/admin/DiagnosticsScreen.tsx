import React from 'react';
import { Activity, Cpu, HardDrive, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface DiagnosticsScreenProps {
  data: any;
  loading: boolean;
}

export const DiagnosticsScreen: React.FC<DiagnosticsScreenProps> = ({ data, loading }) => {
  const live = data?.live || {};
  const history = data?.history || [];
  const bottlenecks = data?.bottlenecks || [];
  const infrastructure = data?.infrastructure || {};

  const memoryLimit = live.memory?.verifiedRenderFreeLimitBytes || 512 * 1024 * 1024;
  const memoryRss = live.memory?.rssBytes || 0;
  const memoryHeapUsed = live.memory?.heapUsedBytes || 0;
  const memoryPercent = Math.min(100, Math.round((memoryRss / memoryLimit) * 100));

  return (
    <div className="space-y-6">
      {/* Top Resource Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Node CPU */}
        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5B6168]">Node.js Process CPU</span>
            <Cpu className="h-4 w-4 text-[#E03A45]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#0B0B0C]">{live.cpu?.processPercent || 0}%</span>
            <span className="text-xs text-[#5B6168]">Process load</span>
          </div>
          <div className="w-full bg-[#F4F5F7] h-2 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (live.cpu?.processPercent || 0) >= 80 ? 'bg-[#E03A45]' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, live.cpu?.processPercent || 0)}%` }}
            />
          </div>
          <p className="text-[11px] text-[#5B6168] mt-2">
            Host CPU: <span className="italic text-gray-500">Unavailable on Render Free</span>
          </p>
        </div>

        {/* Process Memory */}
        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5B6168]">Process Memory (RSS / Heap)</span>
            <HardDrive className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#0B0B0C]">
              {Math.round(memoryRss / (1024 * 1024))} MiB
            </span>
            <span className="text-xs text-[#5B6168]">/ 512 MiB limit ({memoryPercent}%)</span>
          </div>
          <div className="w-full bg-[#F4F5F7] h-2 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                memoryPercent >= 80 ? 'bg-[#E03A45]' : 'bg-blue-500'
              }`}
              style={{ width: `${memoryPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-[#5B6168] mt-2">
            V8 Heap Used: {Math.round(memoryHeapUsed / (1024 * 1024))} MiB
          </p>
        </div>

        {/* API Response Latency */}
        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5B6168]">API Latency & Throughput</span>
            <Activity className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#0B0B0C]">{live.api?.avgLatencyMs || 0} ms</span>
            <span className="text-xs text-[#5B6168]">Average Latency</span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#5B6168] mt-3 pt-2 border-t border-[#E6E8EC]">
            <span>p50: {live.api?.p50LatencyMs || 0} ms</span>
            <span>p95: {live.api?.p95LatencyMs || 0} ms</span>
            <span>p99: {live.api?.p99LatencyMs || 0} ms</span>
          </div>
          <p className="text-[11px] text-[#5B6168] mt-1">
            Throughput: {live.api?.requestsPerMinute || 0} req/min
          </p>
        </div>
      </div>

      {/* Slow Endpoints Table */}
      <div className="bg-white rounded-xl border border-[#E6E8EC] shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E6E8EC] flex items-center justify-between">
          <h4 className="text-sm font-bold text-[#0B0B0C]">Top Measured API Endpoints</h4>
          <span className="text-xs text-[#5B6168]">Ranked by response latency</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E6E8EC] bg-[#FAFAFA] text-[#5B6168] font-semibold">
                <th className="py-2.5 px-4">Route Template</th>
                <th className="py-2.5 px-4">Requests</th>
                <th className="py-2.5 px-4">Avg Latency</th>
                <th className="py-2.5 px-4">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E8EC]">
              {(!live.api?.slowEndpoints || live.api.slowEndpoints.length === 0) ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[#5B6168]">
                    No endpoint latency samples collected in the current sliding window.
                  </td>
                </tr>
              ) : (
                live.api.slowEndpoints.map((ep: any, i: number) => (
                  <tr key={i} className="hover:bg-[#F9FAFB]">
                    <td className="py-2.5 px-4 font-mono font-medium text-[#0B0B0C]">{ep.route}</td>
                    <td className="py-2.5 px-4 text-[#5B6168]">{ep.count}</td>
                    <td className="py-2.5 px-4 font-bold text-[#0B0B0C]">{ep.avgLatencyMs} ms</td>
                    <td className="py-2.5 px-4">
                      {ep.errors > 0 ? (
                        <span className="text-red-600 font-bold">{ep.errors}</span>
                      ) : (
                        <span className="text-emerald-600">0</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Telemetry Samples */}
      <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-[#0B0B0C]">Historical Telemetry (Last 24 Hours)</h4>
          <span className="text-xs text-[#5B6168]">{history.length} persisted metric samples</span>
        </div>

        {history.length === 0 ? (
          <div className="py-8 text-center text-[#5B6168] text-xs">
            No historical metric samples persisted yet. Sampling occurs periodically via background telemetry worker.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E6E8EC] bg-[#FAFAFA] text-[#5B6168] font-semibold">
                  <th className="py-2 px-3">Timestamp</th>
                  <th className="py-2 px-3">CPU</th>
                  <th className="py-2 px-3">Memory (RSS)</th>
                  <th className="py-2 px-3">API Latency</th>
                  <th className="py-2 px-3">Mongo Ping</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E8EC]">
                {history.slice(-10).map((sample: any, idx: number) => (
                  <tr key={sample._id || idx}>
                    <td className="py-2 px-3 text-[#5B6168]">
                      {new Date(sample.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3 font-semibold text-[#0B0B0C]">{sample.cpu?.processPercent}%</td>
                    <td className="py-2 px-3 text-[#5B6168]">
                      {Math.round((sample.memory?.rssBytes || 0) / (1024 * 1024))} MiB
                    </td>
                    <td className="py-2 px-3 text-[#5B6168]">{sample.api?.avgLatencyMs || 0} ms</td>
                    <td className="py-2 px-3 text-[#5B6168]">{sample.database?.mongoPingMs || 0} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
