import React, { useMemo } from 'react';
import { Plus, Phone, ArrowRight, Users, Clock } from 'lucide-react';
import { Button, EmptyState } from '../ui/DesignSystem';
import {
  Language,
  VaultDocumentItem,
  HouseholdMemberItem,
} from '../../types/vault';
import { isDocumentForMember } from '../../utils/vaultLogic';

const AVATAR_PALETTE = ['#E03A45', '#1E4FD8', '#0F7B3E', '#A85A00', '#6B21A8', '#0E7490'];

const getAvatarColor = (m: HouseholdMemberItem, index: number) => {
  if (m.colorHex) return m.colorHex;
  const str = m.id || m.nameEn || String(index);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

export const PeopleGridScreen = ({
  lang,
  members,
  docs,
  onSelectMember,
  onOpenAddMember,
}: {
  lang: Language;
  members: HouseholdMemberItem[];
  docs: VaultDocumentItem[];
  onSelectMember: (id: string) => void;
  onSelectDoc?: (id: string) => void;
  onOpenAddMember: () => void;
  onAddDocForMember?: (nameEn: string) => void;
}) => {
  // Deduplicate members by id defensively
  const uniqueMembers = useMemo(() => {
    const seen = new Set<string>();
    const list: HouseholdMemberItem[] = [];
    for (const m of members) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      list.push(m);
    }
    return list;
  }, [members]);

  const getMemberDocCount = (m: HouseholdMemberItem) => {
    return docs.filter((d) => isDocumentForMember(d, m)).length;
  };

  return (
    <div className="space-y-7">
      {/* Top Section Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div>
          <h2 className="text-xl sm:text-[22px] font-bold tracking-tight text-[#0B0B0C] font-malayalam">
            {lang === 'ml'
              ? 'കുടുംബാംഗങ്ങളും ചുമതലകളും'
              : 'Household Members & Roles'}
          </h2>
          <p className="text-[13px] text-[#5B6168] mt-0.5 font-malayalam">
            {lang === 'ml'
              ? 'കേരളത്തിലും ഗൾഫിലുമുള്ള കുടുംബാംഗങ്ങളുടെ പ്രൊഫൈലുകൾ നിയന്ത്രിക്കുക. കൂടുതൽ വിവരങ്ങൾക്ക് കാർഡിൽ ക്ലിക്ക് ചെയ്യുക.'
              : 'Manage family profiles across Kerala and the Gulf with role-based access. Tap any card for full details.'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenAddMember}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>{lang === 'ml' ? 'അംഗത്തെ ചേർക്കുക' : 'Add Member'}</span>
          </Button>
        </div>
      </div>

      {uniqueMembers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            lang === 'ml'
              ? 'കുടുംബാംഗങ്ങളെ ഇതുവരെ ചേർത്തിട്ടില്ല'
              : 'No Family Members Added Yet'
          }
          subtitle={
            lang === 'ml'
              ? 'കേരളത്തിലോ ഗൾഫിലോ ഉള്ള കുടുംബാംഗങ്ങളെ ചേർത്ത് രേഖകളും ചുമതലകളും നൽകുക.'
              : 'Add family members across Kerala or the Gulf to assign documents and roles.'
          }
          ctaLabel={lang === 'ml' ? 'അംഗത്തെ ചേർക്കുക' : '+ Add Member'}
          onCta={onOpenAddMember}
          bullets={
            lang === 'ml'
              ? [
                  'രേഖകൾ സുരക്ഷിതമായി പങ്കിടുക',
                  'റോൾ അടിസ്ഥാനമാക്കിയുള്ള അനുമതികൾ',
                  'കുടുംബ വിവരങ്ങൾ ചിട്ടയോടെ സൂക്ഷിക്കുക',
                ]
              : [
                  'Share documents securely',
                  'Give role-based access',
                  'Keep your family organized',
                ]
          }
        />
      ) : (
        /* 4-Column Member Cards Grid + Dashed "+ Add Member" Card */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {uniqueMembers.map((m, idx) => {
            const role = m.role || (idx === 0 ? 'OWNER' : 'EDITOR');
            const isOwner = role === 'OWNER';
            const isInvited = m.status === 'INVITED';
            const docCount = getMemberDocCount(m);
            const avatarColor = getAvatarColor(m, idx);
            const phoneStr =
              m.phone || m.whatsapp || (lang === 'ml' ? 'ഫോൺ നമ്പർ നൽകിയിട്ടില്ല' : 'No phone provided');
            const locationStr =
              lang === 'ml'
                ? (m.locMl || m.location || 'കേരളം')
                : (m.locEn || m.location || 'Kerala');

            return (
              <div
                key={m.id}
                onClick={() => onSelectMember(m.id)}
                className="group rounded-[22px] border border-[#E6E8EC] bg-white hover:border-[#E03A45]/50 hover:shadow-md p-5 sm:p-6 transition-all flex flex-col justify-between cursor-pointer"
              >
                <div>
                  {/* Top Identity Row */}
                  <div className="flex items-center gap-3.5">
                    {m.avatarDataUrl ? (
                      <div className="w-13 h-13 rounded-[16px] overflow-hidden shrink-0 border border-[#E6E8EC] bg-white p-0.5 flex items-center justify-center">
                        <img
                          src={m.avatarDataUrl}
                          alt={m.nameEn}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-[13px] text-white shrink-0 select-none shadow-xs"
                        style={{ backgroundColor: avatarColor }}
                      >
                        {m.initials || m.nameEn.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="text-[14px] font-bold text-[#0B0B0C] truncate font-malayalam tracking-tight">
                        {lang === 'ml' ? (m.nameMl || m.nameEn) : m.nameEn}
                      </h3>
                      <p className="text-[11px] font-medium text-[#5B6168] truncate mt-0.5 font-malayalam">
                        {locationStr}
                      </p>
                    </div>
                  </div>

                  {/* Phone Number Row */}
                  <div className="mt-4 flex items-center gap-2 text-xs text-[#5B6168] font-mono-tabular">
                    <Phone className="w-3.5 h-3.5 text-[#5B6168] shrink-0" />
                    <span className="truncate">{phoneStr}</span>
                  </div>

                  <hr className="my-4 border-[#F0F1F4]" />

                  {/* Role Badge + Status + Document Count Row */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${
                          isOwner
                            ? 'bg-[#FDECEE] text-[#E03A45]'
                            : 'bg-[#E4F7EC] text-[#0F7B3E]'
                        }`}
                      >
                        {role}
                      </span>
                      {isInvited && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
                          <Clock className="w-2.5 h-2.5" />
                          {lang === 'ml' ? 'ക്ഷണം അയച്ചു' : 'Invited'}
                        </span>
                      )}
                    </div>

                    <span className="text-xs font-bold text-[#4A5056] tabular-nums">
                      {lang === 'ml'
                        ? `${docCount} രേഖകൾ`
                        : `${docCount} ${docCount === 1 ? 'document' : 'documents'}`}
                    </span>
                  </div>
                </div>

                {/* Bottom Action Link */}
                <div className="mt-5 flex items-center justify-between text-xs font-extrabold text-[#E03A45] group-hover:translate-x-0.5 transition-transform">
                  <span>
                    {lang === 'ml'
                      ? 'വിവരങ്ങളും ചുമതലയും കാണുക'
                      : 'View Details & Role'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </div>
              </div>
            );
          })}

          {/* Dashed "+ Add Member" Card */}
          <button
            type="button"
            onClick={onOpenAddMember}
            className="rounded-[22px] border-2 border-dashed border-[#E6E8EC] bg-[#FAFAFB] hover:bg-white hover:border-[#E03A45] p-6 flex flex-col items-center justify-center text-center min-h-[210px] transition-all cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-full bg-[#FDECEE] text-[#E03A45] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-extrabold text-[#0B0B0C]">
              {lang === 'ml' ? '+ അംഗത്തെ ചേർക്കുക' : '+ Add Member'}
            </span>
            <span className="text-xs font-medium text-[#8A949E] mt-1">
              {lang === 'ml' ? 'ചുമതലയും സ്ഥലവും സഹിതം' : 'With role & location'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
