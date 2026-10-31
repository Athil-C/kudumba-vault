import React, { useState } from 'react';
import {
  Phone,
  MessageCircle,
  Plus,
  Wrench,
  HardHat,
  Zap,
  Droplet,
  Snowflake,
  Trees,
  Hammer,
  Car,
  Star,
  MapPin,
  Search,
  Copy,
  Check,
  MoreHorizontal,
  Bell,
  Trash2,
  CheckCircle2,
  Clock,
  Calendar,
  Contact,
} from 'lucide-react';
import {
  Language,
  WorkerRecordItem,
  WorkerHistoryEntry,
  formatHumanDate,
  formatINR,
} from '../../types/vault';
import { Button, EmptyState } from '../ui/DesignSystem';

export const renderTradeIcon = (iconName?: string, className = 'w-4 h-4') => {
  switch (iconName) {
    case 'Zap':
      return <Zap className={className} />;
    case 'Droplet':
      return <Droplet className={className} />;
    case 'Snowflake':
      return <Snowflake className={className} />;
    case 'Trees':
      return <Trees className={className} />;
    case 'Hammer':
      return <Hammer className={className} />;
    case 'Car':
      return <Car className={className} />;
    default:
      return <Wrench className={className} />;
  }
};

const getWorkerIconName = (w: WorkerRecordItem): string => {
  if (w.iconName) return w.iconName;
  const trade = (w.tradeId || w.tradeEn || w.roleEn || '').toUpperCase();
  if (trade.includes('ELECTR')) return 'Zap';
  if (trade.includes('PLUMB')) return 'Droplet';
  if (trade.includes('AC') || trade.includes('INVERTER')) return 'Snowflake';
  if (trade.includes('COCO') || trade.includes('GARDEN')) return 'Trees';
  if (trade.includes('CARPEN')) return 'Hammer';
  if (trade.includes('DRIV')) return 'Car';
  return 'Wrench';
};

export interface WorkersBookScreenProps {
  lang: Language;
  workers: WorkerRecordItem[];
  searchQuery?: string;
  onOpenAddWorker: () => void;
  onAddLog: (workerId: string, entry: WorkerHistoryEntry) => void;
  onUpdateWorker: (worker: WorkerRecordItem) => void;
  onDeleteWorker: (workerId: string) => void;
  onCreateServiceReminder?: (
    worker: WorkerRecordItem,
    entry: WorkerHistoryEntry
  ) => void;
}

