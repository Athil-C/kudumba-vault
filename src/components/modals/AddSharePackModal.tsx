import React, { useState, useMemo } from 'react';
import {
  Share2,
  X,
  Users,
  Check,
  CheckSquare,
  Square,
  FileText,
  Sparkles,
} from 'lucide-react';
import { Button, StatusBadge } from '../ui/DesignSystem';
import {
  SharePackItem,
  VaultDocumentItem,
  HouseholdMemberItem,
} from '../../types/vault';
import { INITIAL_MEMBERS } from '../../data/initialVaultData';
import { isDocumentForMember } from '../../utils/vaultLogic';

export interface AddSharePackModalProps {
  lang: 'ml' | 'en';
  docs: VaultDocumentItem[];
  members?: HouseholdMemberItem[];
  onClose: () => void;
  onSave: (pack: SharePackItem) => void;
}

export const AddSharePackModal: React.FC<AddSharePackModalProps> = ({
  lang,
  docs,
  members = INITIAL_MEMBERS,
  onClose,
  onSave,
}) => {
  const [titleEn, setTitleEn] = useState('');
  const [recipientEn, setRecipientEn] = useState('');
  const [expiryLabelEn, setExpiryLabelEn] = useState('Expires in 48 hrs');

  // Default selected member to first member with docs or 'ALL'
  const [selectedMemberId, setSelectedMemberId] = useState<string>('ALL');

  // Initially select first 2 documents if available
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(() =>
    docs.slice(0, 2).map((d) => d.id)
  );

  // Fallback to INITIAL_MEMBERS if passed empty
  const activeMembers = useMemo(() => {
    if (members && members.length > 0) return members;
    return INITIAL_MEMBERS;
  }, [members]);

  // Helper to match docs to a member
  const getDocsForMember = (memberId: string): VaultDocumentItem[] => {
    if (memberId === 'ALL') return docs;
    const target = activeMembers.find((m) => m.id === memberId);
    if (!target) return [];
    return docs.filter((d) => isDocumentForMember(d, target));
  };

  // Documents visible under currently selected member tab
  const visibleDocs = useMemo(
    () => getDocsForMember(selectedMemberId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedMemberId, docs, activeMembers]
  );

  const toggleDocId = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleIds = visibleDocs.map((d) => d.id);
    const allVisibleSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedDocIds.includes(id));

    if (allVisibleSelected) {
      setSelectedDocIds((prev) =>
        prev.filter((id) => !visibleIds.includes(id))
      );
    } else {
      setSelectedDocIds((prev) =>
        Array.from(new Set([...prev, ...visibleIds]))
      );
    }
  };

  const presets = [
    {
      en: 'Aster Medcity Admission Pack',
      ml: 'ആസ്റ്റർ മെഡ്സിറ്റി അഡ്മിഷൻ',
    },
    {
      en: 'CA Tax & Audit Pack',
      ml: 'സി.എ / ടാക്സ് ഓഡിറ്റ്',
    },
    {
      en: 'NRI Visa & Emirates ID',
      ml: 'എൻ.ആർ.ഐ വിസ & ഐഡി',
    },
    {
      en: 'Vehicle Papers & RC',
      ml: 'വാഹന രേഖകൾ & ആർ.സി',
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDocIds.length === 0) {
      return;
    }
    const cleanTitle = titleEn.trim() || 'Kudumba Vault Share Pack';
    const cleanRecipient =
      recipientEn.trim() || 'View-only bundle for authorized verification';
    onSave({
      id: `pack-${Date.now()}`,
      titleEn: cleanTitle,
      titleMl: cleanTitle,
      recipientEn: cleanRecipient,
      recipientMl: cleanRecipient,
      expiryLabelEn,
      expiryLabelMl:
        expiryLabelEn === 'Expires in 24 hrs'
          ? '24 മണിക്കൂർ മാത്രം'
          : expiryLabelEn === 'Expires in 48 hrs'
          ? '48 മണിക്കൂർ മാത്രം'
          : '7 ദിവസം മാത്രം',
      docIds: selectedDocIds,
      createdAt: new Date().toISOString().slice(0, 10),
      active: true,
    });
  };

  const currentMember = activeMembers.find((m) => m.id === selectedMemberId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 md:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[24px] bg-white border border-[#E6E8EC] shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div className="flex items-center justify-between border-b border-[#E6E8EC] px-6 py-3.5 bg-[#FAFAFA] shrink-0">
          <div>
            <h3 className="text-[18px] md:text-[20px] font-bold text-[#0B0B0C] font-malayalam">
              {lang === 'ml'
                ? 'പുതിയ ഷെയർ പായ്ക്ക് നിർമ്മിക്കുക'
                : 'Create Expiring Share Pack'}
            </h3>
            <p className="text-[13px] text-[#5B6168]">
              {lang === 'ml'
                ? 'ആദ്യം അംഗത്തെ തിരഞ്ഞെടുക്കുക, ശേഷം രേഖകൾ ചേർക്കുക'
                : 'Select member first, then choose their documents'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-[#E6E8EC] text-[#0B0B0C] hover:bg-[#F4F5F7] cursor-pointer shadow-xs"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body - Scrollable */}
        <form
          id="share-pack-form"
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6 space-y-5"
        >
          {/* Bundle Name & Expiry */}
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[14px] font-semibold text-[#0B0B0C] mb-1">
                  {lang === 'ml' ? 'പായ്ക്കിന്റെ പേര് *' : 'Bundle Name *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Aster Medcity Admission Pack"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#E6E8EC] bg-white px-3.5 text-[14px] text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#E03A45] focus:ring-1 focus:ring-[#E03A45]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-semibold text-[#0B0B0C] mb-1">
                  {lang === 'ml' ? 'കാലാവധി' : 'Auto-Expire'}
                </label>
                <select
                  value={expiryLabelEn}
                  onChange={(e) => setExpiryLabelEn(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#E6E8EC] bg-[#F4F5F7] px-3 text-[14px] font-medium text-[#0B0B0C] focus:outline-none focus:border-[#E03A45]"
                >
                  <option value="Expires in 24 hrs">24 Hours</option>
                  <option value="Expires in 48 hrs">48 Hours</option>
                  <option value="Expires in 7 days">7 Days</option>
                </select>
              </div>
            </div>

            {/* Quick 1-tap presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[12px] font-medium text-[#5B6168] flex items-center gap-1 mr-1">
                <Sparkles className="h-3 w-3 text-[#E03A45]" />
                {lang === 'ml' ? 'വേഗത്തിൽ:' : 'Presets:'}
              </span>
              {presets.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTitleEn(p.en)}
                  className="text-[12px] rounded-full border border-[#E6E8EC] bg-[#F8F9FA] hover:bg-[#EFEFEF] hover:border-[#CCD0D7] px-2.5 py-0.5 text-[#0B0B0C] transition-colors cursor-pointer"
                >
                  {lang === 'ml' ? p.ml : p.en}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient / Purpose */}
          <div>
            <label className="block text-[14px] font-semibold text-[#0B0B0C] mb-1">
              {lang === 'ml' ? 'ആർക്കുവേണ്ടി / ആവശ്യം' : 'Recipient / Purpose'}
            </label>
            <input
              type="text"
              value={recipientEn}
              onChange={(e) => setRecipientEn(e.target.value)}
              placeholder="e.g., View-only bundle for CA / Audit verification"
              className="w-full h-11 rounded-xl border border-[#E6E8EC] bg-white px-3.5 text-[14px] text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#E03A45]"
            />
          </div>

          {/* MEMBER-FIRST WORKFLOW CARD */}
          <div className="border border-[#E6E8EC] rounded-2xl bg-[#FAFAFA] p-4 md:p-5 space-y-4">
            {/* Step 1: Member Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white bg-[#E03A45] px-2 py-0.5 rounded">
                    {lang === 'ml' ? 'ഘട്ടം 1' : 'STEP 1'}
                  </span>
                  <span className="text-[14px] font-bold text-[#0B0B0C]">
                    {lang === 'ml'
                      ? 'കുടുംബാംഗത്തെ തിരഞ്ഞെടുക്കുക'
                      : 'Select Family Member'}
                  </span>
                </div>
                <span className="text-[12px] font-semibold text-[#5B6168]">
                  {selectedDocIds.length} {lang === 'ml' ? 'തിരഞ്ഞെടുത്തു' : 'selected'}
                </span>
              </div>

              {/* Member Selection Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {/* All Members */}
                <button
                  type="button"
                  onClick={() => setSelectedMemberId('ALL')}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all cursor-pointer ${
                    selectedMemberId === 'ALL'
                      ? 'border-[#E03A45] bg-[#FFF5F5] ring-1 ring-[#E03A45] shadow-xs'
                      : 'border-[#E6E8EC] bg-white hover:bg-[#F4F5F7] text-[#5B6168]'
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center mb-1 ${
                      selectedMemberId === 'ALL'
                        ? 'bg-[#E03A45] text-white'
                        : 'bg-[#F4F5F7] text-[#5B6168]'
                    }`}
                  >
                    <Users className="h-4 w-4" />
                  </div>
                  <span className="text-[12px] font-bold text-[#0B0B0C] truncate max-w-full">
                    {lang === 'ml' ? 'എല്ലാവരും' : 'All Family'}
                  </span>
                  <span className="text-[10px] text-[#8A949E]">
                    {docs.length} {lang === 'ml' ? 'രേഖകൾ' : 'docs'}
                  </span>
                </button>

                {/* Individual Members */}
                {activeMembers.map((member) => {
                  const isCurrent = selectedMemberId === member.id;
                  const memberDocCount = getDocsForMember(member.id).length;
                  const memberSelectedCount = getDocsForMember(member.id).filter(
                    (d) => selectedDocIds.includes(d.id)
                  ).length;

                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setSelectedMemberId(member.id)}
                      className={`relative flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isCurrent
                          ? 'border-[#E03A45] bg-[#FFF5F5] ring-1 ring-[#E03A45] shadow-xs'
                          : 'border-[#E6E8EC] bg-white hover:bg-[#F4F5F7]'
                      }`}
                    >
                      {memberSelectedCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-[#E03A45] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                          {memberSelectedCount}
                        </span>
                      )}

                      {member.avatarDataUrl ? (
                        <img
                          src={member.avatarDataUrl}
                          alt={member.nameEn}
                          className="h-8 w-8 rounded-full object-cover mb-1 border border-[#E6E8EC]"
                        />
                      ) : (
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold mb-1 shadow-xs"
                          style={{
                            backgroundColor: member.colorHex || '#E03A45',
                          }}
                        >
                          {member.initials}
                        </div>
                      )}

                      <span className="text-[12px] font-bold text-[#0B0B0C] truncate max-w-full">
                        {lang === 'ml'
                          ? member.nameMl
                          : member.nameEn.split(' ')[0]}
                      </span>
                      <span className="text-[10px] text-[#8A949E] truncate">
                        {memberDocCount} {lang === 'ml' ? 'രേഖകൾ' : 'docs'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Member's Documents List */}
            <div className="pt-2 border-t border-[#E6E8EC]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B0B0C] bg-[#E6E8EC] px-2 py-0.5 rounded">
                    {lang === 'ml' ? 'ഘട്ടം 2' : 'STEP 2'}
                  </span>
                  <span className="text-[13px] font-bold text-[#0B0B0C]">
                    {selectedMemberId === 'ALL'
                      ? lang === 'ml'
                        ? 'എല്ലാ രേഖകളും'
                        : 'All Documents'
                      : lang === 'ml'
                      ? `${currentMember?.nameMl || ''}-ടെ രേഖകൾ`
                      : `${currentMember?.nameEn || 'Member'}'s Documents`}
                    {' '}({visibleDocs.length})
                  </span>
                </div>

                {visibleDocs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="text-[12px] font-semibold text-[#E03A45] hover:text-[#C42F3A] cursor-pointer hover:underline"
                  >
                    {visibleDocs.every((d) => selectedDocIds.includes(d.id))
                      ? lang === 'ml'
                        ? 'എല്ലാം ഒഴിവാക്കുക'
                        : 'Deselect all'
                      : lang === 'ml'
                      ? 'എല്ലാം തിരഞ്ഞെടുക്കുക'
                      : 'Select all'}
                  </button>
                )}
              </div>

              {/* Scrollable Doc Cards */}
              <div className="max-h-52 overflow-y-auto space-y-2 rounded-xl border border-[#E6E8EC] bg-white p-2">
                {visibleDocs.length === 0 ? (
                  <div className="py-6 text-center text-[#8A949E]">
                    <FileText className="h-6 w-6 mx-auto mb-1 opacity-40" />
                    <p className="text-[13px] font-medium">
                      {lang === 'ml'
                        ? 'ഈ അംഗത്തിന് രേഖകളൊന്നും ചേർത്തിട്ടില്ല.'
                        : 'No documents recorded for this member yet.'}
                    </p>
                  </div>
                ) : (
                  visibleDocs.map((doc) => {
                    const isChecked = selectedDocIds.includes(doc.id);
                    return (
                      <div
                        key={doc.id}
                        onClick={() => toggleDocId(doc.id)}
                        className={`flex items-start justify-between gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-[#FFF8F8] border-[#E03A45] shadow-xs'
                            : 'bg-white border-[#E6E8EC] hover:border-[#CCD0D7]'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <button
                            type="button"
                            aria-label={`Select ${doc.titleEn}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDocId(doc.id);
                            }}
                            className="mt-0.5 text-[#E03A45] cursor-pointer shrink-0"
                          >
                            {isChecked ? (
                              <CheckSquare className="h-5 w-5 fill-[#E03A45] text-white" />
                            ) : (
                              <Square className="h-5 w-5 text-[#8A949E]" />
                            )}
                          </button>

                          <div className="min-w-0">
                            <h6 className="text-[14px] font-bold text-[#0B0B0C] leading-snug truncate">
                              {lang === 'ml' ? doc.titleMl : doc.titleEn}
                            </h6>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[12px] text-[#5B6168]">
                              <span className="font-mono text-[11px] bg-[#F4F5F7] px-1 py-0.5 rounded text-[#0B0B0C]">
                                {doc.docNumber}
                              </span>
                              {selectedMemberId === 'ALL' && (
                                <span className="font-medium text-[#0B0B0C]">
                                  • {doc.ownerEn}
                                </span>
                              )}
                              <span>• Exp: {doc.expiryDate}</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <StatusBadge
                            status={doc.status}
                            daysRemaining={doc.daysRemaining}
                            lang={lang}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Selected Documents summary chips */}
            {selectedDocIds.length > 0 && (
              <div className="pt-2 border-t border-[#E6E8EC]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-[#0B0B0C]">
                    {lang === 'ml' ? 'തിരഞ്ഞെടുത്ത രേഖകൾ' : 'Included in Pack'}:{' '}
                    <span className="text-[#E03A45] font-bold">
                      {selectedDocIds.length}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDocIds([])}
                    className="text-[11px] text-[#8A949E] hover:text-[#B3121F] cursor-pointer"
                  >
                    {lang === 'ml' ? 'എല്ലാം മാറ്റുക' : 'Clear all'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {selectedDocIds.map((id) => {
                    const doc = docs.find((d) => d.id === id);
                    if (!doc) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#E03A45]/30 text-[#0B0B0C] px-2.5 py-0.5 text-[11px] font-medium shadow-2xs"
                      >
                        <Check className="h-3 w-3 text-[#E03A45]" />
                        <span className="truncate max-w-[140px]">
                          {lang === 'ml' ? doc.titleMl : doc.titleEn}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${doc.titleEn}`}
                          onClick={() => toggleDocId(id)}
                          className="hover:text-[#B3121F] text-[#8A949E] cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer Action Buttons - Fixed */}
        <div className="flex items-center justify-between border-t border-[#E6E8EC] px-6 py-3.5 bg-[#FAFAFA] shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {lang === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            form="share-pack-form"
            variant="primary"
            size="sm"
            disabled={selectedDocIds.length === 0}
            className={
              selectedDocIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }
          >
            <Share2 className="h-4 w-4" />
            <span>
              {lang === 'ml'
                ? `ഷെയർ പായ്ക്ക് നിർമ്മിക്കുക (${selectedDocIds.length})`
                : `Create Share Pack (${selectedDocIds.length})`}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};
