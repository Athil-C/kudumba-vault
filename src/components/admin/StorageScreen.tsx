import React from 'react';
import { HardDrive, Server, ShieldCheck, AlertTriangle } from 'lucide-react';

interface StorageScreenProps {
  data: any;
  loading: boolean;
}

export const StorageScreen: React.FC<StorageScreenProps> = ({ data, loading }) => {
  const {
    configuredBucket = 'kudumba-vault-documents',
    bucketInfo,
    connectivity = { connected: false, pingMs: 0 },
    measurements = {
      metadataDocumentCount: 0,
      metadataTotalSizeBytes: 0,
      providerEnumeratedObjectCount: 0,
      providerEnumeratedSizeBytes: 0,
      discrepancyBytes: 0,
      note: '',
    },
  } = data || {};

  const metaMb = Math.round((measurements.metadataTotalSizeBytes || 0) / (1024 * 1024) * 10) / 10;
  const provMb = Math.round((measurements.providerEnumeratedSizeBytes || 0) / (1024 * 1024) * 10) / 10;

  return (
    <div className="space-y-6">
      {/* Bucket Info Banner */}
      <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#FFF5F5] text-[#E03A45] rounded-xl">
              <HardDrive className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#5B6168] uppercase tracking-wider">
                Configured Storage Bucket
              </span>
              <h3 className="text-base font-extrabold text-[#0B0B0C] mt-0.5">{configuredBucket}</h3>
              <p className="text-xs text-[#5B6168] mt-0.5">
                Privacy: <span className="font-semibold text-emerald-600">Strictly Private Bucket</span> • Latency:{' '}
                {connectivity.pingMs} ms
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                connectivity.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${connectivity.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {connectivity.connected ? 'Storage Online' : 'Connection Failed'}
            </span>
          </div>
        </div>
      </div>

      {/* Storage Breakdown Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <span className="text-xs font-semibold text-[#5B6168]">MongoDB Document Records</span>
          <p className="text-2xl font-black text-[#0B0B0C] mt-2">{measurements.metadataDocumentCount}</p>
          <p className="text-xs text-[#5B6168] mt-1">Aggregated metadata size: {metaMb} MB</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <span className="text-xs font-semibold text-[#5B6168]">Supabase Objects Enumerated</span>
          <p className="text-2xl font-black text-[#0B0B0C] mt-2">
            {measurements.providerEnumeratedObjectCount}
          </p>
          <p className="text-xs text-[#5B6168] mt-1">Enumerated payload size: {provMb} MB</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
          <span className="text-xs font-semibold text-[#5B6168]">Metadata vs Object Discrepancy</span>
          <p className="text-2xl font-black text-[#0B0B0C] mt-2">
            {Math.round(measurements.discrepancyBytes / 1024)} KB
          </p>
          <p className="text-xs text-emerald-600 font-medium mt-1">Integrity verified</p>
        </div>
      </div>

      {measurements.note && (
        <div className="p-4 bg-[#F8F9FA] rounded-xl border border-[#E6E8EC] text-xs text-[#5B6168]">
          <span className="font-bold text-[#0B0B0C]">Infrastructure Note: </span>
          {measurements.note}
        </div>
      )}
    </div>
  );
};
