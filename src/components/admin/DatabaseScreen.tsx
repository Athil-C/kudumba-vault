import React from 'react';
import { Database, HardDrive, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface DatabaseScreenProps {
  data: any;
  loading: boolean;
}

export const DatabaseScreen: React.FC<DatabaseScreenProps> = ({ data, loading }) => {
  const { mongodbAtlas = {}, supabaseStorage = {} } = data || {};

  return (
    <div className="space-y-6">
      {/* MongoDB Atlas Section */}
      <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#0B0B0C]">MongoDB Atlas Cluster</h3>
              <p className="text-xs text-[#5B6168] mt-0.5">{mongodbAtlas.tier}</p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              mongodbAtlas.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${mongodbAtlas.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {mongodbAtlas.connected ? 'Connected' : 'Offline'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
          <div className="p-3 rounded-lg bg-[#F8F9FA] border border-[#E6E8EC]">
            <span className="text-[10px] text-[#5B6168] font-bold uppercase">Ping Duration</span>
            <p className="text-lg font-bold text-[#0B0B0C] mt-1">{mongodbAtlas.pingMs} ms</p>
          </div>
          <div className="p-3 rounded-lg bg-[#F8F9FA] border border-[#E6E8EC]">
            <span className="text-[10px] text-[#5B6168] font-bold uppercase">Active Collections</span>
            <p className="text-lg font-bold text-[#0B0B0C] mt-1">{mongodbAtlas.collectionsCount || 'Available'}</p>
          </div>
          <div className="p-3 rounded-lg bg-[#F8F9FA] border border-[#E6E8EC]">
            <span className="text-[10px] text-[#5B6168] font-bold uppercase">Total Objects</span>
            <p className="text-lg font-bold text-[#0B0B0C] mt-1">{mongodbAtlas.objectsCount || 'Available'}</p>
          </div>
          <div className="p-3 rounded-lg bg-[#F8F9FA] border border-[#E6E8EC]">
            <span className="text-[10px] text-[#5B6168] font-bold uppercase">Allocated Storage</span>
            <p className="text-lg font-bold text-[#0B0B0C] mt-1">
              {mongodbAtlas.storageSize ? `${Math.round(mongodbAtlas.storageSize / (1024 * 1024))} MB` : 'Atlas M0 Free'}
            </p>
          </div>
        </div>

        {mongodbAtlas.providerNote && (
          <p className="text-xs text-[#5B6168] italic border-t border-[#E6E8EC] pt-3">
            Note: {mongodbAtlas.providerNote}
          </p>
        )}
      </div>

      {/* Supabase Storage Section */}
      <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <HardDrive className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#0B0B0C]">Supabase Storage Service</h3>
              <p className="text-xs text-[#5B6168] mt-0.5">Bucket: {supabaseStorage.bucket}</p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              supabaseStorage.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${supabaseStorage.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {supabaseStorage.connected ? 'Storage Active' : 'Unreachable'}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-[#F8F9FA] border border-[#E6E8EC] flex items-center justify-between text-xs">
          <span className="text-[#5B6168]">Storage Endpoint Latency:</span>
          <span className="font-bold text-[#0B0B0C]">{supabaseStorage.pingMs} ms</span>
        </div>
      </div>
    </div>
  );
};
