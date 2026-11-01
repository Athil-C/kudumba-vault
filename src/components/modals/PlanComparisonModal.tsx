import React, { useState, useEffect } from 'react';
import {
  Check,
  X,
  ShieldCheck,
  Clock,
  Sparkles,
  Crown,
  Gift,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { apiGetSubscriptionStatus } from '../../services/apiClient';

export interface PlanComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'ml' | 'en';
  currentEntitlement?: {
    planId: string;
    status: string;
    isTrialing?: boolean;
    trialEnd?: string | Date;
    quotaBytes?: number;
    usedBytes?: number;
  } | null;
  isLoadingEntitlement?: boolean;
  onSelectPlan: (planId: string) => Promise<void> | void;
  isProcessingCheckout?: boolean;
  checkoutError?: string | null;
}

export const PlanComparisonModal: React.FC<PlanComparisonModalProps> = ({
  isOpen,
  onClose,
  lang = 'en',
  currentEntitlement,
  isLoadingEntitlement = false,
  onSelectPlan,
  isProcessingCheckout = false,
  checkoutError = null,
}) => {
  const [selectedDuration] = useState<'3 months'>('3 months');
  const [isFoundingExpanded, setIsFoundingExpanded] = useState(false);
  const [isNriExpanded, setIsNriExpanded] = useState(false);
  const [isPartnerExpanded, setIsPartnerExpanded] = useState(false);
  const [internalEntitlement, setInternalEntitlement] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (currentEntitlement === undefined) {
      apiGetSubscriptionStatus()
        .then((data) => {
          if (data) setInternalEntitlement(data);
        })
        .catch(() => {});
    }
  }, [isOpen, currentEntitlement]);

  const effectiveEntitlement = currentEntitlement !== undefined ? currentEntitlement : internalEntitlement;

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isCurrentPlan = (planId: string) => {
    if (!effectiveEntitlement) {
      return planId === 'founding-free'; // Default fallback only if entitlement is completely absent
    }
    return effectiveEntitlement.planId === planId;
  };

  const isPlanActive = (planId: string) => {
    if (!effectiveEntitlement) return false;
    return effectiveEntitlement.planId === planId && effectiveEntitlement.status === 'active';
  };

  const getSavingsText = () => {
    return 'You save ₹1,500 today';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-modal-title"
      className="fixed inset-0 z-50 bg-[#F8F9FA] min-h-screen w-full overflow-y-auto flex flex-col animate-fade-in"
    >
      {/* =========================================================================
          1. FULL-PAGE HEADER & NAVIGATION BAR
         ========================================================================= */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E8EBF0] px-4 sm:px-8 py-4 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Colorful Kudumba Vault App Icon */}
            <div className="w-10 h-10 rounded-2xl bg-white border border-[#E8EBF0] shadow-xs p-1.5 grid grid-cols-2 gap-1 shrink-0">
              <span className="rounded-md bg-[#F23F4F]" />
              <span className="rounded-md bg-[#F59E0B]" />
              <span className="rounded-md bg-[#10B981]" />
              <span className="rounded-md bg-[#3B82F6]" />
            </div>
            <div>
              <h1 id="plan-modal-title" className="text-lg sm:text-2xl font-black text-[#172033] tracking-tight">
                {lang === 'ml' ? 'നിങ്ങളുടെ കുടുംബ പ്ലാൻ തിരഞ്ഞെടുക്കുക' : 'Choose Your Household Plan'}
              </h1>
              <p className="text-xs sm:text-sm text-[#7C879B] mt-0.5 font-medium">
                {lang === 'ml'
                  ? 'കേരളത്തിലും ഗൾഫിലുമുള്ള കുടുംബങ്ങൾക്കായി ലളിതവും സുതാര്യവുമായ നിരക്കുകൾ.'
                  : 'Simple, transparent pricing tailored for families in Kerala & the Gulf.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Open in new tab button */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.open('/plans', '_blank');
                }
              }}
              title="Open in new tab"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8EBF0] bg-white hover:bg-gray-50 text-[#7C879B] hover:text-[#172033] text-xs font-semibold transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Open in new tab</span>
            </button>

            {/* Back to Dashboard Button */}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F1F3F6] hover:bg-[#E8EBF0] text-[#172033] text-xs font-bold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </button>

            {/* Circular Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-9 h-9 rounded-full border border-[#E8EBF0] bg-white hover:bg-gray-100 text-[#7C879B] hover:text-[#172033] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          2. FULL-PAGE CONTENT BODY
         ========================================================================= */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {effectiveEntitlement && !isLoadingEntitlement && (
          <div className="flex justify-end">
            <span className="font-bold text-xs px-3 py-1 rounded-full bg-white border border-[#E8EBF0] text-[#7C879B]">
              Active Tier: {effectiveEntitlement.planId === 'founding-free' ? 'Founding Household' : effectiveEntitlement.planId} ({effectiveEntitlement.status})
            </span>
          </div>
        )}

        {checkoutError && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-[#F23F4F] text-xs sm:text-sm flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{checkoutError}</span>
          </div>
        )}

        {/* 3-Column Plan Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {/* -----------------------------------------------------------------
              CARD 1: Founding Household (Free)
             ----------------------------------------------------------------- */}
          <div
            className={`rounded-3xl p-7 sm:p-8 bg-white border border-[#E8EBF0] flex flex-col justify-between transition-all relative ${
              isCurrentPlan('founding-free') ? 'shadow-sm' : 'hover:border-gray-300'
            }`}
          >
            <div>
              {/* Current Plan Badge */}
              {isCurrentPlan('founding-free') ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F1F3F6] text-[#7C879B] text-[11px] font-bold w-fit mb-3">
                  <Crown className="w-3.5 h-3.5 text-[#7C879B]" />
                  <span>
                    {effectiveEntitlement?.status === 'expired'
                      ? lang === 'ml'
                        ? 'കാലഹരണപ്പെട്ട ട്രയൽ'
                        : 'TRIAL EXPIRED'
                      : effectiveEntitlement?.isTrialing
                      ? lang === 'ml'
                        ? 'നിലവിലെ സൗജന്യ ട്രയൽ'
                        : 'CURRENT FREE TRIAL'
                      : lang === 'ml'
                      ? 'നിലവിലെ പ്ലാൻ'
                      : 'CURRENT PLAN'}
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F8F9FA] text-[#7C879B] text-[11px] font-bold w-fit mb-3 border border-[#E8EBF0]">
                  <span>{lang === 'ml' ? 'സൗജന്യ പ്ലാൻ' : 'FREE TIER'}</span>
                </div>
              )}

              {/* Plan Name & Tagline */}
              <h3 className="text-xl font-extrabold text-[#172033] tracking-tight">
                {lang === 'ml' ? 'ഫ്രീ — ഫൗണ്ടിംഗ് ഹൗസ്ഹോൾഡ്' : 'Free — Founding Household'}
              </h3>
              <p className="text-xs text-[#7C879B] mt-1 font-medium leading-snug">
                {lang === 'ml'
                  ? 'കേരള-ഗൾഫ് കുടുംബങ്ങൾക്കുള്ള സൗജന്യ ട്രയൽ.'
                  : 'Introductory free trial for Kerala & Gulf households.'}
              </p>

              {/* Pricing Box */}
              <div className="bg-[#F8F9FA] border border-[#E8EBF0] rounded-2xl p-4 my-5 flex items-baseline justify-between">
                <span className="text-3xl sm:text-4xl font-black text-[#172033]">₹0</span>
                <span className="text-xs font-bold text-[#7C879B] uppercase tracking-wider">3 DAYS</span>
              </div>

              {/* Features & Limitations List */}
              <div className="space-y-3 pt-1">
                {/* Included features */}
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">Maximum 5 family members</span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">Only 3 GB of secure cloud storage</span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">
                    Limited to supported Kerala and Gulf document types
                  </span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">Free trial valid for 3 days only</span>
                </div>

                {/* Limitations (Gray crosses) */}
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                    <X className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#7C879B] leading-snug">No remote WhatsApp upload links</span>
                </div>

                {isFoundingExpanded && (
                  <>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">No SMS alerts</span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">No watermarked expiring Share Packs</span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">No bulk CSV import</span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">No multi-tenant client portal</span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">No automated compliance reminders</span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">
                        Access and features after trial expiry are not specified
                      </span>
                    </div>
                  </>
                )}

                {/* Collapsible View all features button */}
                <button
                  type="button"
                  onClick={() => setIsFoundingExpanded(!isFoundingExpanded)}
                  className="text-xs font-bold text-[#7C879B] hover:text-[#172033] flex items-center gap-1 pt-2 transition-colors cursor-pointer"
                >
                  <span>{isFoundingExpanded ? 'Show less' : 'View all features'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isFoundingExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Bottom Action Button */}
            <div className="mt-8 pt-4 border-t border-[#E8EBF0]">
              {isCurrentPlan('founding-free') ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 rounded-2xl bg-[#F5F6F8] text-[#9EA8B6] font-bold text-xs text-center border border-[#E8EBF0] cursor-default disabled:opacity-100"
                >
                  {lang === 'ml' ? 'നിലവിലെ പ്ലാൻ (Selected)' : 'Current Plan (Selected)'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectPlan('founding-free')}
                  className="w-full py-3.5 rounded-2xl border border-[#E8EBF0] hover:bg-gray-50 text-[#172033] font-bold text-xs transition-all cursor-pointer"
                >
                  {lang === 'ml' ? 'സൗജന്യ പ്ലാനിലേക്ക് മാറുക' : 'Downgrade to Free'}
                </button>
              )}
            </div>
          </div>

          {/* -----------------------------------------------------------------
              CARD 2: NRI Family Plus (Featured / Most Popular)
             ----------------------------------------------------------------- */}
          <div className="rounded-3xl p-7 sm:p-8 bg-[#FFFBFB] border-2 border-[#F23F4F] shadow-xl shadow-[#F23F4F]/10 flex flex-col justify-between transition-all relative">
            {/* Floating Popular Pill */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F23F4F] text-white text-[10px] font-extrabold px-4 py-0.5 rounded-full shadow-xs tracking-wider uppercase">
              POPULAR
            </div>

            <div>
              {/* Top Badge: Current Plan or Limited Time Offer */}
              {isCurrentPlan('nri-plus') ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF8F1] text-[#20B879] text-[11px] font-bold w-fit mb-3">
                  <Check className="w-3.5 h-3.5 text-[#20B879] stroke-[3]" />
                  <span>
                    {effectiveEntitlement?.status === 'expired'
                      ? lang === 'ml'
                        ? 'കാലഹരണപ്പെട്ട പ്ലാൻ'
                        : 'EXPIRED PLAN'
                      : lang === 'ml'
                      ? 'നിലവിലെ പ്ലാൻ'
                      : 'CURRENT PLAN'}
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-[#F23F4F] text-xs font-bold mb-3">
                  <Clock className="w-3.5 h-3.5" />
                  <span>LIMITED TIME OFFER</span>
                </div>
              )}

              {/* Plan Name & Tagline */}
              <h3 className="text-xl font-extrabold text-[#172033] tracking-tight">
                {lang === 'ml' ? 'എൻ.ആർ.ഐ ഫാമിലി പ്ലസ്' : 'NRI Family Plus'}
              </h3>
              <p className="text-xs text-[#7C879B] mt-1 font-medium leading-snug">
                {lang === 'ml'
                  ? 'കേരളത്തിലും ഗൾഫിലുമുള്ള കുടുംബങ്ങൾക്കായി.'
                  : 'For Kerala & Gulf dual-resident families.'}
              </p>

              {/* Segmented Duration Selector - 3 months only */}
              <div className="bg-[#F1F3F6] p-1 rounded-2xl inline-flex items-center gap-1 my-3">
                <span className="py-1.5 px-3.5 rounded-xl text-xs font-bold bg-[#F23F4F] text-white shadow-xs text-center">
                  3 months
                </span>
              </div>

              {/* Pricing Box */}
              <div className="bg-[#FFF0F1]/60 border border-[#F23F4F]/20 rounded-2xl p-4 my-2 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-[#172033]">₹249</span>
                <span className="text-xs font-semibold text-[#7C879B]">
                  {lang === 'ml' ? '/പ്രതിമാസം' : '/month'}
                </span>
              </div>

              {/* Savings Pill */}
              <div className="inline-flex items-center gap-1.5 bg-[#FFF0F1] text-[#F23F4F] font-bold text-xs px-3 py-1 rounded-xl mb-3 w-fit">
                <Gift className="w-3.5 h-3.5 shrink-0" />
                <span>{getSavingsText()}</span>
              </div>

              {/* Features & Limitations List */}
              <div className="space-y-3 pt-1">
                {/* Included features */}
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">Maximum 12 family members</span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">
                    Only 15 GB of high-resolution document storage
                  </span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">
                    WhatsApp uploads limited to remote upload links
                  </span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">
                    SMS alerts limited to GCC and India
                  </span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">
                    Share Packs are watermarked and expire
                  </span>
                </div>

                {isNriExpanded && (
                  <>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">No multi-tenant client portal</span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">
                        No bulk CSV client or policy import
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">
                        No automated compliance reminders
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">
                        No unlimited storage or family members
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">
                        Additional premium features beyond the listed scope are not specified
                      </span>
                    </div>
                  </>
                )}

                {/* Collapsible View all features button */}
                <button
                  type="button"
                  onClick={() => setIsNriExpanded(!isNriExpanded)}
                  className="text-xs font-bold text-[#7C879B] hover:text-[#172033] flex items-center gap-1 pt-2 transition-colors cursor-pointer"
                >
                  <span>{isNriExpanded ? 'Show less' : 'View all features'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isNriExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Bottom Action Button */}
            <div className="mt-8 pt-4 border-t border-[#E8EBF0]">
              {isPlanActive('nri-plus') ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 rounded-2xl bg-[#20B879] text-white text-xs font-bold text-center shadow-xs cursor-default disabled:opacity-100"
                >
                  ✓ {lang === 'ml' ? 'ആക്ടീവ് പ്ലാൻ (NRI Family Plus)' : 'Active Plan (NRI Family Plus)'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isProcessingCheckout}
                  onClick={() => onSelectPlan('nri-plus')}
                  className="w-full py-3.5 rounded-2xl bg-[#F23F4F] hover:bg-[#E02F3F] text-white font-bold text-xs transition-all cursor-pointer shadow-md shadow-[#F23F4F]/25 hover:shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessingCheckout ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{lang === 'ml' ? 'പ്രോസസ്സ് ചെയ്യുന്നു...' : 'Processing...'}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {isCurrentPlan('nri-plus') && effectiveEntitlement?.status === 'expired'
                          ? lang === 'ml'
                            ? 'പ്ലാൻ പുതുക്കുക'
                            : 'Renew Plan'
                          : lang === 'ml'
                          ? 'തുടരുക'
                          : 'Continue'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* -----------------------------------------------------------------
              CARD 3: Partners & Societies (Ultra / Institutional)
             ----------------------------------------------------------------- */}
          <div className="rounded-3xl p-7 sm:p-8 bg-white border border-[#E8EBF0] flex flex-col justify-between transition-all relative hover:border-gray-300">
            <div>
              {/* Ultra Badge or Current Plan */}
              {isCurrentPlan('partner-pro') ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF8F1] text-[#20B879] text-[11px] font-bold w-fit mb-3">
                  <Check className="w-3.5 h-3.5 text-[#20B879] stroke-[3]" />
                  <span>
                    {effectiveEntitlement?.status === 'expired'
                      ? lang === 'ml'
                        ? 'കാലഹരണപ്പെട്ട പ്ലാൻ'
                        : 'EXPIRED PLAN'
                      : lang === 'ml'
                      ? 'നിലവിലെ പ്ലാൻ'
                      : 'CURRENT PLAN'}
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-[#F23F4F] text-xs font-bold mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ULTRA</span>
                </div>
              )}

              {/* Plan Name & Tagline */}
              <h3 className="text-xl font-extrabold text-[#172033] tracking-tight">
                {lang === 'ml' ? 'പാർട്ണേഴ്സ് & സൊസൈറ്റീസ്' : 'Partners & Societies'}
              </h3>
              <p className="text-xs text-[#7C879B] mt-1 font-medium leading-snug">
                {lang === 'ml'
                  ? 'സൊസൈറ്റികൾ, അസോസിയേഷനുകൾ എന്നിവർക്കായി.'
                  : 'For community welfare societies, housing associations & CAs.'}
              </p>

              {/* Pricing Box */}
              <div className="bg-[#F8F9FA] border border-[#E8EBF0] rounded-2xl p-4 my-5 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-[#172033]">₹999</span>
                <span className="text-xs font-semibold text-[#7C879B]">
                  {lang === 'ml' ? '/പ്രതിമാസം' : '/month'}
                </span>
              </div>

              {/* Features & Limitations List */}
              <div className="space-y-3 pt-1">
                {/* Included features */}
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">Maximum 50 family/client seats</span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">Only 100 GB of vault storage</span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">
                    Bulk CSV imports restricted to authorized administrators
                  </span>
                </div>
                <div className="flex items-start gap-2 text-left">
                  <span className="w-4 h-4 rounded-full bg-[#FFF0F1] text-[#F23F4F] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className="text-xs text-[#172033] font-medium leading-snug">
                    Supported compliance regulations are not specified
                  </span>
                </div>

                {isPartnerExpanded && (
                  <>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">No unlimited storage or seats</span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">
                        Additional-seat pricing is not specified
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">
                        Tenant isolation and permissions need to be clearly defined
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-left">
                      <span className="w-4 h-4 rounded-full bg-[#F1F3F6] text-[#7C879B] flex items-center justify-center shrink-0 mt-0.5">
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                      <span className="text-xs text-[#7C879B] leading-snug">
                        Features beyond the listed plan scope are not specified
                      </span>
                    </div>
                  </>
                )}

                {/* Collapsible View all features button */}
                <button
                  type="button"
                  onClick={() => setIsPartnerExpanded(!isPartnerExpanded)}
                  className="text-xs font-bold text-[#7C879B] hover:text-[#172033] flex items-center gap-1 pt-2 transition-colors cursor-pointer"
                >
                  <span>{isPartnerExpanded ? 'Show less' : 'View all features'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isPartnerExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Bottom Action Button */}
            <div className="mt-8 pt-4 border-t border-[#E8EBF0]">
              {isPlanActive('partner-pro') ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 rounded-2xl bg-[#20B879] text-white text-xs font-bold text-center shadow-xs cursor-default disabled:opacity-100"
                >
                  ✓ {lang === 'ml' ? 'ആക്ടീവ് പ്ലാൻ (Partners & Societies)' : 'Active Plan (Partners & Societies)'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isProcessingCheckout}
                  onClick={() => onSelectPlan('partner-pro')}
                  className="w-full py-3.5 rounded-2xl border border-[#E8EBF0] hover:bg-gray-50 text-[#172033] font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>
                    {isCurrentPlan('partner-pro') && effectiveEntitlement?.status === 'expired'
                      ? lang === 'ml'
                        ? 'പ്ലാൻ പുതുക്കുക'
                        : 'Renew Plan'
                      : lang === 'ml'
                      ? 'സെയിൽസുമായി ബന്ധപ്പെടുക'
                      : 'Contact sales'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#7C879B]" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================================
            3. FOOTER SAFEGUARDS & POLICIES
           ========================================================================= */}
        <div className="p-6 rounded-3xl bg-white border border-[#E8EBF0] text-xs sm:text-sm text-[#7C879B] space-y-2 text-left shadow-xs">
          <p className="font-bold text-[#172033] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#20B879]" />
            <span className="text-sm font-extrabold">{lang === 'ml' ? 'കുടുംബ വോൾട്ട് പോളിസിയും വിവര സുരക്ഷയും' : 'Kudumba Vault Plan Policy & Data Safeguards'}</span>
          </p>
          <p>
            • <strong>Trial Expiration:</strong> When your 3-day free trial ends, your stored documents remain safe and accessible forever. Uploads are temporarily paused until you upgrade to a paid tier.
          </p>
          <p>
            • <strong>Billing &amp; Upgrades:</strong> All plan upgrades and account tier changes are managed securely by Kudumba Vault administration.
          </p>
          <p>
            • <strong>Seat Expansion &amp; Custom Regulations:</strong> Partner seat expansion beyond 50 client units and bespoke municipal compliance tracking require administrative arrangement.
          </p>
        </div>
      </main>
    </div>
  );
};
