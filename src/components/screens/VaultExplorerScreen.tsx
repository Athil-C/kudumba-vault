import React, { useState } from 'react';
import {
  FileText,
  Plus,
  ChevronRight,
  Star,
  FolderLock,
  Layers,
  Heart,
} from 'lucide-react';
import { Chip, StatusBadge, EmptyState } from '../ui/DesignSystem';
import { VaultDocumentItem, formatHumanDate } from '../../types/vault';
import { maskSensitiveNumber } from '../../utils/vaultLogic';
import { CategoryMetaItem } from './HomeDashboardScreen';

export interface VaultExplorerScreenProps {
  lang: 'ml' | 'en';
  filteredDocs: VaultDocumentItem[];
  categories: CategoryMetaItem[];
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
  onOpenDocDetail: (doc: VaultDocumentItem) => void;
  onOpenAddDoc: () => void;
}

const CATEGORY_SUBTITLES: Record<string, { en: string; ml: string }> = {
  ALL: { en: 'All documents in vault', ml: 'വോൾട്ടിലെ എല്ലാ രേഖകളും' },
  IDENTITY: { en: 'Aadhaar, PAN, Passport, etc.', ml: 'ആധാർ, പാൻ, പാസ്‌പോർട്ട് മുതലായവ' },
  GULF: { en: 'Visa, Emirates ID, Work documents', ml: 'വിസ, എമിറേറ്റ്സ് ഐഡി, വർക്ക് പെർമിറ്റ്' },
  VEHICLE: { en: 'RC, Driving License, Insurance', ml: 'ആർസി ബുക്ക്, ഡ്രൈവിംഗ് ലൈസൻസ്, ഇൻഷുറൻസ്' },
  PROPERTY: { en: 'Land documents, Sale deeds, etc.', ml: 'ആധാരം, കരമടച്ച രസീത്, പട്ടയം' },
  HEALTH: { en: 'Medical reports, Insurance policies', ml: 'മെഡിക്കൽ റിപ്പോർട്ടുകൾ, ആരോഗ്യ ഇൻഷുറൻസ്' },
  EDUCATION: { en: 'Certificates, Mark sheets', ml: 'സർട്ടിഫിക്കറ്റുകൾ, മാർക്ക് ലിസ്റ്റുകൾ' },
  FINANCE: { en: 'Bank statements, Loan documents', ml: 'ബാങ്ക് സ്റ്റേറ്റ്മെന്റുകൾ, വായ്പ രേഖകൾ' },
  OTHERS: { en: 'Other important documents', ml: 'മറ്റ് പ്രധാന രേഖകൾ' },
};

