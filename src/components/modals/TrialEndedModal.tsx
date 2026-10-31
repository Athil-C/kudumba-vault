import React, { useState, useEffect } from 'react';
import {
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Download,
  Eye,
  X,
} from 'lucide-react';
import { EntitlementStatusClient } from '../../services/apiClient';

export interface TrialEndedModalProps {
  isOpen: boolean;
  onClose: () => void;
  entitlement: EntitlementStatusClient | null;
  onOpenUpgrade: () => void;
  onViewDocuments: () => void;
  lang?: 'ml' | 'en';
}

/**
 * Kudumba Vault — Trial Expiry & Grace Period Modal
 *
 * Designed with Kudumba Vault's premium aesthetic:
 * - Warm cream background / card container
 * - Rich brown (#6F4E37)
 * - Islamic gold (#C8A46B)
 * - Emerald green (#10B981)
 *
 * Shows accurate server-based grace period countdown (Trial End + 48 Hours).
 * Displays read-only status and retention deadline.
 */
export const TrialEndedModal: React.FC<TrialEndedModalProps> = ({
  isOpen,
  onClose,
  entitlement,
  onOpenUpgrade,
  onViewDocuments,
  lang = 'en',
}) => {
  const [timeLeftText, setTimeLeftText] = useState<{ hours: number; minutes: number; seconds: number }>({
    hours: 48,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    if (!isOpen || !entitlement?.gracePeriodEnd) return;

    const targetMs = new Date(entitlement.gracePeriodEnd).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, targetMs - now);

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeftText({ hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOpen, entitlement?.gracePeriodEnd]);

  if (!isOpen) return null;

  const isMalayalam = lang === 'ml';
  const isGraceExpired = entitlement?.gracePeriodExpired || timeLeftText.hours + timeLeftText.minutes + timeLeftText.seconds === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-ended-title"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-[#FAF8F5] border border-[#EBE3D5] p-6 sm:p-8 shadow-2xl text-[#6F4E37] overflow-hidden">
        {/* Subtle decorative top Islamic gold accent line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#C8A46B] via-[#E6C687] to-[#C8A46B]" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 p-2 rounded-full text-[#6F4E37]/60 hover:text-[#6F4E37] hover:bg-[#F2ECE1] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Icon Badge */}
        <div className="flex items-center justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-[#F6EFE2] border border-[#E3D4BC] flex items-center justify-center text-[#C8A46B] shadow-inner">
            <Clock className="w-8 h-8 text-[#6F4E37] stroke-[2.2]" />
          </div>
        </div>

        {/* Title */}
        <h2
          id="trial-ended-title"
          className="text-2xl font-black text-center text-[#4A3222] tracking-tight font-serif"
        >
          {isMalayalam ? 'നിങ്ങളുടെ സൗജന്യ ട്രയൽ അവസാനിച്ചു' : 'Your free trial has ended'}
        </h2>

        {/* Explanatory Message */}
        <p className="mt-2.5 text-center text-sm text-[#7D5E46] leading-relaxed">
          {isMalayalam
            ? 'നിങ്ങളുടെ കുടുംബ വോൾട്ട് നിലവിൽ റീഡ്-ഒൺലി (Read-Only) അവസ്ഥയിലാണ്. നിലവിലുള്ള രേഖകൾ നഷ്ടപ്പെടാതെ സൂക്ഷിക്കാനും പുതിയവ ചേർക്കാനും അടുത്ത 2 ദിവസത്തിനകം പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.'
            : 'Your family vault is currently read-only. Upgrade your plan within the next 2 days to retain your documents and continue using the full vault.'}
        </p>

        {/* Grace Period Countdown Card */}
        <div className="mt-6 rounded-2xl bg-white border border-[#EADFCB] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#8C6D53] mb-2">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-[#C8A46B]" />
              {isMalayalam ? 'ഗ്രേസ് പിരീഡ് അവശേഷിക്കുന്നത്:' : 'Grace Period Remaining:'}
            </span>
            <span className="text-[11px] font-mono text-[#6F4E37]/80">
              {entitlement?.gracePeriodEnd
                ? new Date(entitlement.gracePeriodEnd).toLocaleDateString()
                : '48 Hours'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[#FAF8F5] p-2.5 border border-[#EFE8DC]">
              <span className="block text-2xl font-bold font-mono text-[#6F4E37]">
                {String(timeLeftText.hours).padStart(2, '0')}
              </span>
              <span className="text-[10px] uppercase font-bold text-[#A88B72] tracking-wider">
                {isMalayalam ? 'മണിക്കൂർ' : 'Hours'}
              </span>
            </div>
            <div className="rounded-xl bg-[#FAF8F5] p-2.5 border border-[#EFE8DC]">
              <span className="block text-2xl font-bold font-mono text-[#6F4E37]">
                {String(timeLeftText.minutes).padStart(2, '0')}
              </span>
              <span className="text-[10px] uppercase font-bold text-[#A88B72] tracking-wider">
                {isMalayalam ? 'മിനിറ്റ്' : 'Minutes'}
              </span>
            </div>
            <div className="rounded-xl bg-[#FAF8F5] p-2.5 border border-[#EFE8DC]">
              <span className="block text-2xl font-bold font-mono text-[#6F4E37]">
                {String(timeLeftText.seconds).padStart(2, '0')}
              </span>
              <span className="text-[10px] uppercase font-bold text-[#A88B72] tracking-wider">
                {isMalayalam ? 'സെക്കൻഡ്' : 'Seconds'}
              </span>
            </div>
          </div>
        </div>

        {/* Feature status list: Emerald Green status indicators */}
        <div className="mt-5 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-[#2D5A3E] bg-[#EAF7EE] px-3.5 py-2 rounded-xl border border-[#CDEFD7]">
            <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>
              {isMalayalam
                ? 'നിലവിലുള്ള രേഖകൾ സുരക്ഷിതമായി കാണാനും ഡൗൺലോഡ് ചെയ്യാനും സാധിക്കും'
                : 'Existing documents remain completely safe to view and download'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[#7D5E46] bg-[#F6EFE2]/60 px-3.5 py-2 rounded-xl border border-[#EAE0CF]">
            <Lock className="w-4 h-4 text-[#C8A46B] shrink-0" />
            <span>
              {isMalayalam
                ? 'പുതിയ രേഖകൾ അപ്‌ലോഡ് ചെയ്യുന്നത് താൽക്കാലികമായി നിർത്തിവെച്ചിരിക്കുന്നു'
                : 'New document uploads are currently paused in read-only mode'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onOpenUpgrade}
            className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#6F4E37] to-[#553B2A] hover:from-[#5A3F2C] hover:to-[#432E20] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-[0.98]"
          >
            <span>{isMalayalam ? 'പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan'}</span>
            <ArrowRight className="w-4 h-4 text-[#C8A46B]" />
          </button>

          <button
            type="button"
            onClick={onViewDocuments}
            className="h-12 px-5 rounded-xl bg-white border border-[#D9CDBC] hover:bg-[#F6EFE2] text-[#6F4E37] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Eye className="w-4 h-4 text-[#8C6D53]" />
            <span>{isMalayalam ? 'രേഖകൾ കാണുക' : 'View My Documents'}</span>
          </button>
        </div>

        {/* Retention Policy Note */}
        <p className="mt-4 text-center text-[11px] text-[#A88B72] leading-tight">
          {isMalayalam
            ? 'ഗ്രേസ് പിരീഡിന് ശേഷം രേഖകൾ നീക്കംചെയ്യപ്പെടാതിരിക്കാൻ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.'
            : 'Upgrade before the grace period ends to prevent scheduled document cleanup.'}
        </p>
      </div>
    </div>
  );
};
