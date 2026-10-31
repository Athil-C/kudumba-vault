import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  Eye,
  EyeOff,
  RefreshCw,
  Phone,
  MessageCircle,
  ShieldCheck,
  FileText,
  Wrench,
  Landmark,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { Language } from '../i18n/translations';
import { evaluateExpiryStatus, maskSensitiveNumber } from '../utils/vaultLogic';

interface DemoDoc {
  id: string;
  titleEn: string;
  titleMl: string;
  personEn: string;
  personMl: string;
  categoryEn: string;
  categoryMl: string;
  docTypeCode: string;
  rawNumber: string;
  expiryDate: string;
  renewalCount: number;
}

const INITIAL_DEMO_DOCS: DemoDoc[] = [
  {
    id: 'doc-rc-insurance',
    titleEn: 'Maruti Brezza Motor Insurance (KL-07-CQ-4821)',
    titleMl: 'വാഹന ഇൻഷുറൻസ് പോളിസി (KL-07-CQ-4821)',
    personEn: 'Raghavan Nair (Father)',
    personMl: 'രാഘവൻ നായർ (അച്ഛൻ)',
    categoryEn: 'Vehicle',
    categoryMl: 'വാഹനം',
    docTypeCode: 'VEHICLE_INSURANCE',
    rawNumber: 'POL-9948201842',
    expiryDate: '2026-10-29',
    renewalCount: 2,
  },
  {
    id: 'doc-iqama',
    titleEn: 'UAE Emirates ID & Residence Visa (Dubai)',
    titleMl: 'യു.എ.ഇ എമിറേറ്റ്സ് ഐഡി & വിസ (ദുബായ്)',
    personEn: 'Anoop Nair (NRI Son)',
    personMl: 'അനൂപ് നായർ (ദുബായ്)',
    categoryEn: 'Gulf documents',
    categoryMl: 'ഗൾഫ് രേഖകൾ',
    docTypeCode: 'IQAMA_EMIRATES_ID',
    rawNumber: '784-1988-4920184-1',
    expiryDate: '2026-11-22',
    renewalCount: 1,
  },
  {
    id: 'doc-land-tax',
    titleEn: 'Edappally Village Land Tax Receipt (കരമടച്ച രസിത്)',
    titleMl: 'ഇടപ്പള്ളി വില്ലേജ് ഭൂനികുതി രസിത്',
    personEn: 'Saraswathi Amma (Mother)',
    personMl: 'സരസ്വതി അമ്മ (അമ്മ)',
    categoryEn: 'Property',
    categoryMl: 'വസ്തുവകകൾ',
    docTypeCode: 'LAND_TAX',
    rawNumber: 'KL-EKM-2026-8841',
    expiryDate: '2027-03-31',
    renewalCount: 4,
  },
  {
    id: 'doc-aadhaar',
    titleEn: 'Aadhaar Card (Auto-Masked First 8 Digits)',
    titleMl: 'ആധാർ കാർഡ് (ആദ്യ 8 അക്കങ്ങൾ മറച്ചത്)',
    personEn: 'Raghavan Nair (Father)',
    personMl: 'രാഘവൻ നായർ (അച്ഛൻ)',
    categoryEn: 'Identity',
    categoryMl: 'തിരിച്ചറിയൽ',
    docTypeCode: 'AADHAAR',
    rawNumber: '7482 9103 4821',
    expiryDate: '',
    renewalCount: 0,
  },
];

interface InteractivePhoneMockupProps {
  lang: Language;
  onOpenAddDemo?: () => void;
}

