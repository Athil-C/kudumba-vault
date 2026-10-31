import React from 'react';
import {
  FileText,
  ArrowUpRight,
  ArrowRight,
  Clock,
  Plus,
  AlertCircle,
} from 'lucide-react';
import {
  StatusBadge,
  Card,
  Banner,
  EmptyState,
} from '../ui/DesignSystem';
import { VaultDocumentItem } from '../../types/vault';
import { maskSensitiveNumber } from '../../utils/vaultLogic';

export interface CategoryMetaItem {
  id: string;
  ml: string;
  en: string;
  count: number;
  icon: React.FC<{ className?: string }>;
}

export interface HomeDashboardScreenProps {
  lang: 'ml' | 'en';
  familyName?: string;
  docs: VaultDocumentItem[];
  filteredDocs: VaultDocumentItem[];
  categories: CategoryMetaItem[];
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
  completenessScore: number;
  expiringCount: number;
  onOpenDocDetail: (doc: VaultDocumentItem) => void;
  onOpenAddDoc: () => void;
  onOpenWorkers: () => void;
  isAuthenticated?: boolean;
  onOpenSignIn?: () => void;
  onOpenSignUp?: () => void;
  onExploreFeatures?: () => void;
}

export const HomeDashboardScreen: React.FC<HomeDashboardScreenProps> = ({
  lang,
  familyName,
  docs,
  filteredDocs,
  categories,
  selectedCategory,
  onSelectCategory,
  completenessScore,
  expiringCount,
  onOpenDocDetail,
  onOpenAddDoc,
  onOpenWorkers,
  isAuthenticated = false,
  onOpenSignIn,
  onOpenSignUp,
  onExploreFeatures,
}) => {
  const urgentDoc = docs.find((d) => d.status !== 'VALID');
  const displayScore = docs.length === 0 ? 0 : completenessScore;
  const clamped = Math.max(0, Math.min(100, displayScore));
  const rad = Math.PI * (1 - clamped / 100);
  const cx = 100 + 70 * Math.cos(rad);
  const cy = 95 - 70 * Math.sin(rad);

  const bannerStatus =
    docs.length === 0
      ? lang === 'ml'
        ? 'വോൾട്ട് തയ്യാറാണ്'
        : 'Vault Ready'
      : expiringCount > 0
      ? lang === 'ml'
        ? 'വോൾട്ട് സംരക്ഷിതമാണ്'
        : 'Household Vault Active'
      : lang === 'ml'
      ? 'എല്ലാ രേഖകളും സാധുവാണ്'
      : 'All Documents Valid';

  const familyBrand = familyName
    ? (familyName.toLowerCase().includes('vault') || familyName.includes('വോൾട്ട്')
        ? familyName
        : `${familyName} ${lang === 'ml' ? 'വോൾട്ട്' : 'Family Vault'}`)
    : (lang === 'ml' ? 'കുടുംബ വോൾട്ട്' : 'Kudumba Family Vault');

  const bannerHeadline =
    docs.length === 0
      ? lang === 'ml'
        ? `${familyBrand}ിലേക്ക് സ്വാഗതം`
        : `Welcome to ${familyName ? `${familyName} Vault` : 'Kudumba Vault'}`
      : expiringCount > 0
      ? `${familyBrand} — ${
          lang === 'ml'
            ? `${expiringCount} രേഖകൾ ഉടൻ പുതുക്കണം`
            : `${expiringCount} documents need renewal soon`
        }`
      : `${familyBrand} — ${
          lang === 'ml'
            ? `${docs.length} രേഖകൾ സുരക്ഷിതം`
            : `${docs.length} documents secured`
        }`;

  const bannerDescription =
    docs.length === 0
      ? lang === 'ml'
        ? 'കുടുംബത്തിലെ പ്രധാനപ്പെട്ട രേഖകൾ സുരക്ഷിതമായി സൂക്ഷിക്കുക. കാലാവധി തീരുന്നതിന് മുൻപ് കൃത്യമായ ഓർമ്മപ്പെടുത്തലുകൾ നേടൂ.'
        : 'Keep your family documents organized, secure, and always accessible. Get automatic alerts before documents expire.'
      : lang === 'ml'
      ? 'എല്ലാ പ്രധാന രേഖകളും 10 സെക്കൻഡിനുള്ളിൽ കണ്ടെത്താം. കാലാവധി കഴിയുന്നതിന് 60, 30, 7 ദിവസം മുൻപ് വാട്ട്സ്ആപ്പ്/ഇമെയിൽ അലേർട്ട് ലഭിക്കും.'
      : 'Every essential household document in 10 seconds. Automatic reminders at 60, 30, 7, and 1 days before expiry.';

  const bannerUrgentTag =
    urgentDoc && expiringCount > 0
      ? lang === 'ml'
        ? `${urgentDoc.titleMl} — കാലാവധി ഉടൻ അവസാനിക്കും`
        : `${urgentDoc.titleEn} due in ${urgentDoc.daysRemaining ?? 0} days`
      : undefined;

  const bannerPrimaryLabel =
    docs.length === 0
      ? lang === 'ml'
        ? '+ ആദ്യ രേഖ ചേർക്കുക'
        : '+ Add First Document'
      : expiringCount > 0
      ? lang === 'ml'
        ? 'ശ്രദ്ധ വേണ്ടവ കാണുക'
        : 'Review Expiring Docs'
      : lang === 'ml'
      ? 'രേഖകൾ പരിശോധിക്കുക'
      : 'Browse Vault';

  const handleBannerAction = () => {
    if (docs.length === 0) {
      onOpenAddDoc();
    } else if (urgentDoc) {
      onOpenDocDetail(urgentDoc);
    } else {
      onSelectCategory('ALL');
    }
  };

  return (
    <div className="space-y-8">
      {/* Row 1: Full-Width Hero Banner */}
      <Banner
        statusLabel={bannerStatus}
        headline={bannerHeadline}
        description={bannerDescription}
        urgentTag={bannerUrgentTag}
        primaryLabel={bannerPrimaryLabel}
        onPrimaryClick={handleBannerAction}
      />

      {/* Mobile Vault Completeness Card (Screen 1 1:1 with Reference) */}
      <div className="lg:hidden rounded-[22px] border border-[#E5E7EB] bg-white p-5 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#111827] font-malayalam">
              {lang === 'ml' ? 'വോൾട്ട് പൂർണ്ണത' : 'Vault Completeness'}
            </h3>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-[#111827] tabular-nums font-mono-tabular">
                {clamped}
              </span>
              <span className="text-xs text-[#64748B] font-mono-tabular">/ 100</span>
            </div>
          </div>
          <span className="text-sm font-bold text-[#64748B] font-mono-tabular">{clamped}%</span>
        </div>

        {/* Progress Bar */}
        <div className="mt-3.5 h-2 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#E03A45] transition-all duration-500"
            style={{ width: `${clamped}%` }}
          />
        </div>

        {/* Alert Notice */}
        <div className="mt-3.5 flex items-center gap-2 text-xs font-semibold text-[#DC2626]">
          <div className="w-4 h-4 rounded-full bg-[#FEE2E2] flex items-center justify-center text-[#DC2626] shrink-0">
            <AlertCircle className="w-3 h-3 stroke-[2.5]" />
          </div>
          <span className="font-malayalam">
            {docs.length === 0
              ? (lang === 'ml' ? 'രേഖകളൊന്നും ചേർത്തിട്ടില്ല (0 / 18 ശുപാർശ ചെയ്തവ).' : 'No documents added yet (0 of 18 recommended)')
              : (lang === 'ml' ? `18 ശുപാർശ ചെയ്ത രേഖകളിൽ ${docs.length} എണ്ണം ചേർത്തു.` : `${docs.length} of 18 recommended documents added`)}
          </span>
        </div>
      </div>

      {/* Row 2: Left Column (Completeness Gauge + Document Categories) & Right Column (Household Documents & Expiry) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (5 cols): Stacked Gauge Card + Document Categories Card */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Vault Completeness Gauge (Desktop Left Column) */}
          <div className="hidden lg:block">
            <Card className="flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-[13.5px] font-bold text-[#0B0B0C] font-malayalam tracking-tight">
                    {lang === 'ml'
                      ? 'വോൾട്ട് പൂർണ്ണത (Completeness)'
                      : 'Vault Completeness'}
                  </h3>
                  <p className="mt-1 tabular-nums text-2xl font-bold text-[#0B0B0C] tracking-tight">
                    {clamped}{' '}
                    <span className="font-mono-tabular text-[12px] font-normal text-[#5B6168]">
                      /100
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onOpenAddDoc}
                  aria-label="Add document to improve completeness"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E03A45] text-white hover:bg-[#C42F3A] cursor-pointer shrink-0 transition-colors"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>

              <div className="my-3 flex justify-center">
                <svg viewBox="0 0 200 110" className="w-44 h-24 overflow-visible">
                  <path
                    d="M 30 95 A 70 70 0 0 1 170 95"
                    fill="none"
                    stroke="#D5DAE1"
                    strokeWidth="18"
                    strokeDasharray="3 4"
                  />
                  <path
                    d={`M 30 95 A 70 70 0 0 1 ${cx.toFixed(1)} ${cy.toFixed(1)}`}
                    fill="none"
                    stroke="#FF4B55"
                    strokeWidth="18"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r="7"
                    fill="#FFFFFF"
                    stroke="#FF4B55"
                    strokeWidth="4"
                  />
                </svg>
              </div>

              <p className="text-center text-[11.5px] font-medium text-[#5B6168]">
                {docs.length === 0
                  ? lang === 'ml'
                    ? 'രേഖകളൊന്നും ചേർത്തിട്ടില്ല (0 / 18).'
                    : 'No documents added yet (0 of 18 recommended).'
                  : lang === 'ml'
                  ? `കുടുംബത്തിലെ 18 പ്രധാന രേഖകളിൽ ${docs.length} എണ്ണം ചേർത്തു.`
                  : `${docs.length} of 18 recommended Kerala & NRI household documents stored.`}
              </p>
            </Card>
          </div>

          {/* Card 2: Document Categories */}
          <div id="vault-categories-section">
            <Card className="flex flex-col justify-between rounded-[22px] border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#111827] font-malayalam tracking-tight">
                  {lang === 'ml'
                    ? 'രേഖകളുടെ വിഭാഗങ്ങൾ'
                    : 'Document Categories'}
                </h3>
                <button
                  type="button"
                  onClick={() => onSelectCategory('ALL')}
                  className="text-xs font-bold text-[#E03A45] hover:text-[#C42F3A] cursor-pointer transition-colors"
                >
                  {lang === 'ml' ? 'എല്ലാം കാണുക' : 'See All'}
                </button>
              </div>

              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  const active = selectedCategory === cat.id;
                  const badgeCount = cat.count;

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onSelectCategory(cat.id)}
                      className={`flex min-h-[48px] items-center justify-between rounded-2xl border px-3 py-2 text-left transition-all cursor-pointer ${
                        active
                          ? 'border-[#E03A45] bg-[#E03A45] text-white shadow-xs'
                          : 'border-[#E5E7EB] bg-white text-[#111827] hover:border-[#E03A45]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${
                            active ? 'text-white' : 'text-[#E03A45]'
                          }`}
                        />
                        <span className="text-[12px] font-bold leading-snug font-malayalam truncate">
                          {lang === 'ml' ? cat.ml : cat.en}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                          active
                            ? 'bg-white/25 text-white'
                            : 'bg-[#F4F5F7] text-[#0B0B0C]'
                        }`}
                      >
                        {badgeCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {(() => {
              const overdue = docs.filter((d) => (d.daysRemaining ?? 0) < 0);
              const upcoming = docs
                .filter((d) => (d.daysRemaining ?? 0) >= 0)
                .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999))[0];

              if (overdue.length > 0) {
                return (
                  <div
                    onClick={() => onOpenDocDetail(overdue[0])}
                    className="mt-4 pt-3 border-t border-[#E6E8EC] flex items-center justify-between gap-2 text-[11.5px] font-semibold text-[#B91C1C] cursor-pointer hover:underline"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Clock className="w-3.5 h-3.5 text-[#B91C1C] shrink-0" />
                      <span className="truncate">
                        {lang === 'ml'
                          ? `കാലാവധി കഴിഞ്ഞത്: ${overdue[0].titleMl} (${Math.abs(overdue[0].daysRemaining || 0)} ദിവസം)`
                          : `Overdue Alert: ${overdue[0].titleEn} (${Math.abs(overdue[0].daysRemaining || 0)}d ago)`}
                      </span>
                    </div>
                    <span className="text-[10px] bg-[#FEE2E2] px-2 py-0.5 rounded-full font-bold">
                      {lang === 'ml' ? 'വാട്ട്സ്ആപ്പ്' : 'Weekly Alert'}
                    </span>
                  </div>
                );
              }

              if (upcoming) {
                return (
                  <div
                    onClick={() => onOpenDocDetail(upcoming)}
                    className="mt-4 pt-3 border-t border-[#E6E8EC] flex items-center justify-between gap-2 text-[11.5px] font-semibold text-[#5B6168] cursor-pointer hover:text-[#0B0B0C]"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Clock className="w-3.5 h-3.5 text-[#A85A00] shrink-0" />
                      <span className="truncate">
                        {lang === 'ml'
                          ? `അടുത്ത അലേർട്ട്: ${upcoming.titleMl} (${upcoming.daysRemaining} ദിവസം)`
                          : `Next Renewal Alert: ${upcoming.titleEn} (${upcoming.daysRemaining}d)`}
                      </span>
                    </div>
                    <span className="text-[10px] bg-[#FFF4D6] text-[#A85A00] px-2 py-0.5 rounded-full font-bold">
                      {lang === 'ml' ? 'ഷെഡ്യൂൾ' : '60/30/7/1d'}
                    </span>
                  </div>
                );
              }

              return null;
            })()}
          </Card>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): Household Documents & Expiry List */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[14px] font-bold text-[#0B0B0C] font-malayalam tracking-tight">
              {lang === 'ml'
                ? 'കുടുംബ രേഖകളും കാലാവധിയും'
                : 'Household Documents & Expiry'}
            </h3>
            <span className="text-[11.5px] font-semibold text-[#5B6168] tabular-nums">
              {filteredDocs.length}{' '}
              {lang === 'ml' ? 'രേഖകൾ' : 'documents'}
            </span>
          </div>

          {docs.length === 0 ? (
            <EmptyState
              title={
                lang === 'ml'
                  ? 'വോൾട്ടിൽ രേഖകളൊന്നും ചേർത്തിട്ടില്ല'
                  : 'Your Vault is Empty'
              }
              subtitle={
                lang === 'ml'
                  ? 'ഐഡി കാർഡുകൾ, പാസ്‌പോർട്ട്, ഇൻഷുറൻസ്, വസ്തു കരം രേഖകൾ സുരക്ഷിതമായി അപ്‌ലോഡ് ചെയ്യുക.'
                  : 'Add IDs, passports, insurance policies, or tax receipts to get started.'
              }
              ctaLabel={lang === 'ml' ? '+ ആദ്യ രേഖ ചേർക്കുക' : '+ Add First Document'}
              onCta={onOpenAddDoc}
            />
          ) : filteredDocs.length === 0 ? (
            <EmptyState
              title={
                lang === 'ml'
                  ? 'ഈ വിഭാഗത്തിൽ രേഖകളില്ല'
                  : 'No matching documents'
              }
              subtitle={
                lang === 'ml'
                  ? 'മറ്റൊരു വിഭാഗം തിരഞ്ഞെടുക്കുകയോ പുതിയ രേഖ ചേർക്കുകയോ ചെയ്യുക.'
                  : 'Try selecting another category or add a new document.'
              }
              ctaLabel={lang === 'ml' ? '+ രേഖ ചേർക്കുക' : '+ Add Document'}
              onCta={onOpenAddDoc}
            />
          ) : (
            <div className="space-y-3">
              {filteredDocs.map((doc) => {
                const ownerDisplay =
                  doc.id === 'doc-5'
                    ? lang === 'ml'
                      ? 'എല്ലാ കുടുംബാംഗങ്ങളും'
                      : 'All Household Members'
                    : lang === 'ml'
                    ? doc.ownerMl
                    : doc.ownerEn;

                return (
                  <div
                    key={doc.id}
                    onClick={() => onOpenDocDetail(doc)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ')
                        onOpenDocDetail(doc);
                    }}
                    className="group flex items-center justify-between gap-3.5 rounded-2xl border border-[#E6E8EC] bg-[#F8F9FA] hover:bg-white hover:border-[#E03A45] px-4 py-3 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {doc.fileDataUrl ? (
                        <img
                          src={doc.fileDataUrl}
                          alt={doc.titleEn}
                          referrerPolicy="no-referrer"
                          className="h-9 w-9 shrink-0 rounded-xl object-cover border border-[#E6E8EC] bg-white"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#E03A45] border border-[#E6E8EC]">
                          <FileText className="h-4 w-4" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[#5B6168]">
                          <span className="font-mono-tabular">
                            {maskSensitiveNumber(doc.docNumber)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate font-malayalam">
                            {ownerDisplay}
                          </span>
                        </div>

                        <h4 className="mt-0.5 text-[13px] sm:text-[13.5px] font-bold text-[#0B0B0C] truncate font-malayalam tracking-tight">
                          {lang === 'ml' ? doc.titleMl : doc.titleEn}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <StatusBadge
                        status={doc.status}
                        daysRemaining={doc.daysRemaining}
                        daysText={
                          lang === 'ml' ? doc.daysTextMl : doc.daysTextEn
                        }
                        lang={lang}
                      />
                      <ArrowRight className="h-3.5 w-3.5 text-[#5B6168] group-hover:text-[#E03A45] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Card 4: Compact Vault Completeness for Mobile */}
      <div className="lg:hidden w-full pt-1">
        <Card className="flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[13.5px] font-bold text-[#0B0B0C] font-malayalam tracking-tight">
                {lang === 'ml'
                  ? 'വോൾട്ട് പൂർണ്ണത (Completeness)'
                  : 'Vault Completeness'}
              </h3>
              <p className="mt-1 tabular-nums text-xl font-bold text-[#0B0B0C] tracking-tight">
                {clamped}{' '}
                <span className="font-mono-tabular text-xs font-normal text-[#5B6168]">
                  /100
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenAddDoc}
              aria-label="Add document to improve completeness"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E03A45] text-white hover:bg-[#C42F3A] cursor-pointer shrink-0 transition-colors"
            >
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2 text-[11.5px] font-medium text-[#5B6168]">
            {docs.length === 0
              ? lang === 'ml'
                ? 'രേഖകളൊന്നും ചേർത്തിട്ടില്ല (0 / 18).'
                : 'No documents added yet (0 of 18 recommended).'
              : lang === 'ml'
              ? `കുടുംബത്തിലെ 18 പ്രധാന രേഖകളിൽ ${docs.length} എണ്ണം ചേർത്തു.`
              : `${docs.length} of 18 recommended Kerala & NRI household documents stored.`}
          </p>
        </Card>
      </div>

      {/* Mobile Sticky Thumb Action Button within easy reach above bottom navigation */}
      <div className="md:hidden fixed bottom-[70px] left-4 right-4 z-30 pointer-events-none">
        <button
          type="button"
          onClick={onOpenAddDoc}
          aria-label={lang === 'ml' ? 'പുതിയ രേഖ ചേർക്കുക' : '+ Add Document'}
          className="pointer-events-auto spring-interactive flex w-full h-[44px] items-center justify-center gap-2 rounded-full bg-[#E03A45] text-white font-semibold text-[13px] shadow-lg hover:bg-[#C42F3A] cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[2.4]" />
          <span>{lang === 'ml' ? '+ രേഖ ചേർക്കുക' : '+ Add Document'}</span>
        </button>
      </div>
    </div>
  );
};
