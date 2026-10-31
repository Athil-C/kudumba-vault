import React from 'react';
import { Server, CheckCircle2, XCircle, Mail, Database, HardDrive, CreditCard } from 'lucide-react';

interface ServerHealthScreenProps {
  data: any;
  loading: boolean;
}

export const ServerHealthScreen: React.FC<ServerHealthScreenProps> = ({ data, loading }) => {
  const { server = {}, integrations = {} } = data || {};

  const integrationList = [
    {
      name: 'MongoDB Atlas',
      type: 'Primary Database',
      status: integrations.mongodbAtlas?.status || 'UNKNOWN',
      detail: `${integrations.mongodbAtlas?.pingMs || 0} ms ping`,
      icon: Database,
    },
    {
      name: 'Supabase Storage',
      type: 'Object Storage',
      status: integrations.supabaseStorage?.status || 'UNKNOWN',
      detail: `${integrations.supabaseStorage?.pingMs || 0} ms ping`,
      icon: HardDrive,
    },
    {
      name: 'Gmail SMTP Service',
      type: 'Notification Mailer',
      status: integrations.gmailSmtp?.status || 'NOT_CONFIGURED',
      detail: integrations.gmailSmtp?.user ? `Configured as ${integrations.gmailSmtp.user}` : 'No credentials',
      icon: Mail,
    },
    {
      name: 'Payment Processing',
      type: 'Financial Gateway',
      status: integrations.paymentGateway?.status || 'NOT_CONFIGURED',
      detail: integrations.paymentGateway?.provider || 'V1 Founding Free Tier',
      icon: CreditCard,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Node Backend Status */}
      <div className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#0B0B0C]">Node.js / Express Backend</h3>
              <p className="text-xs text-[#5B6168] mt-0.5">
                Runtime: Node {server.nodeVersion} • Platform: {server.platform} ({server.architecture})
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {server.status || 'HEALTHY'}
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-[#E6E8EC] grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-[#5B6168]">Service Uptime:</span>
            <p className="font-bold text-[#0B0B0C] mt-0.5">
              {Math.floor((server.uptimeSeconds || 0) / 3600)}h {Math.floor(((server.uptimeSeconds || 0) % 3600) / 60)}m
            </p>
          </div>
          <div>
            <span className="text-[#5B6168]">Telemetry Timestamp:</span>
            <p className="font-bold text-[#0B0B0C] mt-0.5">
              {server.timestamp ? new Date(server.timestamp).toLocaleTimeString() : 'Live'}
            </p>
          </div>
          <div>
            <span className="text-[#5B6168]">Hosting Topology:</span>
            <p className="font-bold text-[#0B0B0C] mt-0.5">Render Free Tier Container</p>
          </div>
        </div>
      </div>

      {/* Connected Integrations Grid */}
      <div>
        <h4 className="text-sm font-bold text-[#0B0B0C] mb-3">Downstream Infrastructure Integrations</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrationList.map((item, idx) => {
            const Icon = item.icon;
            const isHealthy = item.status === 'HEALTHY' || item.status === 'CONFIGURED';
            return (
              <div key={idx} className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-[#F8F9FA] text-[#0B0B0C] border border-[#E6E8EC]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h5 className="font-bold text-sm text-[#0B0B0C]">{item.name}</h5>
                      <span className="text-[11px] text-[#5B6168]">{item.type}</span>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isHealthy
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'NOT_CONFIGURED'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {isHealthy ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {item.status}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-[#FAFAFA] border border-[#E6E8EC] text-xs text-[#5B6168]">
                  {item.detail}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