export const InteractivePhoneMockup: React.FC<InteractivePhoneMockupProps> = ({
  lang,
  onOpenAddDemo,
}) => {
  const [activeTab, setActiveTab] = useState<'vault' | 'workers' | 'kerala'>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [docs, setDocs] = useState<DemoDoc[]>(INITIAL_DEMO_DOCS);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [kuriPaidCount, setKuriPaidCount] = useState(18);
  const [nriRequested, setNriRequested] = useState(false);

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMarkRenewed = (id: string) => {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              expiryDate: '2027-10-29',
              renewalCount: d.renewalCount + 1,
            }
          : d
      )
    );
  };

  const healthyCount = docs.filter(
    (d) => evaluateExpiryStatus(d.expiryDate || null, '2026-10-25').state === 'HEALTHY'
  ).length;
  const readinessScore = Math.round((healthyCount / docs.length) * 100);

  const filteredDocs = docs.filter((d) => {
    if (selectedCategory !== 'ALL' && d.categoryEn !== selectedCategory) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.titleEn.toLowerCase().includes(q) ||
      d.titleMl.toLowerCase().includes(q) ||
      d.personEn.toLowerCase().includes(q) ||
      d.categoryEn.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="mx-auto w-full max-w-4xl overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white shadow-2xl flex flex-col sm:flex-row text-left"
      aria-label={lang === 'ml' ? 'കുടുംബ വോൾട്ട് ലൈവ് ഡാഷ്‌ബോർഡ്' : 'Kudumba Vault Live Dashboard Preview'}
    >
      {/* Left Coral-Red Sidebar Rail matching reference image 2 (#EA4C46) */}
      <div className="flex sm:w-20 sm:flex-col items-center justify-between bg-[#EA4C46] px-4 py-3 sm:py-5 text-white shrink-0">
        {/* Brand Badge */}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#EA4C46] font-extrabold text-sm shadow-xs">
          KV
        </div>

        {/* Navigation Rail Icons */}
        <div className="flex sm:flex-col items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            className={`flex flex-col items-center justify-center rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === 'vault'
                ? 'bg-white text-[#EA4C46] shadow-xs'
                : 'text-white/90 hover:bg-white/15'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span className="mt-1">{lang === 'ml' ? 'വോൾട്ട്' : 'Vault'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('workers')}
            className={`flex flex-col items-center justify-center rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === 'workers'
                ? 'bg-white text-[#EA4C46] shadow-xs'
                : 'text-white/90 hover:bg-white/15'
            }`}
          >
            <Wrench className="h-4 w-4" />
            <span className="mt-1">{lang === 'ml' ? 'ജോലിക്കാർ' : 'Workers'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kerala')}
            className={`flex flex-col items-center justify-center rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === 'kerala'
                ? 'bg-white text-[#EA4C46] shadow-xs'
                : 'text-white/90 hover:bg-white/15'
            }`}
          >
            <Landmark className="h-4 w-4" />
            <span className="mt-1">{lang === 'ml' ? 'കുറി' : 'Kuri'}</span>
          </button>
        </div>

        {/* Bottom Avatar Circle */}
        <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/15 text-xs font-bold">
          KV
        </div>
      </div>

      {/* Main White Dashboard Workspace matching reference image 2 */}
      <div className="flex-1 bg-white p-4 sm:p-6 space-y-4">
        {/* Top Search & Quick Add Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ml'
                  ? '10 സെക്കൻഡിൽ തിരയുക (ആധാർ, ഭൂനികുതി, ഇഖാമ)...'
                  : 'Search documents, family members, workers... (Ctrl K)'
              }
              aria-label={lang === 'ml' ? 'രേഖകൾ തിരയുക' : 'Search family documents'}
              className="w-full min-h-[42px] rounded-full border border-[#E5E7EB] bg-[#F3F4F6] py-2 pr-4 pl-10 text-xs sm:text-sm text-[#0F172A] placeholder:text-[#64748B] focus:border-[#EA4C46] focus:bg-white focus:outline-none"
            />
          </div>

          {onOpenAddDemo && (
            <button
              type="button"
              onClick={onOpenAddDemo}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-[#EA4C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#D43B35] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>{lang === 'ml' ? '3-ടാപ്പ് ചേർക്കൽ' : '3-Tap Add'}</span>
            </button>
          )}
        </div>

        {/* Grey Concentric Target Banner Card + Semicircular Gauge Card (Reference Image 2 Style) */}
        <div className="grid gap-4 md:grid-cols-12">
          {/* Banner with Concentric Target Circles */}
          <div className="relative overflow-hidden rounded-2xl bg-[#F3F4F6] p-4 sm:p-5 md:col-span-8 flex flex-col justify-between">
            {/* Decorative concentric rings on right */}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 opacity-55"
              viewBox="0 0 200 200"
              fill="none"
            >
              <circle cx="100" cy="100" r="85" stroke="#CBD5E1" strokeWidth="10" />
              <circle cx="100" cy="100" r="60" stroke="#CBD5E1" strokeWidth="10" />
              <circle cx="100" cy="100" r="35" stroke="#CBD5E1" strokeWidth="10" />
            </svg>

            <div className="relative z-10 space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-semibold text-[#16A34A]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {lang === 'ml'
                    ? '4/4 അംഗങ്ങൾ · കുടുംബ വോൾട്ട് സജ്ജമാണ്'
                    : '4/4 profiles complete · Vault active'}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-[#1E293B]">
                {lang === 'ml'
                  ? 'വാഹന ഇൻഷുറൻസ് 4 ദിവസത്തിനുള്ളിൽ അവസാനിക്കും'
                  : 'Vehicle Insurance expires in 4 days'}
              </h3>

              <p className="max-w-md text-xs text-[#64748B]">
                {lang === 'ml'
                  ? 'നായർ കുടുംബം (കൊച്ചി & ദുബായ്) · 60, 30, 7, 1 ദിവസങ്ങളിലെ ഓട്ടോമേറ്റഡ് ഇമെയിൽ & SMS അലേർട്ട് പ്രവർത്തിക്കുന്നു.'
                  : 'Nair Household (Kochi & Dubai) · Automated 60, 30, 7, and 1-day Email and SMS alerts are active.'}
              </p>
            </div>

            <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EA4C46] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                <AlertTriangle className="h-3 w-3" />
                {lang === 'ml' ? 'അടിയന്തരം' : 'Urgent'}
              </span>
              {onOpenAddDemo && (
                <button
                  type="button"
                  onClick={onOpenAddDemo}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[#141416] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0F172A] cursor-pointer"
                >
                  <span>{lang === 'ml' ? 'പുതിയ രേഖ ചേർക്കുക' : 'Upload Document'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Household Health Semicircular Gauge Card (Reference Image 2 Style) */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 md:col-span-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#0F172A]">
                  {lang === 'ml' ? 'വോൾട്ട് സുരക്ഷാ സ്കോർ' : 'Household Readiness'}
                </p>
                <p className="font-mono-tabular text-xl font-extrabold text-[#0F172A]">
                  {readinessScore}
                  <span className="text-xs font-normal text-[#64748B]"> /100</span>
                </p>
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EA4C46] text-white">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>

            {/* Semicircular Coral-Red Arc Gauge */}
            <div className="my-2 flex justify-center">
              <svg viewBox="0 0 160 90" className="w-36 h-20">
                <path
                  d="M 20 80 A 60 60 0 0 1 140 80"
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="16"
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                />
                <path
                  d="M 20 80 A 60 60 0 0 1 115 32"
                  fill="none"
                  stroke="#EA4C46"
                  strokeWidth="16"
                  strokeLinecap="round"
                />
                <circle cx="115" cy="32" r="6" fill="#FFFFFF" stroke="#EA4C46" strokeWidth="4" />
              </svg>
            </div>

            <p className="text-center text-[11px] text-[#64748B]">
              {lang === 'ml'
                ? 'ആധാർ, ഭൂനികുതി, പാസ്‌പോർട്ട്, ഇഖാമ എന്നിവ പരിശോധിച്ചു.'
                : 'Aadhaar, Land Tax, Passport & Iqama tracked.'}
            </p>
          </div>
        </div>

        {/* Tab 1: Attention + Document Vault */}
        {activeTab === 'vault' && (
          <div className="space-y-3">
            {/* Category Filter Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'ALL', en: 'All Documents (4)', ml: 'എല്ലാം (4)' },
                { id: 'Vehicle', en: 'Vehicle', ml: 'വാഹനം' },
                { id: 'Gulf documents', en: 'Gulf NRI', ml: 'ഗൾഫ് രേഖ' },
                { id: 'Property', en: 'Property', ml: 'വസ്തു' },
                { id: 'Identity', en: 'Identity', ml: 'തിരിച്ചറിയൽ' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`min-h-[38px] rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedCategory === cat.id
                      ? 'bg-[#EA4C46] text-white'
                      : 'bg-[#F3F4F6] text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {lang === 'ml' ? cat.ml : cat.en}
                </button>
              ))}
            </div>

            {/* Document Cards */}
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredDocs.length === 0 ? (
                <div className="col-span-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6 text-center">
                  <p className="text-sm font-medium text-[#0F172A]">
                    {lang === 'ml' ? 'രേഖകളൊന്നും കണ്ടെത്തിയില്ല.' : 'No matching documents found.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('ALL');
                    }}
                    className="mt-2 min-h-[40px] rounded-full bg-[#EA4C46] px-4 py-1.5 text-xs font-semibold text-white cursor-pointer"
                  >
                    {lang === 'ml' ? 'ഫിൽട്ടർ മാറ്റുക' : 'Reset Filter'}
                  </button>
                </div>
              ) : (
                filteredDocs.map((doc) => {
                  const status = evaluateExpiryStatus(doc.expiryDate || null, '2026-10-25');
                  const isRevealed = !!revealedIds[doc.id];
                  const displayedNumber =
                    doc.docTypeCode === 'AADHAAR'
                      ? maskSensitiveNumber(doc.rawNumber, 'AADHAAR')
                      : isRevealed
                      ? doc.rawNumber
                      : maskSensitiveNumber(doc.rawNumber, doc.docTypeCode);

                  const statusStyles =
                    status.state === 'CRITICAL'
                      ? 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]'
                      : status.state === 'WARNING'
                      ? 'bg-[#FFFBEB] text-[#EFC94C] border-[#FDE68A]'
                      : 'bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]';

                  const StatusIcon =
                    status.iconName === 'AlertTriangle'
                      ? AlertTriangle
                      : status.iconName === 'Clock'
                      ? Clock
                      : CheckCircle2;

                  return (
                    <div
                      key={doc.id}
                      className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-3.5 transition-colors hover:border-[#EA4C46]/50"
                    >
                      <div>
                        {/* Status Banner: Color + Icon + Explicit Text */}
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusStyles}`}
                        >
                          <StatusIcon className="h-3.5 w-3.5 shrink-0" />
                          <span>{lang === 'ml' ? status.labelMl : status.labelEn}</span>
                        </div>

                        <h4 className="mt-2 text-sm font-bold text-[#0F172A]">
                          {lang === 'ml' ? doc.titleMl : doc.titleEn}
                        </h4>

                        <p className="mt-0.5 text-xs text-[#64748B]">
                          <span>{lang === 'ml' ? doc.categoryMl : doc.categoryEn}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{lang === 'ml' ? doc.personMl : doc.personEn}</span>
                          {doc.renewalCount > 0 && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono-tabular">
                                {lang === 'ml'
                                  ? `${doc.renewalCount} തവണ പുതുക്കി`
                                  : `${doc.renewalCount}x renewed`}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* Masked Number + Actions */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#E5E7EB]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular text-xs font-semibold text-[#0F172A]">
                            {displayedNumber}
                          </span>
                          {doc.docTypeCode !== 'AADHAAR' ? (
                            <button
                              type="button"
                              onClick={() => toggleReveal(doc.id)}
                              aria-label={
                                isRevealed
                                  ? `Hide ${doc.titleEn} number`
                                  : `Reveal ${doc.titleEn} number`
                              }
                              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-[#F3F4F6] px-2 text-xs font-medium text-[#0F172A] hover:bg-[#E5E7EB] cursor-pointer"
                            >
                              {isRevealed ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#16A34A] font-semibold">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {lang === 'ml' ? 'UIDAI സുരക്ഷിതം' : 'UIDAI Masked'}
                            </span>
                          )}
                        </div>

                        {status.state !== 'HEALTHY' && (
                          <button
                            type="button"
                            onClick={() => handleMarkRenewed(doc.id)}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#EA4C46] px-3 py-1 text-xs font-semibold text-white hover:bg-[#D43B35] cursor-pointer whitespace-nowrap"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>
                              {lang === 'ml' ? 'പുതുക്കിയതായി രേഖപ്പെടുത്തുക' : 'Mark Renewed'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Workers & Contacts Book */}
        {activeTab === 'workers' && (
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                nameEn: 'Soman Nair — Electrician',
                nameMl: 'സോമൻ നായർ — ഇലക്ട്രീഷ്യൻ',
                area: 'Edappally / Kalamassery',
                phone: '+919447102938',
                lastWorkEn: 'Inverter battery check · ₹1,200 (Paid)',
                lastWorkMl: 'ഇൻവെർട്ടർ സർവീസ് · ₹1,200 (നൽകി)',
              },
              {
                nameEn: 'Babu — Plumber & Pump Tech',
                nameMl: 'ബാബു — പ്ലംബർ & മോട്ടോർ പമ്പ്',
                area: 'Aluva / Kakkanad',
                phone: '+919847201928',
                lastWorkEn: 'Tank valve replacement · ₹850 (Paid)',
                lastWorkMl: 'വാട്ടർ ടാങ്ക് വാൽവ് · ₹850 (നൽകി)',
              },
              {
                nameEn: 'Kunhikrishnan — Coconut Climber',
                nameMl: 'കുഞ്ഞികൃഷ്ണൻ — തെങ്ങ് കയറ്റം',
                area: 'Tripunithura',
                phone: '+919495301920',
                lastWorkEn: '14 coconut trees harvest · ₹1,400 (Paid)',
                lastWorkMl: '14 തെങ്ങ് ഇടീൽ · ₹1,400 (നൽകി)',
              },
            ].map((w) => (
              <div key={w.phone} className="rounded-2xl border border-[#E5E7EB] bg-white p-3.5">
                <h4 className="text-sm font-bold text-[#0F172A]">
                  {lang === 'ml' ? w.nameMl : w.nameEn}
                </h4>
                <p className="mt-0.5 text-xs text-[#64748B]">{w.area} · ★★★★★</p>
                <p className="mt-2 text-xs font-medium text-[#0F172A] bg-[#F3F4F6] rounded-lg px-2.5 py-1.5">
                  {lang === 'ml' ? w.lastWorkMl : w.lastWorkEn}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <a
                    href={`tel:${w.phone}`}
                    className="flex-1 inline-flex min-h-[40px] items-center justify-center gap-1 rounded-full bg-[#EA4C46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D43B35] whitespace-nowrap"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    <span>{lang === 'ml' ? 'വിളിക്കുക' : 'Call'}</span>
                  </a>
                  <a
                    href={`https://wa.me/${w.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex min-h-[40px] items-center justify-center gap-1 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-[#F3F4F6] whitespace-nowrap"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Kerala Household Modules (NRI Request, Kuri, Construction, Helper Ledger) */}
        {activeTab === 'kerala' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#EA4C46]">
                  {lang === 'ml' ? 'പ്രവാസി സൗകര്യം · NRI Request' : 'NRI Remote Document Request'}
                </span>
                <span className="font-mono-tabular text-xs text-[#64748B]">Dubai → Kochi</span>
              </div>
              <h4 className="mt-1 text-sm font-bold text-[#0F172A]">
                {lang === 'ml'
                  ? 'അച്ഛനോട് ഭൂനികുതി രസിത് അപ്‌ലോഡ് ചെയ്യാൻ അഭ്യർത്ഥിക്കുക'
                  : 'Request 2026 Possession Certificate from Parents'}
              </h4>
              <button
                type="button"
                onClick={() => setNriRequested(true)}
                className="mt-3 w-full min-h-[40px] rounded-full bg-[#EA4C46] px-3 py-2 text-xs font-semibold text-white hover:bg-[#D43B35] cursor-pointer"
              >
                {nriRequested
                  ? lang === 'ml'
                    ? '✓ അച്ഛന്റെ ഫോണിലേക്ക് അപ്‌ലോഡ് ലിങ്ക് അയച്ചു'
                    : '✓ 1-Tap Upload Link Sent to Father’s Phone'
                  : lang === 'ml'
                  ? 'ഒറ്റ ക്ലിക്കിൽ രേഖ ആവശ്യപ്പെടുക'
                  : 'Send 1-Tap Document Request'}
              </button>
            </div>

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#0F172A]">
                  {lang === 'ml' ? 'KSFE ഭദ്രത കുറി #42 (Edappally)' : 'KSFE Bhadratha Kuri #42'}
                </h4>
                <span className="font-mono-tabular text-xs font-bold text-[#EA4C46]">
                  {kuriPaidCount}/40 {lang === 'ml' ? 'മാസം' : 'mos'}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#64748B] font-mono-tabular">
                {lang === 'ml'
                  ? 'മാസ തവണ: ₹10,000 · അടുത്ത തീയതി: 05 നവംബർ 2026'
                  : 'Installment: ₹10,000/mo · Next due: 05 Nov 2026'}
              </p>
              <button
                type="button"
                onClick={() => setKuriPaidCount((c) => Math.min(40, c + 1))}
                className="mt-3 w-full min-h-[40px] rounded-full bg-[#141416] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F172A] cursor-pointer"
              >
                {lang === 'ml'
                  ? '+ ഈ മാസത്തെ കുറി അടച്ചതായി രേഖപ്പെടുത്തുക'
                  : '+ Log Monthly Kuri Installment Paid'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