export const VaultExplorerScreen: React.FC<VaultExplorerScreenProps> = ({
  lang,
  filteredDocs,
  categories,
  selectedCategory,
  onSelectCategory,
  onOpenDocDetail,
  onOpenAddDoc,
}) => {
  // Mobile Top Tab: 'all' | 'categories' | 'favourites'
  const [vaultTab, setVaultTab] = useState<'all' | 'categories' | 'favourites'>('all');

  const displayedDocs =
    vaultTab === 'favourites'
      ? filteredDocs.filter((d) => d.status === 'VALID') // Favourites or healthy
      : filteredDocs;

  return (
    <div className="space-y-5 pb-8 animate-in fade-in duration-150">
      {/* Top Filter Pills Row & Add Document action */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
          <button
            type="button"
            onClick={() => {
              setVaultTab('all');
              onSelectCategory('ALL');
            }}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              vaultTab === 'all' && selectedCategory === 'ALL'
                ? 'bg-[#E03A45] text-white shadow-xs'
                : 'bg-white border border-[#E5E7EB] text-[#64748B] hover:border-[#CBD5E1]'
            }`}
          >
            {lang === 'ml' ? 'എല്ലാം' : 'All'}
          </button>

          <button
            type="button"
            onClick={() => setVaultTab('categories')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              vaultTab === 'categories'
                ? 'bg-[#E03A45] text-white shadow-xs'
                : 'bg-white border border-[#E5E7EB] text-[#64748B] hover:border-[#CBD5E1]'
            }`}
          >
            {lang === 'ml' ? 'വിഭാഗങ്ങൾ' : 'Categories'}
          </button>

          <button
            type="button"
            onClick={() => setVaultTab('favourites')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              vaultTab === 'favourites'
                ? 'bg-[#E03A45] text-white shadow-xs'
                : 'bg-white border border-[#E5E7EB] text-[#64748B] hover:border-[#CBD5E1]'
            }`}
          >
            {lang === 'ml' ? 'പ്രിയപ്പെട്ടവ' : 'Favourites'}
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenAddDoc}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#E03A45] hover:bg-[#C42F3A] text-white text-xs font-bold shadow-xs cursor-pointer transition-all shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>{lang === 'ml' ? 'രേഖ ചേർക്കുക' : 'Add Document'}</span>
        </button>
      </div>

      {/* SCREEN 2 VIEW: Vertically Stacked Category Cards (When 'Categories' tab is active) */}
      {vaultTab === 'categories' ? (
        <div className="space-y-2.5">
          {categories
            .filter((cat) => cat.id !== 'ALL')
            .map((cat) => {
              const Icon = cat.icon;
              const sub = CATEGORY_SUBTITLES[cat.id] || { en: 'Documents', ml: 'രേഖകൾ' };

              return (
                <div
                  key={cat.id}
                  onClick={() => {
                    onSelectCategory(cat.id);
                    setVaultTab('all');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectCategory(cat.id);
                      setVaultTab('all');
                    }
                  }}
                  className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-[#E5E7EB] bg-white hover:border-[#E03A45] hover:shadow-xs transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#FFF0F1] text-[#E03A45] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-[#111827] truncate font-malayalam">
                        {lang === 'ml' ? cat.ml : cat.en}
                      </h4>
                      <p className="text-[11px] text-[#64748B] truncate mt-0.5 font-malayalam">
                        {lang === 'ml' ? sub.ml : sub.en}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#64748B] shrink-0">
                    <span className="tabular-nums font-mono-tabular text-sm text-[#111827]">
                      {cat.count}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                  </div>
                </div>
              );
            })}

          {/* Add Document button at bottom of categories */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={onOpenAddDoc}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#E03A45] hover:text-[#C42F3A] cursor-pointer py-2 px-4 transition-colors"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>{lang === 'ml' ? 'രേഖ ചേർക്കുക' : 'Add Document'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* SCREEN 4 VIEW: Documents List (When 'All' or 'Favourites' tab is active) */
        <div className="space-y-4">
          {/* Sub-category filter pills when viewing documents */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <Chip
                key={cat.id}
                label={lang === 'ml' ? cat.ml : cat.en}
                count={cat.count}
                active={selectedCategory === cat.id}
                onClick={() => onSelectCategory(cat.id)}
              />
            ))}
          </div>

          {/* Empty State vs Document Cards */}
          {displayedDocs.length === 0 ? (
            <EmptyState
              title={
                selectedCategory === 'ALL'
                  ? lang === 'ml'
                    ? 'വോൾട്ടിൽ രേഖകളൊന്നും ചേർത്തിട്ടില്ല'
                    : 'Your Vault is Empty'
                  : lang === 'ml'
                  ? 'ഈ വിഭാഗത്തിൽ രേഖകളില്ല'
                  : 'No documents in this category'
              }
              subtitle={
                selectedCategory === 'ALL'
                  ? lang === 'ml'
                    ? 'പാസ്‌പോർട്ട്, തിരിച്ചറിയൽ കാർഡുകൾ, ഇൻഷുറൻസ് പോളിസികൾ 3 ടാപ്പിൽ സുരക്ഷിതമായി സൂക്ഷിക്കുക.'
                    : 'Upload or scan your household documents in 3 taps.'
                  : lang === 'ml'
                  ? 'മറ്റൊരു വിഭാഗം തിരഞ്ഞെടുക്കുകയോ പുതിയ രേഖ ചേർക്കുകയോ ചെയ്യുക.'
                  : 'Select another category or add a new document.'
              }
              ctaLabel={lang === 'ml' ? '+ രേഖ ചേർക്കുക' : '+ Add Document'}
              onCta={onOpenAddDoc}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {displayedDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onOpenDocDetail(doc)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onOpenDocDetail(doc);
                  }}
                  className="rounded-[22px] border border-[#E5E7EB] bg-white p-4 sm:p-5 hover:border-[#E03A45] hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between gap-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {doc.fileDataUrl ? (
                        <img
                          src={doc.fileDataUrl}
                          alt={doc.titleEn}
                          className="h-11 w-11 shrink-0 rounded-xl object-cover border border-[#E5E7EB]"
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF0F1] text-[#E03A45] border border-[#FEE2E2]">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-xs text-[#64748B] block truncate font-malayalam font-medium">
                          {lang === 'ml' ? doc.subMl : doc.subEn} •{' '}
                          {lang === 'ml' ? doc.ownerMl : doc.ownerEn}
                        </span>
                        <h3 className="text-sm font-bold text-[#111827] truncate font-malayalam mt-0.5">
                          {lang === 'ml' ? doc.titleMl : doc.titleEn}
                        </h3>
                      </div>
                    </div>
                    <StatusBadge
                      status={doc.status}
                      daysText={lang === 'ml' ? doc.daysTextMl : doc.daysTextEn}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#F1F5F9] text-xs text-[#64748B]">
                    <span className="font-semibold text-[#111827] font-mono-tabular">
                      {maskSensitiveNumber(doc.docNumber)}
                    </span>
                    <span className="font-mono-tabular">
                      {lang === 'ml' ? 'കാലാവധി: ' : 'Expires: '}
                      {formatHumanDate(doc.expiryDate, lang)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