export const WorkersBookScreen: React.FC<WorkersBookScreenProps> = ({
  lang,
  workers,
  searchQuery = '',
  onOpenAddWorker,
  onAddLog,
  onUpdateWorker,
  onCreateServiceReminder,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'FAVOURITES'>(
    'ALL'
  );
  const [selectedArea, setSelectedArea] = useState<string>('ALL');
  const [localSearch, setLocalSearch] = useState<string>('');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(
    workers[0]?.id || ''
  );

  // Copy feedback
  const [copiedPhone, setCopiedPhone] = useState(false);

  // History item overflow menu
  const [openHistoryMenuId, setOpenHistoryMenuId] = useState<string | null>(
    null
  );

  // Expandable New Work Log state
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [workText, setWorkText] = useState('');
  const [workAmount, setWorkAmount] = useState('');
  const [workDate, setWorkDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [workPaid, setWorkPaid] = useState(true);
  const [logError, setLogError] = useState('');

  // Unique localities for area dropdown
  const uniqueAreas = Array.from(
    new Set(workers.map((w) => w.areaEn).filter(Boolean))
  );

  const favCount = workers.filter((w) => w.favourite).length;

  // Combined search + filter
  const effectiveQuery = (localSearch || searchQuery).trim().toLowerCase();
  const filteredWorkers = workers.filter((w) => {
    if (selectedFilter === 'FAVOURITES' && !w.favourite) return false;
    if (selectedArea !== 'ALL' && w.areaEn !== selectedArea) return false;
    if (!effectiveQuery) return true;
    const tradeEn = w.tradeEn || w.roleEn || '';
    const tradeMl = w.tradeMl || w.roleMl || '';
    return (
      w.nameEn.toLowerCase().includes(effectiveQuery) ||
      w.nameMl.toLowerCase().includes(effectiveQuery) ||
      tradeEn.toLowerCase().includes(effectiveQuery) ||
      tradeMl.toLowerCase().includes(effectiveQuery) ||
      w.areaEn.toLowerCase().includes(effectiveQuery) ||
      w.areaMl.toLowerCase().includes(effectiveQuery) ||
      w.phone.toLowerCase().includes(effectiveQuery)
    );
  });

  const activeWorker =
    filteredWorkers.find((w) => w.id === selectedWorkerId) ||
    filteredWorkers[0] ||
    null;

  const handleCopyPhone = (phoneStr: string) => {
    navigator.clipboard?.writeText(phoneStr).catch(() => {});
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleSaveLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorker) return;
    if (!workText.trim()) {
      setLogError(
        lang === 'ml'
          ? 'ചെയ്ത ജോലി രേഖപ്പെടുത്തുക'
          : 'Please describe the work done'
      );
      return;
    }
    const cleanAmount = Number(workAmount.replace(/[^0-9.]/g, '')) || 0;
    const newEntry: WorkerHistoryEntry = {
      id: `wh-${Date.now()}`,
      date: workDate || new Date().toISOString().slice(0, 10),
      workEn: workText.trim(),
      workMl: workText.trim(),
      amount: cleanAmount,
      paid: workPaid,
    };
    onAddLog(activeWorker.id, newEntry);
    setWorkText('');
    setWorkAmount('');
    setWorkDate(new Date().toISOString().slice(0, 10));
    setWorkPaid(true);
    setLogError('');
    setIsLogExpanded(false);
  };

  const handleDeleteHistoryItem = (entryId: string) => {
    if (!activeWorker) return;
    onUpdateWorker({
      ...activeWorker,
      history: activeWorker.history.filter((h) => h.id !== entryId),
    });
    setOpenHistoryMenuId(null);
  };

  const handleToggleHistoryPaid = (entryId: string) => {
    if (!activeWorker) return;
    onUpdateWorker({
      ...activeWorker,
      history: activeWorker.history.map((h) =>
        h.id === entryId ? { ...h, paid: !h.paid } : h
      ),
    });
    setOpenHistoryMenuId(null);
  };

  const getNextYearMonthLabel = (isoDate: string) => {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) {
      return lang === 'ml'
        ? 'അടുത്ത വർഷം ഓർമ്മിപ്പിക്കുക'
        : 'Remind me next year';
    }
    const monthName = d.toLocaleDateString(lang === 'ml' ? 'ml-IN' : 'en-IN', {
      month: 'long',
    });
    return lang === 'ml'
      ? `അടുത്ത ${monthName} മാസത്തിൽ ഓർമ്മിപ്പിക്കുക`
      : `Remind me next ${monthName}`;
  };

  const formatRateUnitShort = (unit?: string) => {
    const u = (unit || 'per visit').replace(/^per\s+/i, '');
    if (lang === 'ml') {
      if (u === 'visit') return 'സന്ദർശനം';
      if (u === 'day') return 'ദിവസം';
      return 'ജോലി';
    }
    return u;
  };

  return (
    <div className="space-y-5">
      {/* Top Action & Filter Row: Filter buttons on Left, "+ Add Worker" on Right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSelectedFilter('ALL')}
            className={`spring-interactive inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold cursor-pointer transition-colors ${
              selectedFilter === 'ALL'
                ? 'bg-[#E03A45] text-white shadow-2xs'
                : 'bg-[#F4F5F7] text-[#5B6168] border border-[#E6E8EC] hover:text-[#0B0B0C]'
            }`}
          >
            <span>{lang === 'ml' ? 'എല്ലാവരും' : 'All Workers'}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                selectedFilter === 'ALL'
                  ? 'bg-white/25 text-white'
                  : 'bg-white text-[#5B6168]'
              }`}
            >
              {workers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFilter('FAVOURITES')}
            className={`spring-interactive inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold cursor-pointer transition-colors ${
              selectedFilter === 'FAVOURITES'
                ? 'bg-[#E03A45] text-white shadow-2xs'
                : 'bg-[#F4F5F7] text-[#5B6168] border border-[#E6E8EC] hover:text-[#0B0B0C]'
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${
                selectedFilter === 'FAVOURITES'
                  ? 'fill-white text-white'
                  : 'fill-[#5B6168] text-[#5B6168]'
              }`}
            />
            <span>{lang === 'ml' ? 'പ്രിയപ്പെട്ടവർ' : 'Favourites'}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                selectedFilter === 'FAVOURITES'
                  ? 'bg-white/25 text-white'
                  : 'bg-white text-[#5B6168]'
              }`}
            >
              {favCount}
            </span>
          </button>
        </div>

        {/* Primary "+ Add Worker" Action Button */}
        <button
          type="button"
          onClick={onOpenAddWorker}
          className="spring-interactive inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#E03A45] hover:bg-[#C42F3A] px-4 sm:px-5 text-[13px] sm:text-[14px] font-bold text-white shadow-xs cursor-pointer transition-colors shrink-0 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4 stroke-[2.4]" />
          <span className="font-malayalam">
            {lang === 'ml' ? 'പുതിയ ജോലിക്കാരൻ' : 'Add Worker'}
          </span>
        </button>
      </div>

      {/* Master-Detail Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: Scoped Search + Area Filter + Worker Cards */}
        <div className="lg:col-span-5 space-y-3.5">
          {/* Scoped Search & Area Filter Bar */}
          <div className="bg-white rounded-[20px] p-2.5 border border-[#E6E8EC] flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#5B6168] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder={
                  lang === 'ml'
                    ? 'പേര്, ജോലി, സ്ഥലം എന്നിവ തിരയുക...'
                    : 'Filter workers by name, trade or area...'
                }
                aria-label="Filter workers by name, trade or area"
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#F4F5F7] border border-transparent text-sm font-normal text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#E6E8EC] focus:bg-white"
              />
            </div>

            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              aria-label="Filter by area"
              className="h-10 px-3 rounded-xl bg-[#F4F5F7] border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] focus:outline-none cursor-pointer"
            >
              <option value="ALL">
                {lang === 'ml' ? 'എല്ലാ സ്ഥലങ്ങളും' : 'All Areas'}
              </option>
              {uniqueAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* Worker List Cards */}
          {filteredWorkers.length === 0 ? (
            <EmptyState
              icon={HardHat}
              title={
                lang === 'ml'
                  ? 'ജോലിക്കാരെ കണ്ടെത്തിയില്ല'
                  : 'No matching workers found'
              }
              subtitle={
                lang === 'ml'
                  ? 'മറ്റൊരു പേരോ സ്ഥലമോ തിരയുക.'
                  : 'Try clearing the filter or add a trusted worker.'
              }
              ctaLabel={
                lang === 'ml'
                  ? '+ ജോലിക്കാരനെ ചേർക്കുക'
                  : '+ Add Trusted Worker'
              }
              onCta={onOpenAddWorker}
            />
          ) : (
            <div className="space-y-3">
              {filteredWorkers.map((w) => {
                const isSelected = activeWorker?.id === w.id;
                const lastDate =
                  w.history[0]?.date || w.lastVisit || w.lastServiceDate;
                const cleanPhone = `${w.countryCode || '+91'}${w.phone.replace(/\D/g, '').slice(-10)}`;
                const waDigits = (w.whatsapp || cleanPhone).replace(/\D/g, '');
                const iconName = getWorkerIconName(w);
                const tradeLabel =
                  lang === 'ml'
                    ? w.tradeMl || w.roleMl || 'ജോലിക്കാരൻ'
                    : w.tradeEn || w.roleEn || 'Worker';

                return (
                  <div
                    key={w.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedWorkerId(w.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedWorkerId(w.id);
                      }
                    }}
                    className={`rounded-[20px] p-4 transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-[#FFF5F5] border-[#E03A45] shadow-2xs'
                        : 'bg-white border-[#E6E8EC] hover:border-[#0B0B0C]/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-[#E03A45] text-white'
                              : 'bg-[#F4F5F7] text-[#E03A45] border border-[#E6E8EC]'
                          }`}
                        >
                          <Contact className="w-4 h-4" />
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-[13px] font-bold text-[#0B0B0C] truncate font-malayalam tracking-tight">
                            {lang === 'ml' ? w.nameMl : w.nameEn}
                          </h3>

                          <p className="text-[11px] font-medium text-[#5B6168] flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="w-3 h-3 text-[#E03A45] shrink-0" />
                            <span className="truncate font-malayalam">
                              {lang === 'ml' ? w.areaMl : w.areaEn}
                            </span>
                          </p>

                          <div className="mt-1.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold border ${
                                isSelected
                                  ? 'bg-white text-[#E03A45] border-[#E6E8EC]'
                                  : 'bg-[#F4F5F7] text-[#E03A45] border-[#E6E8EC]'
                              }`}
                            >
                              {renderTradeIcon(iconName, 'w-3 h-3')}
                              <span className="font-malayalam">
                                {tradeLabel}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Action Buttons: Call & WhatsApp ONLY */}
                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={`tel:${cleanPhone}`}
                          aria-label={`Call ${w.nameEn}`}
                          title={lang === 'ml' ? 'വിളിക്കുക' : 'Call'}
                          className="w-9 h-9 rounded-xl bg-[#E03A45] text-white flex items-center justify-center hover:bg-[#C42F3A] transition-colors"
                        >
                          <Phone className="w-4 h-4" />
                        </a>

                        <a
                          href={`https://wa.me/${waDigits}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp ${w.nameEn}`}
                          title="WhatsApp"
                          className="w-9 h-9 rounded-xl bg-[#0F7B3E] text-white flex items-center justify-center hover:opacity-95 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      </div>
                    </div>

                    {/* Bottom Divider Metadata Line */}
                    <div className="mt-3.5 pt-2.5 border-t border-[#E6E8EC] flex items-center justify-between gap-2 text-xs text-[#5B6168]">
                      <span className="font-medium tabular-nums">
                        {formatINR(w.rateAmount || 400)} /{' '}
                        {formatRateUnitShort(w.rateUnit)}
                      </span>
                      <span className="tabular-nums">
                        {lang === 'ml' ? 'അവസാന ജോലി: ' : 'Last worked: '}
                        <strong className="font-bold text-[#0B0B0C]">
                          {formatHumanDate(lastDate, lang)}
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Quick Add Worker Dashed Action Card */}
              <button
                type="button"
                onClick={onOpenAddWorker}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-[#E6E8EC] bg-white/60 text-[#5B6168] hover:border-[#E03A45] hover:bg-[#FFF5F5] hover:text-[#E03A45] transition-all cursor-pointer text-[13px] font-bold font-malayalam"
              >
                <Plus className="w-4 h-4 stroke-[2.4]" />
                <span>
                  {lang === 'ml'
                    ? '+ പുതിയ ജോലിക്കാരനെ ചേർക്കുക'
                    : '+ Add Trusted Worker'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Worker Detail */}
        <div className="lg:col-span-7">
          {activeWorker ? (
            <div className="bg-white rounded-[24px] border border-[#E6E8EC] p-6 sm:p-7 space-y-6">
              {/* Top Meta + Name + Phone/Copy Row */}
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 bg-[#F4F5F7] text-[#E03A45] px-3 py-1 rounded-lg text-xs font-bold border border-[#E6E8EC]">
                    {renderTradeIcon(
                      getWorkerIconName(activeWorker),
                      'w-3.5 h-3.5'
                    )}
                    <span className="font-malayalam">
                      {lang === 'ml'
                        ? activeWorker.tradeMl || activeWorker.roleMl
                        : activeWorker.tradeEn || activeWorker.roleEn}
                    </span>
                  </span>

                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#5B6168]">
                    <MapPin className="w-3.5 h-3.5 text-[#E03A45]" />
                    <span className="font-malayalam">
                      {lang === 'ml'
                        ? activeWorker.areaMl
                        : activeWorker.areaEn}
                    </span>
                  </span>
                </div>

                <h2 className="text-[18px] sm:text-[20px] font-bold text-[#0B0B0C] mt-2.5 font-malayalam tracking-tight">
                  {lang === 'ml' ? activeWorker.nameMl : activeWorker.nameEn}
                </h2>

                {/* Phone + Copy + Alt Phone Row */}
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <a
                    href={`tel:${activeWorker.phone.replace(/\s+/g, '')}`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#E03A45] hover:underline tabular-nums"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>
                      {activeWorker.phone.startsWith('+')
                        ? activeWorker.phone
                        : `${activeWorker.countryCode || '+91'} ${activeWorker.phone}`}
                    </span>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleCopyPhone(activeWorker.phone)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F4F5F7] hover:bg-[#E6E8EC] border border-[#E6E8EC] text-[11px] font-bold text-[#0B0B0C] transition-colors cursor-pointer"
                  >
                    {copiedPhone ? (
                      <>
                        <Check className="w-3 h-3 text-[#0F7B3E]" />
                        <span>{lang === 'ml' ? 'കോപ്പി ചെയ്തു' : 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-[#5B6168]" />
                        <span>{lang === 'ml' ? 'കോപ്പി' : 'Copy'}</span>
                      </>
                    )}
                  </button>

                  {activeWorker.altPhone && (
                    <a
                      href={`tel:${activeWorker.altPhone.replace(/\s+/g, '')}`}
                      className="text-[11px] font-medium text-[#5B6168] underline hover:text-[#0B0B0C] tabular-nums"
                    >
                      Alt: {activeWorker.altPhone}
                    </a>
                  )}
                </div>
              </div>

              {/* 4-Metric Summary Strip */}
              {(() => {
                const jobsDone = activeWorker.history.length;
                const totalSpent = activeWorker.history.reduce(
                  (sum, h) => sum + (h.amount || 0),
                  0
                );
                const unpaidTotal = activeWorker.history
                  .filter((h) => !h.paid)
                  .reduce((sum, h) => sum + (h.amount || 0), 0);
                const lastVisitDate =
                  activeWorker.history[0]?.date ||
                  activeWorker.lastVisit ||
                  activeWorker.lastServiceDate;

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-[#F4F5F7] rounded-xl p-3 border border-[#E6E8EC]">
                      <p className="text-[11px] font-medium text-[#5B6168]">
                        {lang === 'ml' ? 'ആകെ ജോലികൾ' : 'Jobs done'}
                      </p>
                      <p className="text-[15px] font-bold text-[#0B0B0C] mt-0.5 tabular-nums tracking-tight">
                        {jobsDone}
                      </p>
                    </div>

                    <div className="bg-[#F4F5F7] rounded-xl p-3 border border-[#E6E8EC]">
                      <p className="text-[11px] font-medium text-[#5B6168]">
                        {lang === 'ml' ? 'ആകെ നൽകിയത്' : 'Total spent'}
                      </p>
                      <p className="text-[15px] font-bold text-[#0B0B0C] mt-0.5 tabular-nums tracking-tight">
                        {formatINR(totalSpent)}
                      </p>
                    </div>

                    <div className="bg-[#F4F5F7] rounded-xl p-3 border border-[#E6E8EC]">
                      <p className="text-[11px] font-medium text-[#5B6168]">
                        {lang === 'ml' ? 'ബാക്കി നൽകാൻ' : 'Pending balance'}
                      </p>
                      <p
                        className={`text-[15px] font-bold mt-0.5 tabular-nums tracking-tight ${
                          unpaidTotal > 0 ? 'text-[#A85A00]' : 'text-[#0B0B0C]'
                        }`}
                      >
                        {formatINR(unpaidTotal)}
                      </p>
                    </div>

                    <div className="bg-[#F4F5F7] rounded-xl p-3 border border-[#E6E8EC]">
                      <p className="text-[11px] font-medium text-[#5B6168]">
                        {lang === 'ml' ? 'അവസാന സന്ദർശനം' : 'Last visit'}
                      </p>
                      <p className="text-[13px] font-bold text-[#0B0B0C] mt-0.5 tabular-nums tracking-tight truncate">
                        {formatHumanDate(lastVisitDate, lang)}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Record New Work & Payment Box */}
              <div className="bg-[#F4F5F7] rounded-2xl p-4 sm:p-5 border border-[#E6E8EC]">
                <h3 className="text-sm font-bold text-[#0B0B0C] mb-3">
                  {lang === 'ml'
                    ? 'പുതിയ ജോലി / തുക ചേർക്കുക'
                    : 'Record New Work & Payment'}
                </h3>

                {!isLogExpanded ? (
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={workText}
                      onFocus={() => setIsLogExpanded(true)}
                      onChange={(e) => {
                        setWorkText(e.target.value);
                        if (!isLogExpanded) setIsLogExpanded(true);
                      }}
                      placeholder={
                        lang === 'ml'
                          ? 'എന്ത് ജോലിയാണ് ചെയ്തത്? (ഉദാ: മോട്ടോർ നന്നാക്കി)'
                          : 'What work was done? (e.g., Replaced capacitor & cleaned filter)'
                      }
                      className="flex-1 h-11 px-4 rounded-xl bg-white border border-[#E6E8EC] text-sm font-normal text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#E03A45]"
                    />
                    <button
                      type="button"
                      onClick={() => setIsLogExpanded(true)}
                      className="spring-interactive inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#E03A45] px-5 text-sm font-bold text-white hover:bg-[#C42F3A] cursor-pointer shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{lang === 'ml' ? 'ചേർക്കുക' : 'Add Log'}</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSaveLog} className="space-y-3.5">
                    <div>
                      <input
                        type="text"
                        value={workText}
                        onChange={(e) => {
                          setWorkText(e.target.value);
                          setLogError('');
                        }}
                        placeholder={
                          lang === 'ml'
                            ? 'ഉദാ: ഇൻവെർട്ടർ ബാറ്ററി സർവീസും എംസിബി മാറ്റലും'
                            : 'e.g., Inverter battery water top-up & MCB replacement'
                        }
                        className="w-full h-11 px-4 rounded-xl bg-white border border-[#E6E8EC] text-sm font-normal text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#E03A45]"
                      />
                      {logError && (
                        <p className="text-xs text-[#B3121F] mt-1">{logError}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#5B6168] mb-1">
                          {lang === 'ml' ? 'തുക (₹)' : 'Amount (₹)'}
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={workAmount}
                          onChange={(e) => setWorkAmount(e.target.value)}
                          placeholder="e.g., 850"
                          className="w-full h-10 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#E03A45]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#5B6168] mb-1">
                          {lang === 'ml' ? 'തീയതി' : 'Date'}
                        </label>
                        <input
                          type="date"
                          value={workDate}
                          onChange={(e) => setWorkDate(e.target.value)}
                          className="w-full h-10 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm text-[#0B0B0C] focus:outline-none focus:border-[#E03A45]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#5B6168] mb-1">
                          {lang === 'ml' ? 'പേയ്മെന്റ് നില' : 'Payment Status'}
                        </label>
                        <div className="grid grid-cols-2 gap-1.5 h-10">
                          <button
                            type="button"
                            onClick={() => setWorkPaid(true)}
                            className={`rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              workPaid
                                ? 'bg-[#E4F7EC] text-[#0F7B3E] border-[#0F7B3E]'
                                : 'bg-white text-[#5B6168] border-[#E6E8EC]'
                            }`}
                          >
                            {lang === 'ml' ? 'നൽകി' : 'Paid'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setWorkPaid(false)}
                            className={`rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              !workPaid
                                ? 'bg-[#FFF4D6] text-[#A85A00] border-[#A85A00]'
                                : 'bg-white text-[#5B6168] border-[#E6E8EC]'
                            }`}
                          >
                            {lang === 'ml' ? 'ബാക്കി' : 'Unpaid'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsLogExpanded(false);
                          setLogError('');
                        }}
                      >
                        {lang === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
                      </Button>
                      <Button type="submit" variant="primary" size="sm">
                        <Plus className="w-4 h-4" />
                        {lang === 'ml' ? 'രേഖപ്പെടുത്തുക' : 'Save Entry'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>

              {/* Service & Payment History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#0B0B0C]">
                    {lang === 'ml'
                      ? 'മുൻകാല ജോലികളും പേയ്മെന്റുകളും'
                      : 'Service & Payment History'}
                  </h3>
                  <span className="text-xs font-medium text-[#5B6168] tabular-nums">
                    {activeWorker.history.length}{' '}
                    {lang === 'ml' ? 'രേഖകൾ' : 'records'}
                  </span>
                </div>

                <div className="space-y-3">
                  {activeWorker.history.map((h) => (
                    <div
                      key={h.id}
                      className="bg-[#F4F5F7] rounded-2xl p-4 border border-[#E6E8EC] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm sm:text-base font-bold text-[#0B0B0C] font-malayalam">
                            {lang === 'ml' ? h.workMl : h.workEn}
                          </p>

                          <div className="flex items-center gap-1.5 mt-1.5 text-xs font-medium text-[#5B6168] tabular-nums">
                            <Calendar className="w-3.5 h-3.5 text-[#E03A45]" />
                            <span>{formatHumanDate(h.date, lang)}</span>
                          </div>

                          {/* Annual Service Reminder Trigger */}
                          {onCreateServiceReminder && (
                            <div className="mt-2.5">
                              {h.reminderCreated ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F7B3E]">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>
                                    {lang === 'ml'
                                      ? 'വാർഷിക ഓർമ്മപ്പെടുത്തൽ വോൾട്ടിൽ ചേർത്തു'
                                      : 'Reminder saved to Vault'}
                                  </span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCreateServiceReminder(activeWorker, h)
                                  }
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E03A45] hover:underline cursor-pointer"
                                >
                                  <Bell className="w-3.5 h-3.5" />
                                  <span>{getNextYearMonthLabel(h.date)}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-base font-extrabold text-[#0B0B0C] tabular-nums">
                            {formatINR(h.amount)}
                          </span>

                          {h.paid ? (
                            <span className="inline-flex items-center gap-1 bg-[#E4F7EC] text-[#0F7B3E] border border-[#0F7B3E]/20 px-2.5 py-1 rounded-full text-xs font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{lang === 'ml' ? 'നൽകി' : 'Paid'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-[#FFF4D6] text-[#A85A00] border border-[#A85A00]/25 px-2.5 py-1 rounded-full text-xs font-bold">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{lang === 'ml' ? 'ബാക്കി' : 'Unpaid'}</span>
                            </span>
                          )}

                          {/* History Item Actions Menu */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenHistoryMenuId(
                                  openHistoryMenuId === h.id ? null : h.id
                                )
                              }
                              aria-label="History entry options"
                              className="w-8 h-8 rounded-lg bg-white border border-[#E6E8EC] flex items-center justify-center text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {openHistoryMenuId === h.id && (
                              <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl border border-[#E6E8EC] shadow-lg py-1 z-20">
                                <button
                                  type="button"
                                  onClick={() => handleToggleHistoryPaid(h.id)}
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-[#0B0B0C] hover:bg-[#F4F5F7] flex items-center gap-2 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#0F7B3E]" />
                                  {h.paid
                                    ? lang === 'ml'
                                      ? 'ബാക്കിയായി മാറ്റുക'
                                      : 'Mark as Unpaid'
                                    : lang === 'ml'
                                    ? 'നൽകിയതായി മാറ്റുക'
                                    : 'Mark as Paid'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHistoryItem(h.id)}
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-[#B3121F] hover:bg-[#FDECEE] flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  {lang === 'ml'
                                    ? 'ഇത് നീക്കം ചെയ്യുക'
                                    : 'Delete Entry'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
