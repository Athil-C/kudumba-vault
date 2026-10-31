import React, { useState, useEffect } from 'react';
import { X, CloudUpload, Download, CheckCircle, AlertCircle, Loader2, Database } from 'lucide-react';
import { Button } from '../ui/DesignSystem';
import {
  inspectLocalVaultData,
  exportLocalVaultBackup,
  migrateUserDocumentsToCloud,
  LocalVaultInspection,
  MigrationProgressReport,
} from '../../utils/localStorageMigration';
import { VaultDocumentItem } from '../../types/vault';

export interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMigrationComplete?: () => void;
  lang: 'ml' | 'en';
}

export const MigrationModal: React.FC<MigrationModalProps> = ({
  isOpen,
  onClose,
  onMigrationComplete,
  lang,
}) => {
  const [inspection, setInspection] = useState<LocalVaultInspection | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [report, setReport] = useState<MigrationProgressReport | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInspection(inspectLocalVaultData());
      setReport(null);
      setProgress(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartMigration = async () => {
    if (!inspection || inspection.userDocs.length === 0) return;
    setIsMigrating(true);
    setReport(null);

    try {
      const res = await migrateUserDocumentsToCloud(inspection.userDocs, (p) => {
        setProgress(p);
      });
      setReport(res);
      onMigrationComplete?.();
    } catch (err) {
      console.error('[Migration] Failed:', err);
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-[#E6E8EC]">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isMigrating}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-[#F4F5F7] text-[#5B6168] hover:bg-[#E6E8EC] transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E4F7EC] text-[#0F7B3E] border border-[#B8F0D0]">
            <CloudUpload className="h-6 w-6 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-[#0B0B0C]">
              {lang === 'ml' ? 'ക്ലൗഡ് വോൾട്ടിലേക്ക് മാറ്റുക' : 'Migrate to Cloud Vault'}
            </h2>
            <p className="text-[12px] text-[#5B6168]">
              {lang === 'ml'
                ? 'ലോക്കൽ ബ്രൗസർ രേഖകൾ ക്ലൗഡിലേക്ക് സിങ്ക് ചെയ്യുക'
                : 'Transfer local browser records to your authenticated account'}
            </p>
          </div>
        </div>

        {/* Inspection Stats */}
        {inspection && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#E6E8EC] bg-[#F8F9FA] p-3.5">
                <div className="text-[11px] font-medium text-[#5B6168]">
                  {lang === 'ml' ? 'കസ്റ്റം രേഖകൾ' : 'Custom User Documents'}
                </div>
                <div className="text-[24px] font-bold text-[#0B0B0C]">
                  {inspection.userDocsCount}
                </div>
              </div>
              <div className="rounded-2xl border border-[#E6E8EC] bg-[#F8F9FA] p-3.5">
                <div className="text-[11px] font-medium text-[#5B6168]">
                  {lang === 'ml' ? 'ഡെമോ രേഖകൾ (മാറ്റില്ല)' : 'Demo Samples (Skipped)'}
                </div>
                <div className="text-[24px] font-bold text-[#8C939D]">
                  {inspection.sampleDocsCount}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#F8F9FA] border border-[#E6E8EC] p-4 text-[12.5px] text-[#5B6168] space-y-2">
              <p>
                {lang === 'ml'
                  ? 'നിങ്ങളുടെ ലോക്കൽ രേഖകൾ സ്വകാര്യ സുരക്ഷിത സ്റ്റോറേജിലേക്ക് മാറ്റുന്നതിന് മുൻപ് ബാക്കപ്പ് ഡൗൺലോഡ് ചെയ്യാവുന്നതാണ്.'
                  : 'You can download an offline JSON backup of your local records before uploading to cloud storage.'}
              </p>
              <button
                type="button"
                onClick={exportLocalVaultBackup}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0B0B0C] hover:underline cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{lang === 'ml' ? 'ബാക്കപ്പ് JSON ഡൗൺലോഡ് ചെയ്യുക' : 'Download Local Backup (JSON)'}</span>
              </button>
            </div>

            {/* Migration Progress Bar */}
            {isMigrating && progress && (
              <div className="rounded-2xl border border-[#E6E8EC] bg-white p-4 space-y-2">
                <div className="flex justify-between text-[12px]">
                  <span className="font-semibold text-[#0B0B0C]">
                    Uploading: {progress.title}
                  </span>
                  <span className="text-[#8C939D]">
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#E6E8EC] overflow-hidden">
                  <div
                    className="h-full bg-[#0F7B3E] transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Completion Report */}
            {report && (
              <div className="rounded-2xl border border-[#B8F0D0] bg-[#E4F7EC] p-4 text-[13px] text-[#0F7B3E] space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle className="h-4 w-4" />
                  <span>
                    {lang === 'ml'
                      ? `വിജയകരമായി മാറ്റി: ${report.migrated} / ${report.total}`
                      : `Successfully migrated ${report.migrated} of ${report.total} documents`}
                  </span>
                </div>
                {report.failed > 0 && (
                  <p className="text-[12px] text-[#E03A45]">
                    {report.failed} documents could not be migrated. Please verify file formats.
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isMigrating}
                className="flex-1"
              >
                {report ? (lang === 'ml' ? 'പൂർത്തിയായി' : 'Close') : (lang === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel')}
              </Button>

              {!report && (
                <Button
                  onClick={handleStartMigration}
                  disabled={isMigrating || inspection.userDocsCount === 0}
                  className="flex-1 bg-[#0F7B3E] hover:bg-[#0C6332] text-white"
                >
                  {isMigrating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>{lang === 'ml' ? 'സിങ്ക് ചെയ്യുക' : 'Start Migration'}</span>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
