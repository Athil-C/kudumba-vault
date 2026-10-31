import React, { useState, useRef, useEffect } from 'react';
import {
  CornerUpLeft,
  MapPin,
  Plus,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  FileText,
  Trash2,
  MoreHorizontal,
  Users,
  Layers,
  Hash,
  Mail,
  Phone,
  ArrowUp,
  CreditCard,
  Calendar,
  Camera,
  Pencil,
  Upload,
  X,
  Search,
} from 'lucide-react';
import {
  Language,
  VaultDocumentItem,
  HouseholdMemberItem,
  formatHumanDate,
  readFileAsDataUrl,
} from '../../types/vault';
import { maskSensitiveNumber, isDocumentForMember } from '../../utils/vaultLogic';
import { Button, StatusBadge } from '../ui/DesignSystem';
import { VaultMascot } from '../VaultMascot';
import { useAuth } from '../../context/AuthContext';
import {
  apiGetProfile,
  apiUpdateProfileOverview,
  apiUpdateProfilePersonalDetails,
} from '../../services/apiClient';
import {
  RELATION_OPTIONS_EN,
  RELATION_MAP_ML,
  RESIDENCY_STATUS_OPTIONS,
  validateWhatsAppNumber,
  validateHomePhone,
  validateEmailFormat,
} from '../../utils/memberValidation';

export const MemberDetailScreen = ({
  lang,
  member,
  docs,
  onBack,
  onSelectDoc,
  onAddDocForMember,
  onRenewDoc,
  onUpdateMember,
  onDeleteMember,
}: {
  lang: Language;
  member: HouseholdMemberItem;
  docs: VaultDocumentItem[];
  onBack: () => void;
  onSelectDoc: (id: string) => void;
  onAddDocForMember: (memberNameEn: string) => void;
  onRenewDoc: (id: string) => void;
  onUpdateMember: (updated: HouseholdMemberItem) => void | Promise<any>;
  onDeleteMember: (id: string) => void;
}) => {
  const { user } = useAuth();
  const [currentMember, setCurrentMember] = useState<HouseholdMemberItem>(member);

  useEffect(() => {
    setCurrentMember(member);
  }, [member]);

  const [activeTab, setActiveTab] = useState<
    'DOCUMENTS' | 'RENEWALS' | 'HISTORY'
  >('DOCUMENTS');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  // Modals state
  const [isOverviewModalOpen, setIsOverviewModalOpen] = useState(false);
  const [isPersonalModalOpen, setIsPersonalModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUploadingDp, setIsUploadingDp] = useState(false);

  const dpInputRef = useRef<HTMLInputElement | null>(null);
  const modalDpInputRef = useRef<HTMLInputElement | null>(null);

  const memberCode = `KV#${currentMember.id.replace(/\D/g, '').padStart(3, '0') || '001'}`;
  const isNri = `${currentMember.location || ''} ${currentMember.locEn || ''} ${currentMember.relationEn || ''}`
    .toLowerCase()
    .match(/dubai|uae|nri|gulf|doha|sharjah/);

  const defaultEmail = currentMember.email || '';
  const defaultWhatsapp = currentMember.whatsapp || currentMember.phone || '';
  const defaultHomePhone = currentMember.homePhone || '';
  const defaultLocation =
    currentMember.location ||
    (lang === 'ml' ? currentMember.locMl : currentMember.locEn) ||
    'Kerala';
  const defaultResidency =
    currentMember.residencyStatus ||
    (isNri ? 'NRI (Gulf / GCC)' : 'Resident (Kerala)');
  const defaultHousehold =
    currentMember.householdName || (lang === 'ml' ? 'കുടുംബം' : 'Kudumba');

  // RBAC checks
  const canEditHousehold =
    user?.role === 'ADMIN' || user?.role === 'USER' || currentMember.role === 'OWNER';

  // 1. Overview Modal Form State
  const [overviewHousehold, setOverviewHousehold] = useState(defaultHousehold);
  const [overviewRelationEn, setOverviewRelationEn] = useState(currentMember.relationEn || 'Self');
  const [overviewRelationMl, setOverviewRelationMl] = useState(currentMember.relationMl || 'താൻ');
  const [overviewResidency, setOverviewResidency] = useState(defaultResidency);
  const [isSavingOverview, setIsSavingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewSuccess, setOverviewSuccess] = useState<string | null>(null);

  const openOverviewModal = () => {
    setOverviewHousehold(currentMember.householdName || 'Kudumba');
    setOverviewRelationEn(currentMember.relationEn || 'Self');
    setOverviewRelationMl(
      currentMember.relationMl || RELATION_MAP_ML[currentMember.relationEn] || 'താൻ'
    );
    setOverviewResidency(currentMember.residencyStatus || defaultResidency);
    setOverviewError(null);
    setOverviewSuccess(null);
    setShowMenu(false);
    setIsOverviewModalOpen(true);
  };

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingOverview) return;

    if (canEditHousehold && !overviewHousehold.trim()) {
      setOverviewError(lang === 'ml' ? 'കുടുംബപ്പേര് നൽകുക.' : 'Household name cannot be empty.');
      return;
    }

    setIsSavingOverview(true);
    setOverviewError(null);
    setOverviewSuccess(null);

    try {
      const relMl = overviewRelationMl || RELATION_MAP_ML[overviewRelationEn] || overviewRelationEn;
      await apiUpdateProfileOverview({
        memberId: currentMember.id,
        householdName: canEditHousehold ? overviewHousehold.trim() : undefined,
        relationEn: overviewRelationEn.trim(),
        relationMl: relMl.trim(),
        residencyStatus: overviewResidency.trim(),
      });

      const updated: HouseholdMemberItem = {
        ...currentMember,
        householdName: canEditHousehold && overviewHousehold.trim() ? overviewHousehold.trim() : currentMember.householdName,
        relationEn: overviewRelationEn.trim() || currentMember.relationEn,
        relationMl: relMl.trim() || currentMember.relationMl,
        residencyStatus: overviewResidency.trim() || currentMember.residencyStatus,
      };

      setCurrentMember(updated);
      await onUpdateMember(updated);

      // Refetch from backend to guarantee complete sync
      try {
        const fresh = await apiGetProfile(currentMember.id);
        if (fresh) {
          setCurrentMember((prev) => ({
            ...prev,
            householdName: fresh.householdName || prev.householdName,
            relationEn: fresh.relationEn || prev.relationEn,
            relationMl: fresh.relationMl || prev.relationMl,
            residencyStatus: fresh.residencyStatus || prev.residencyStatus,
          }));
        }
      } catch {
        // Non-blocking sync
      }

      setOverviewSuccess(
        lang === 'ml' ? 'വിവരങ്ങൾ വിജയകരമായി സേവ് ചെയ്തു!' : 'Overview details updated successfully!'
      );
      setTimeout(() => {
        setIsOverviewModalOpen(false);
        setOverviewSuccess(null);
      }, 700);
    } catch (err: any) {
      setOverviewError(err.message || 'Failed to update overview details.');
    } finally {
      setIsSavingOverview(false);
    }
  };

  // 2. Personal Details Modal Form State
  const [personalLocation, setPersonalLocation] = useState(defaultLocation);
  const [personalEmail, setPersonalEmail] = useState(defaultEmail);
  const [personalWhatsapp, setPersonalWhatsapp] = useState(defaultWhatsapp);
  const [personalHomePhone, setPersonalHomePhone] = useState(defaultHomePhone);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [personalSuccess, setPersonalSuccess] = useState<string | null>(null);

  const openPersonalModal = () => {
    setPersonalLocation(currentMember.location || currentMember.locEn || defaultLocation);
    setPersonalEmail(currentMember.email || '');
    setPersonalWhatsapp(currentMember.whatsapp || currentMember.phone || '');
    setPersonalHomePhone(currentMember.homePhone || '');
    setPersonalError(null);
    setPersonalSuccess(null);
    setShowMenu(false);
    setIsPersonalModalOpen(true);
  };

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPersonal) return;

    if (personalEmail.trim()) {
      const emailCheck = validateEmailFormat(personalEmail.trim());
      if (!emailCheck.valid) {
        setPersonalError(emailCheck.error || 'Please provide a valid email address.');
        return;
      }
    }

    if (personalWhatsapp.trim()) {
      const waCheck = validateWhatsAppNumber(personalWhatsapp.trim());
      if (!waCheck.valid) {
        setPersonalError(waCheck.error || 'Invalid WhatsApp number.');
        return;
      }
    }

    if (personalHomePhone.trim()) {
      const hpCheck = validateHomePhone(personalHomePhone.trim());
      if (!hpCheck.valid) {
        setPersonalError(hpCheck.error || 'Invalid home line number.');
        return;
      }
    }

    setIsSavingPersonal(true);
    setPersonalError(null);
    setPersonalSuccess(null);

    try {
      await apiUpdateProfilePersonalDetails({
        memberId: currentMember.id,
        location: personalLocation.trim(),
        email: personalEmail.trim(),
        whatsapp: personalWhatsapp.trim(),
        homePhone: personalHomePhone.trim(),
      });

      const updated: HouseholdMemberItem = {
        ...currentMember,
        location: personalLocation.trim() || currentMember.location,
        locEn: personalLocation.trim() || currentMember.locEn,
        email: personalEmail.trim(),
        whatsapp: personalWhatsapp.trim(),
        phone: personalWhatsapp.trim() || currentMember.phone,
        homePhone: personalHomePhone.trim(),
      };

      setCurrentMember(updated);
      await onUpdateMember(updated);

      // Refetch from backend to guarantee complete sync
      try {
        const fresh = await apiGetProfile(currentMember.id);
        if (fresh) {
          setCurrentMember((prev) => ({
            ...prev,
            location: fresh.location || prev.location,
            locEn: fresh.locEn || prev.locEn,
            email: fresh.email !== undefined ? fresh.email : prev.email,
            whatsapp: fresh.whatsapp !== undefined ? fresh.whatsapp : prev.whatsapp,
            phone: fresh.phone || prev.phone,
            homePhone: fresh.homePhone !== undefined ? fresh.homePhone : prev.homePhone,
          }));
        }
      } catch {
        // Non-blocking sync
      }

      setPersonalSuccess(
        lang === 'ml' ? 'വ്യക്തിഗത വിവരങ്ങൾ സേവ് ചെയ്തു!' : 'Personal details updated successfully!'
      );
      setTimeout(() => {
        setIsPersonalModalOpen(false);
        setPersonalSuccess(null);
      }, 700);
    } catch (err: any) {
      setPersonalError(err.message || 'Failed to update personal details.');
    } finally {
      setIsSavingPersonal(false);
    }
  };

  // 3. Full Edit Profile Modal Form State
  const [editNameEn, setEditNameEn] = useState(currentMember.nameEn);
  const [editNameMl, setEditNameMl] = useState(currentMember.nameMl);
  const [editRelationEn, setEditRelationEn] = useState(currentMember.relationEn);
  const [editRelationMl, setEditRelationMl] = useState(currentMember.relationMl);
  const [editHousehold, setEditHousehold] = useState(defaultHousehold);
  const [editResidency, setEditResidency] = useState(defaultResidency);
  const [editRole, setEditRole] = useState<'OWNER' | 'EDITOR'>(
    currentMember.role || 'EDITOR'
  );
  const [editLocation, setEditLocation] = useState(defaultLocation);
  const [editEmail, setEditEmail] = useState(defaultEmail);
  const [editWhatsapp, setEditWhatsapp] = useState(defaultWhatsapp);
  const [editHomePhone, setEditHomePhone] = useState(defaultHomePhone);
  const [editAvatarDataUrl, setEditAvatarDataUrl] = useState<
    string | undefined
  >(currentMember.avatarDataUrl);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const openEditProfileModal = () => {
    setEditNameEn(currentMember.nameEn);
    setEditNameMl(currentMember.nameMl);
    setEditRelationEn(currentMember.relationEn);
    setEditRelationMl(currentMember.relationMl);
    setEditHousehold(currentMember.householdName || 'Kudumba');
    setEditResidency(currentMember.residencyStatus || defaultResidency);
    setEditRole(currentMember.role || 'EDITOR');
    setEditLocation(currentMember.location || currentMember.locEn || defaultLocation);
    setEditEmail(currentMember.email || '');
    setEditWhatsapp(currentMember.whatsapp || currentMember.phone || '');
    setEditHomePhone(currentMember.homePhone || '');
    setEditAvatarDataUrl(currentMember.avatarDataUrl);
    setProfileError(null);
    setProfileSuccess(null);
    setShowMenu(false);
    setIsEditModalOpen(true);
  };

  const handleDirectDpUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDp(true);
    try {
      const result = await readFileAsDataUrl(file, 480);
      const updated = {
        ...currentMember,
        avatarDataUrl: result.dataUrl,
      };
      setCurrentMember(updated);
      await onUpdateMember(updated);
    } catch {
      // Ignore file read errors
    } finally {
      setIsUploadingDp(false);
      e.target.value = '';
    }
  };

  const handleModalDpUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await readFileAsDataUrl(file, 480);
      setEditAvatarDataUrl(result.dataUrl);
    } catch {
      // Ignore file read errors
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProfile) return;

    if (editEmail.trim()) {
      const emailCheck = validateEmailFormat(editEmail.trim());
      if (!emailCheck.valid) {
        setProfileError(emailCheck.error || 'Please provide a valid email address.');
        return;
      }
    }
    if (editWhatsapp.trim()) {
      const waCheck = validateWhatsAppNumber(editWhatsapp.trim());
      if (!waCheck.valid) {
        setProfileError(waCheck.error || 'Invalid WhatsApp number.');
        return;
      }
    }
    if (editHomePhone.trim()) {
      const hpCheck = validateHomePhone(editHomePhone.trim());
      if (!hpCheck.valid) {
        setProfileError(hpCheck.error || 'Invalid home line number.');
        return;
      }
    }

    setIsSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      const finalNameEn = editNameEn.trim() || currentMember.nameEn;
      const finalNameMl = editNameMl.trim() || finalNameEn;
      const finalRelEn = editRelationEn.trim() || currentMember.relationEn;
      const finalRelMl = editRelationMl.trim() || finalRelEn;
      const computedInitials = finalNameEn
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('');

      const updated: HouseholdMemberItem = {
        ...currentMember,
        nameEn: finalNameEn,
        nameMl: finalNameMl,
        relationEn: finalRelEn,
        relationMl: finalRelMl,
        householdName: canEditHousehold ? (editHousehold.trim() || currentMember.householdName || 'Kudumba') : currentMember.householdName,
        residencyStatus: editResidency.trim() || currentMember.residencyStatus || 'Resident (Kerala)',
        role: editRole,
        location: editLocation.trim() || 'Kerala',
        locEn: editLocation.trim() || 'Kerala',
        email: editEmail.trim(),
        phone: editWhatsapp.trim() || currentMember.phone,
        whatsapp: editWhatsapp.trim(),
        homePhone: editHomePhone.trim(),
        initials: computedInitials || currentMember.initials,
        avatarDataUrl: editAvatarDataUrl,
      };

      setCurrentMember(updated);
      await onUpdateMember(updated);

      setProfileSuccess(
        lang === 'ml' ? 'പ്രൊഫൈൽ വിജയകരമായി സേവ് ചെയ്തു!' : 'Profile updated successfully!'
      );
      setTimeout(() => {
        setIsEditModalOpen(false);
        setProfileSuccess(null);
      }, 700);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const memberDocs = docs.filter((d) => isDocumentForMember(d, member));

  const validDocs = memberDocs.filter((d) => d.status === 'VALID');
  const dueSoonDocs = memberDocs.filter((d) => d.status === 'DUE_SOON');
  const expiredDocs = memberDocs.filter((d) => d.status === 'EXPIRED');
  const needsRenewalDocs = memberDocs.filter((d) => d.status !== 'VALID');

  const totalDocsCount = memberDocs.length;
  const healthPct =
    totalDocsCount > 0
      ? Math.round((validDocs.length / totalDocsCount) * 100)
      : 100;

  const baseDocs =
    activeTab === 'RENEWALS' ? needsRenewalDocs : memberDocs;

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const displayedDocs = normalizedQuery
    ? baseDocs.filter((d) => {
        const titleEn = (d.titleEn || '').toLowerCase();
        const titleMl = (d.titleMl || '').toLowerCase();
        const authorityEn = (d.authorityEn || '').toLowerCase();
        const authorityMl = (d.authorityMl || '').toLowerCase();
        const docNum = (d.docNumber || '').toLowerCase();
        const cat = (d.category || '').toLowerCase();
        return (
          titleEn.includes(normalizedQuery) ||
          titleMl.includes(normalizedQuery) ||
          authorityEn.includes(normalizedQuery) ||
          authorityMl.includes(normalizedQuery) ||
          docNum.includes(normalizedQuery) ||
          cat.includes(normalizedQuery)
        );
      })
    : baseDocs;

  // Flatten renewal history across this member's documents
  const allHistory = memberDocs.flatMap((doc) =>
    (doc.renewalHistory || []).map((h, idx) => ({
      id: h.id || `${doc.id}-rh-${idx}`,
      date: h.date,
      docTitleEn: doc.titleEn,
      docTitleMl: doc.titleMl,
      noteEn: h.actionEn || h.noteEn || 'Updated in Vault',
      noteMl: h.actionMl || h.noteMl || 'വോൾട്ടിൽ പുതുക്കി',
    }))
  );

  const memberHistory = normalizedQuery
    ? allHistory.filter((item) => {
        const titleEn = (item.docTitleEn || '').toLowerCase();
        const titleMl = (item.docTitleMl || '').toLowerCase();
        const noteEn = (item.noteEn || '').toLowerCase();
        const noteMl = (item.noteMl || '').toLowerCase();
        return (
          titleEn.includes(normalizedQuery) ||
          titleMl.includes(normalizedQuery) ||
          noteEn.includes(normalizedQuery) ||
          noteMl.includes(normalizedQuery)
        );
      })
    : allHistory;

  const toggleReveal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Mini gauge arc math for Card 3
  const arcRatio = totalDocsCount > 0 ? validDocs.length / totalDocsCount : 0;
  const arcAngle = Math.PI * (1 - arcRatio);
  const dotX = 40 + 28 * Math.cos(arcAngle);
  const dotY = 36 - 28 * Math.sin(arcAngle);

  return (
    <div className="space-y-6">
      {/* Hidden Direct DP File Input */}
      <input
        ref={dpInputRef}
        type="file"
        accept="image/*"
        onChange={handleDirectDpUpload}
        className="hidden"
      />

      {/* Top Header Bar (Matches Candidate Profile reference) */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={lang === 'ml' ? 'തിരികെ പോവുക' : 'Back to Family Members'}
            className="spring-interactive flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border-2 border-[#E03A45] bg-[#FFF5F5] text-[#E03A45] hover:bg-[#E03A45] hover:text-white transition-all cursor-pointer shadow-xs shrink-0"
          >
            <CornerUpLeft className="w-5 h-5 stroke-[2.3]" />
          </button>
          <h1 className="text-[18px] sm:text-[20px] font-bold text-[#0B0B0C] font-malayalam tracking-tight">
            {lang === 'ml' ? 'കുടുംബാംഗത്തിന്റെ പ്രൊഫൈൽ' : 'Member Profile'}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Overflow ⋯ Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              aria-label="Member actions"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E6E8EC] bg-white text-[#5B6168] hover:text-[#0B0B0C] hover:bg-[#F4F5F7] transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-[#E6E8EC] bg-white shadow-lg py-1.5 z-30">
                <button
                  type="button"
                  onClick={openEditProfileModal}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-[#0B0B0C] hover:bg-[#F4F5F7] flex items-center gap-2 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5 text-[#0B0B0C]" />
                  <span>
                    {lang === 'ml' ? 'പ്രൊഫൈൽ എഡിറ്റ് ചെയ്യുക' : 'Edit Profile & DP'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    dpInputRef.current?.click();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-[#0B0B0C] hover:bg-[#F4F5F7] flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-[#E03A45]" />
                  <span>
                    {lang === 'ml' ? 'ഫോട്ടോ മാറ്റുക (Upload DP)' : 'Upload / Change DP'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onAddDocForMember(member.nameEn);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-[#0B0B0C] hover:bg-[#F4F5F7] flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#E03A45]" />
                  <span>
                    {lang === 'ml' ? 'രേഖ ചേർക്കുക' : 'Add New Document'}
                  </span>
                </button>
                {member.role !== 'OWNER' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onDeleteMember(member.id);
                      onBack();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-[#B3121F] hover:bg-[#FDECEE] flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'ml' ? 'അംഗത്തെ നീക്കം ചെയ്യുക' : 'Remove Member'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Outline Action Pill (Matches "Download Chest Card" button style) */}
          <button
            type="button"
            onClick={() => onAddDocForMember(member.nameEn)}
            className="spring-interactive inline-flex h-10 items-center gap-2 rounded-xl border border-[#E6E8EC] bg-white hover:border-[#0B0B0C] px-4 text-xs sm:text-sm font-bold text-[#0B0B0C] transition-colors cursor-pointer"
          >
            <CreditCard className="w-4 h-4 text-[#0B0B0C]" />
            <span>
              {lang === 'ml' ? '+ പുതിയ രേഖ ചേർക്കുക' : 'Add Document Card'}
            </span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Split Layout: Left Profile Card + Right KPI Cards & Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT SIDEBAR: Member Identity, DP Upload, Overview & Personal Details */}
        <div className="lg:col-span-3 rounded-[24px] bg-[#F8F9FA] border border-[#E6E8EC] p-6">
          {/* Large Coral Circle Avatar / Uploaded DP with Camera Overlay Button */}
          <div className="flex flex-col items-center text-center">
            <div className="relative group">
              {currentMember.avatarDataUrl ? (
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-[#FDECEE] bg-white shadow-2xs cursor-pointer flex items-center justify-center p-1.5">
                  <img
                    src={currentMember.avatarDataUrl}
                    alt={currentMember.nameEn}
                    referrerPolicy="no-referrer"
                    onClick={() => dpInputRef.current?.click()}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div
                  onClick={() => dpInputRef.current?.click()}
                  className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#EB4D4B] text-white text-4xl font-bold flex items-center justify-center border-4 border-[#FDECEE] shadow-2xs select-none cursor-pointer"
                >
                  {currentMember.initials || currentMember.nameEn.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Hover dark tint for quick DP change */}
              <button
                type="button"
                onClick={() => dpInputRef.current?.click()}
                aria-label={lang === 'ml' ? 'ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യുക' : 'Upload profile photo'}
                title={lang === 'ml' ? 'ഫോട്ടോ മാറ്റുക' : 'Upload / Change DP'}
                className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-bold gap-1 cursor-pointer"
              >
                <Camera className="w-5 h-5" />
                <span>{isUploadingDp ? '...' : lang === 'ml' ? 'ഫോട്ടോ' : 'Upload DP'}</span>
              </button>

              {/* Floating Bottom-Right Camera Badge */}
              <button
                type="button"
                onClick={() => dpInputRef.current?.click()}
                aria-label={lang === 'ml' ? 'ഫോട്ടോ മാറ്റുക' : 'Upload DP'}
                title={lang === 'ml' ? 'ഫോട്ടോ മാറ്റുക' : 'Upload DP'}
                className="absolute bottom-0.5 right-0.5 h-9 w-9 rounded-full bg-[#0B0B0C] hover:bg-[#EB4D4B] text-white border-2 border-white shadow-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <h2 className="mt-3.5 text-[17px] font-bold text-[#0B0B0C] font-malayalam tracking-tight">
              {lang === 'ml' ? currentMember.nameMl : currentMember.nameEn}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-[#8A949E]">
              {lang === 'ml' ? `അംഗം ${memberCode}` : `Vault ${memberCode}`}
            </p>

            {/* Quick Action Pills: Edit Profile + Upload DP */}
            <div className="mt-3.5 flex items-center justify-center gap-2 w-full">
              <button
                type="button"
                onClick={openEditProfileModal}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E6E8EC] bg-white hover:border-[#0B0B0C] px-3 py-2 text-xs font-bold text-[#0B0B0C] transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-[#EB4D4B]" />
                <span>{lang === 'ml' ? 'എഡിറ്റ്' : 'Edit Profile'}</span>
              </button>
              <button
                type="button"
                onClick={() => dpInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E6E8EC] bg-white hover:border-[#0B0B0C] px-3 py-2 text-xs font-bold text-[#5B6168] hover:text-[#0B0B0C] transition-colors cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-[#5B6168]" />
                <span>{lang === 'ml' ? 'DP' : 'Upload DP'}</span>
              </button>
            </div>
          </div>

          <hr className="my-5 border-[#E6E8EC]" />

          {/* OVERVIEW Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#5B6168]">
                {lang === 'ml' ? 'ഒറ്റനോട്ടത്തിൽ' : 'OVERVIEW'}
              </h3>
              <button
                type="button"
                onClick={openOverviewModal}
                aria-label="Edit overview"
                className="text-[11px] font-bold text-[#EB4D4B] hover:underline cursor-pointer"
              >
                {lang === 'ml' ? 'മാറ്റുക' : 'Edit'}
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[#5B6168]">
                  <Users className="w-3.5 h-3.5 text-[#8A949E]" />
                  <span>{lang === 'ml' ? 'കുടുംബം' : 'Household'}</span>
                </span>
                <span className="font-semibold text-[#0B0B0C] truncate">
                  {currentMember.householdName || defaultHousehold}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[#5B6168]">
                  <Layers className="w-3.5 h-3.5 text-[#8A949E]" />
                  <span>{lang === 'ml' ? 'ബന്ധം' : 'Relation'}</span>
                </span>
                <span className="font-semibold text-[#0B0B0C] font-malayalam">
                  {lang === 'ml' ? currentMember.relationMl : currentMember.relationEn}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[#5B6168]">
                  <Layers className="w-3.5 h-3.5 text-[#8A949E]" />
                  <span>{lang === 'ml' ? 'വിഭാഗം' : 'Residency'}</span>
                </span>
                <span className="font-semibold text-[#0B0B0C] truncate max-w-[140px]">
                  {currentMember.residencyStatus || defaultResidency}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[#5B6168]">
                  <Hash className="w-3.5 h-3.5 text-[#8A949E]" />
                  <span>{lang === 'ml' ? 'വോൾട്ട് ഐഡി' : 'Vault ID'}</span>
                </span>
                <span className="font-semibold text-[#0B0B0C] tabular-nums">
                  {memberCode}
                </span>
              </div>
            </div>
          </div>

          <hr className="my-5 border-[#E6E8EC]" />

          {/* PERSONAL DETAILS Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#5B6168]">
                {lang === 'ml' ? 'വ്യക്തിഗത വിവരങ്ങൾ' : 'PERSONAL DETAILS'}
              </h3>
              <button
                type="button"
                onClick={openPersonalModal}
                aria-label="Edit personal details"
                className="text-[11px] font-bold text-[#EB4D4B] hover:underline cursor-pointer"
              >
                {lang === 'ml' ? 'മാറ്റുക' : 'Edit'}
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[#5B6168]">
                  <MapPin className="w-3.5 h-3.5 text-[#8A949E]" />
                  <span>{lang === 'ml' ? 'സ്ഥലം' : 'Location'}</span>
                </span>
                <span className="font-semibold text-[#0B0B0C] truncate max-w-[130px]">
                  {currentMember.location || currentMember.locEn || defaultLocation}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[#5B6168]">
                  <Mail className="w-3.5 h-3.5 text-[#8A949E]" />
                  <span>{lang === 'ml' ? 'ഇമെയിൽ' : 'Email'}</span>
                </span>
                <span className={`font-semibold truncate max-w-[130px] ${currentMember.email ? 'text-[#0B0B0C]' : 'text-[#8A949E] italic text-xs'}`}>
                  {currentMember.email || (lang === 'ml' ? 'നൽകിയിട്ടില്ല' : 'Not provided')}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[#5B6168]">
                  <Phone className="w-3.5 h-3.5 text-[#8A949E]" />
                  <span>WhatsApp</span>
                </span>
                <span className={`font-semibold tabular-nums ${currentMember.whatsapp || currentMember.phone ? 'text-[#0B0B0C]' : 'text-[#8A949E] italic text-xs'}`}>
                  {currentMember.whatsapp || currentMember.phone || (lang === 'ml' ? 'നൽകിയിട്ടില്ല' : 'Not provided')}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[#5B6168]">
                  <Phone className="w-3.5 h-3.5 text-[#8A949E]" />
                  <span className="truncate">
                    {lang === 'ml' ? 'ഹോം ഫോൺ' : 'Home Line'}
                  </span>
                </span>
                <span className={`font-semibold tabular-nums ${currentMember.homePhone ? 'text-[#0B0B0C]' : 'text-[#8A949E] italic text-xs'}`}>
                  {currentMember.homePhone || (lang === 'ml' ? 'നൽകിയിട്ടില്ല' : 'Not provided')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT CONTENT AREA: 4 KPI Cards + Underline Tabs + Tab Content */}
        <div className="lg:col-span-9 space-y-6">
          {/* 4-Card KPI Strip (Exact visual match to Candidate Profile reference) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Card 1: TOTAL DOCUMENTS */}
            <div className="rounded-[22px] bg-[#F8F9FA] border border-[#E6E8EC] p-5 flex flex-col justify-between min-h-[128px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B6168]">
                {lang === 'ml' ? 'ആകെ രേഖകൾ' : 'TOTAL DOCUMENTS'}
              </span>

              <div className="mt-4 flex items-end justify-between gap-2">
                <div className="inline-flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-[#0B0B0C] tabular-nums">
                    {totalDocsCount}
                  </span>
                  <span className="text-xs font-semibold text-[#5B6168]">
                    {lang === 'ml' ? 'രേഖകൾ' : 'docs'}
                  </span>
                  <ArrowUp className="w-3.5 h-3.5 text-[#EB4D4B] self-center" />
                </div>

                {/* 3 mini pill dots */}
                <div className="flex items-center gap-1 pb-1">
                  <span
                    className={`h-1.5 w-2.5 rounded-full ${
                      totalDocsCount >= 1 ? 'bg-[#EB4D4B]' : 'bg-[#D0D5DD]'
                    }`}
                  />
                  <span
                    className={`h-1.5 w-2.5 rounded-full ${
                      totalDocsCount >= 2 ? 'bg-[#EB4D4B]' : 'bg-[#D0D5DD]'
                    }`}
                  />
                  <span
                    className={`h-1.5 w-2.5 rounded-full ${
                      totalDocsCount >= 3 ? 'bg-[#EB4D4B]' : 'bg-[#D0D5DD]'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Card 2: VAULT HEALTH PERCENTAGE */}
            <div className="rounded-[22px] bg-[#F8F9FA] border border-[#E6E8EC] p-5 flex flex-col justify-between min-h-[128px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B6168]">
                {lang === 'ml' ? 'വോൾട്ട് നിലവാരം' : 'TOTAL HEALTH'}
              </span>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div className="inline-flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-[#0B0B0C] tabular-nums">
                    {healthPct}%
                  </span>
                  <ArrowUp className="w-3.5 h-3.5 text-[#EB4D4B] self-center" />
                </div>

                {/* Red line with circle thumb */}
                <div className="relative flex items-center w-20 pb-2">
                  <div className="h-[2px] w-full bg-[#EB4D4B] rounded-full" />
                  <span
                    style={{ left: `${Math.min(92, Math.max(8, healthPct))}%` }}
                    className="absolute -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#EB4D4B] bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Card 3: VALID DOCUMENTS (with semicircular gauge) */}
            <div className="rounded-[22px] bg-[#F8F9FA] border border-[#E6E8EC] p-5 flex flex-col justify-between min-h-[128px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B6168]">
                {lang === 'ml' ? 'സാധുവായ രേഖകൾ' : 'VALID DOCUMENTS'}
              </span>

              <div className="mt-2 flex items-end justify-between gap-2">
                <div>
                  <div className="inline-flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-[#0B0B0C] tabular-nums">
                      {validDocs.length}
                    </span>
                    <ArrowUp className="w-3.5 h-3.5 text-[#EB4D4B] self-center" />
                  </div>
                  <p className="text-[11px] font-medium text-[#5B6168] mt-1 tabular-nums">
                    {validDocs.length} valid · {dueSoonDocs.length} due soon
                  </p>
                </div>

                {/* Mini Semicircular Arc SVG */}
                <svg
                  viewBox="0 0 80 44"
                  className="w-18 h-11 overflow-visible shrink-0"
                >
                  <path
                    d="M 12 36 A 28 28 0 0 1 68 36"
                    fill="none"
                    stroke="#E2E5EA"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={dotX}
                    cy={dotY}
                    r="3.5"
                    fill="#FFFFFF"
                    stroke="#EB4D4B"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
            </div>

            {/* Card 4: NEEDS RENEWAL */}
            <div className="rounded-[22px] bg-[#F8F9FA] border border-[#E6E8EC] p-5 flex flex-col justify-between min-h-[128px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B6168]">
                {lang === 'ml' ? 'പുതുക്കേണ്ടവ' : 'NEEDS RENEWAL'}
              </span>

              <div className="mt-4 flex items-end justify-between gap-2">
                <div className="inline-flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-[#0B0B0C] tabular-nums">
                    {needsRenewalDocs.length}
                  </span>
                  <ArrowUp className="w-3.5 h-3.5 text-[#EB4D4B] self-center" />
                </div>

                {/* 3 mini red slashed badges */}
                <div className="flex items-center gap-1 pb-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`inline-flex h-2.5 w-3 items-center justify-center rounded-[3px] border text-[8px] font-bold leading-none ${
                        i < needsRenewalDocs.length
                          ? 'border-[#EB4D4B] bg-[#FDECEE] text-[#EB4D4B]'
                          : 'border-[#EB4D4B]/50 text-[#EB4D4B]/60'
                      }`}
                    >
                      /
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Underline Tabs Row (Matches Programs | Results | Adjustments) with Search Bar in rounded place */}
          <div className="border-b border-[#E6E8EC] flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="flex items-center gap-6 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('DOCUMENTS')}
                className={`pb-3 text-sm font-bold transition-colors cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
                  activeTab === 'DOCUMENTS'
                    ? 'border-[#EB4D4B] text-[#EB4D4B]'
                    : 'border-transparent text-[#5B6168] hover:text-[#0B0B0C]'
                }`}
              >
                {lang === 'ml'
                  ? `രേഖകൾ (${memberDocs.length})`
                  : `Documents (${memberDocs.length})`}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('RENEWALS')}
                className={`pb-3 text-sm font-bold transition-colors cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
                  activeTab === 'RENEWALS'
                    ? 'border-[#EB4D4B] text-[#EB4D4B]'
                    : 'border-transparent text-[#5B6168] hover:text-[#0B0B0C]'
                }`}
              >
                {lang === 'ml'
                  ? `പുതുക്കേണ്ടവ (${needsRenewalDocs.length})`
                  : `Needs Renewal (${needsRenewalDocs.length})`}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('HISTORY')}
                className={`pb-3 text-sm font-bold transition-colors cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
                  activeTab === 'HISTORY'
                    ? 'border-[#EB4D4B] text-[#EB4D4B]'
                    : 'border-transparent text-[#5B6168] hover:text-[#0B0B0C]'
                }`}
              >
                {lang === 'ml'
                  ? `പുതുക്കൽ ചരിത്രം (${allHistory.length})`
                  : `Renewal History (${allHistory.length})`}
              </button>
            </div>

            {/* Search Bar in rounded place */}
            <div className="relative w-full sm:w-64 md:w-72 mb-2 shrink-0">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  lang === 'ml' ? 'രേഖകൾ തിരയുക...' : 'Search documents...'
                }
                className="w-full h-[34px] rounded-full border border-[#E6E8EC] bg-[#F8F9FA] pl-9 pr-8 text-xs text-[#0B0B0C] placeholder:text-[#94A3B8] focus:border-[#EB4D4B] focus:bg-white focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={lang === 'ml' ? 'തിരയൽ മായ്ക്കുക' : 'Clear search'}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 p-0.5 rounded-full text-[#94A3B8] hover:text-[#0B0B0C] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Tab Panel Content */}
          {activeTab === 'HISTORY' ? (
            memberHistory.length === 0 ? (
              <div className="py-14 flex flex-col items-center justify-center text-center">
                <VaultMascot pose="not-found" size="md" />
                <h3 className="mt-5 text-lg font-extrabold text-[#0B0B0C]">
                  {normalizedQuery
                    ? lang === 'ml'
                      ? `"${searchQuery}" എന്നതിന് ചരിത്ര രേഖകളൊന്നുമില്ല.`
                      : `No renewal logs matching "${searchQuery}"`
                    : lang === 'ml'
                    ? 'പുതുക്കൽ രേഖകളൊന്നും കണ്ടെത്തിയില്ല.'
                    : 'No renewal logs found.'}
                </h3>
                {normalizedQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#F4F5F7] hover:bg-[#E6E8EC] text-[#0B0B0C] px-5 py-2.5 text-sm font-bold shadow-xs cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>
                      {lang === 'ml' ? 'തിരയൽ ഒഴിവാക്കുക' : 'Clear Search'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAddDocForMember(member.nameEn)}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#EB4D4B] hover:bg-[#E03A45] text-white px-5 py-2.5 text-sm font-bold shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {lang === 'ml' ? 'രേഖ ചേർക്കുക' : 'Add Document'}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {memberHistory.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[20px] border border-[#E6E8EC] bg-[#F8F9FA] p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white border border-[#E6E8EC] flex items-center justify-center text-[#EB4D4B] shrink-0 mt-0.5">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#0B0B0C] font-malayalam">
                          {lang === 'ml' ? item.docTitleMl : item.docTitleEn}
                        </p>
                        <p className="text-xs text-[#5B6168] mt-0.5 font-malayalam">
                          {lang === 'ml' ? item.noteMl : item.noteEn}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#5B6168] tabular-nums shrink-0">
                      {formatHumanDate(item.date, lang)}
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : displayedDocs.length === 0 ? (
            /* Centered Mascot Empty State (Exact match to "No programme registrations found" in reference) */
            <div className="py-14 flex flex-col items-center justify-center text-center">
              <VaultMascot pose="not-found" size="md" />
              <h3 className="mt-5 text-lg font-extrabold text-[#0B0B0C]">
                {normalizedQuery
                  ? lang === 'ml'
                    ? `"${searchQuery}" എന്നതിന് രേഖകളൊന്നും കണ്ടെത്തിയില്ല.`
                    : `No documents matching "${searchQuery}"`
                  : activeTab === 'RENEWALS'
                  ? lang === 'ml'
                    ? 'ഉടൻ പുതുക്കേണ്ട രേഖകളൊന്നുമില്ല.'
                    : 'No pending document renewals found.'
                  : lang === 'ml'
                  ? 'രേഖകളൊന്നും ചേർത്തിട്ടില്ല.'
                  : 'No document registrations found.'}
              </h3>
              {normalizedQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#F4F5F7] hover:bg-[#E6E8EC] text-[#0B0B0C] px-5 py-2.5 text-sm font-bold shadow-xs cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>
                    {lang === 'ml' ? 'തിരയൽ ഒഴിവാക്കുക' : 'Clear Search'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddDocForMember(member.nameEn)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#EB4D4B] hover:bg-[#E03A45] text-white px-5 py-2.5 text-sm font-bold shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {lang === 'ml' ? 'രേഖ ചേർക്കുക' : 'Add Document'}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedDocs.map((doc) => {
                const isRevealed = !!revealedIds[doc.id];
                const displayNum = isRevealed
                  ? doc.docNumber
                  : maskSensitiveNumber(doc.docNumber);

                return (
                  <div
                    key={doc.id}
                    onClick={() => onSelectDoc(doc.id)}
                    className="rounded-[22px] border border-[#E6E8EC] bg-[#F8F9FA] hover:bg-white hover:border-[#EB4D4B] p-5 transition-all flex flex-col justify-between gap-4 cursor-pointer"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <StatusBadge
                          status={doc.status}
                          daysText={
                            lang === 'ml' ? doc.daysTextMl : doc.daysTextEn
                          }
                        />
                        <span className="text-xs font-semibold text-[#5B6168] tabular-nums">
                          {doc.expiryDate !== 'Lifetime'
                            ? `${lang === 'ml' ? 'കാലാവധി:' : 'Expires:'} ${formatHumanDate(doc.expiryDate, lang)}`
                            : lang === 'ml'
                            ? 'ആജീവനാന്തം'
                            : 'Lifetime'}
                        </span>
                      </div>

                      <h3 className="text-base font-extrabold text-[#0B0B0C] font-malayalam mt-2">
                        {lang === 'ml' ? doc.titleMl : doc.titleEn}
                      </h3>
                      <p className="text-xs text-[#5B6168] font-malayalam mt-0.5">
                        {lang === 'ml'
                          ? doc.authorityMl || doc.subMl
                          : doc.authorityEn || doc.subEn}
                      </p>

                      <div className="mt-4 flex items-center justify-between bg-white px-3.5 py-2.5 rounded-xl border border-[#E6E8EC]">
                        <span className="text-sm font-bold text-[#0B0B0C] font-mono-tabular">
                          {displayNum}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => toggleReveal(doc.id, e)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#EB4D4B] hover:underline cursor-pointer"
                        >
                          {isRevealed ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          {isRevealed
                            ? lang === 'ml'
                              ? 'മറയ്ക്കുക'
                              : 'Hide'
                            : lang === 'ml'
                            ? 'കാണുക'
                            : 'Show'}
                        </button>
                      </div>
                    </div>

                    {doc.status !== 'VALID' && (
                      <div className="pt-3 border-t border-[#E6E8EC] flex justify-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRenewDoc(doc.id);
                          }}
                        >
                          <CheckCircle2 className="w-4 h-4 text-[#0F7B3E]" />
                          {lang === 'ml'
                            ? '+1 വർഷം പുതുക്കുക'
                            : 'Mark Renewed (+1 Yr)'}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 1. Overview Edit Modal */}
      {isOverviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-[24px] md:rounded-[24px] border border-[#E6E8EC] w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E8EC]">
              <div>
                <h3 className="text-lg font-extrabold text-[#0B0B0C] font-malayalam">
                  {lang === 'ml' ? 'വിവരങ്ങൾ മാറ്റുക (Overview)' : 'Edit Overview Details'}
                </h3>
                <p className="text-xs text-[#5B6168]">
                  {lang === 'ml'
                    ? 'കുടുംബവും വിഭാഗവും തിരുത്തുക'
                    : `Update household, relationship and residency status (${memberCode})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOverviewModalOpen(false)}
                aria-label="Close modal"
                className="w-10 h-10 rounded-full bg-[#F4F5F7] border border-[#E6E8EC] flex items-center justify-center text-[#0B0B0C] hover:bg-[#E6E8EC] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form
              onSubmit={handleSaveOverview}
              className="p-6 space-y-4 overflow-y-auto flex-1"
            >
              {overviewError && (
                <div className="p-3 rounded-xl bg-[#FDECEE] border border-[#F8D7DA] text-xs font-semibold text-[#B3121F] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{overviewError}</span>
                </div>
              )}
              {overviewSuccess && (
                <div className="p-3 rounded-xl bg-[#E6F4EA] border border-[#CEEAD6] text-xs font-semibold text-[#137333] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{overviewSuccess}</span>
                </div>
              )}

              {/* Household Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168]">
                    {lang === 'ml' ? 'കുടുംബപ്പേര്' : 'Household / Family Name'}
                  </label>
                  {!canEditHousehold && (
                    <span className="text-[11px] font-semibold text-[#EB4D4B]">
                      {lang === 'ml' ? 'അഡ്മിന് മാത്രം മാറ്റാം' : 'Admin / Owner only'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={overviewHousehold}
                  onChange={(e) => setOverviewHousehold(e.target.value)}
                  disabled={!canEditHousehold}
                  placeholder="e.g., Kudumba"
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none ${
                    canEditHousehold
                      ? 'bg-white border-[#E6E8EC] focus:border-[#EB4D4B]'
                      : 'bg-[#F4F5F7] border-[#E6E8EC] text-[#8A949E] cursor-not-allowed'
                  }`}
                />
                {!canEditHousehold && (
                  <p className="mt-1 text-[11px] text-[#8A949E]">
                    {lang === 'ml'
                      ? 'കുടുംബപ്പേര് മാറ്റാൻ അഡ്മിൻ അല്ലെങ്കിൽ ഹൗസ്‌ഹോൾഡ് ഓണർ അനുമതി ആവശ്യമാണ്.'
                      : 'Only household owners or administrators can edit the household name.'}
                  </p>
                )}
              </div>

              {/* Relation Field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                  {lang === 'ml' ? 'ബന്ധം' : 'Relation'}
                </label>
                <select
                  value={overviewRelationEn}
                  onChange={(e) => {
                    setOverviewRelationEn(e.target.value);
                    setOverviewRelationMl(RELATION_MAP_ML[e.target.value] || e.target.value);
                  }}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] focus:outline-none focus:border-[#EB4D4B]"
                >
                  {RELATION_OPTIONS_EN.map((rel) => (
                    <option key={rel} value={rel}>
                      {lang === 'ml' ? `${RELATION_MAP_ML[rel] || rel} (${rel})` : rel}
                    </option>
                  ))}
                </select>
              </div>

              {/* Residency Status Field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                  {lang === 'ml' ? 'വിഭാഗം (Residency Status)' : 'Residency Status'}
                </label>
                <select
                  value={overviewResidency}
                  onChange={(e) => setOverviewResidency(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] focus:outline-none focus:border-[#EB4D4B]"
                >
                  {RESIDENCY_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vault ID (Read-only system-generated identifier) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168]">
                    {lang === 'ml' ? 'വോൾട്ട് ഐഡി' : 'Vault ID'}
                  </label>
                  <span className="text-[11px] font-semibold text-[#5B6168]">
                    {lang === 'ml' ? 'സിസ്റ്റം നിർമ്മിതം (മാറ്റാൻ കഴിയില്ല)' : 'System-generated (Read-only)'}
                  </span>
                </div>
                <input
                  type="text"
                  value={memberCode}
                  disabled
                  className="w-full h-11 px-3.5 rounded-xl bg-[#F4F5F7] border border-[#E6E8EC] text-sm font-semibold text-[#8A949E] cursor-not-allowed select-none"
                />
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#E6E8EC]">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingOverview}
                  onClick={() => setIsOverviewModalOpen(false)}
                >
                  {lang === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
                </Button>
                <Button type="submit" variant="primary" disabled={isSavingOverview}>
                  {isSavingOverview
                    ? (lang === 'ml' ? 'സേവ് ചെയ്യുന്നു...' : 'Saving...')
                    : (lang === 'ml' ? 'മാറ്റങ്ങൾ സേവ് ചെയ്യുക' : 'Save Changes')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Personal Details Edit Modal */}
      {isPersonalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-[24px] md:rounded-[24px] border border-[#E6E8EC] w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E8EC]">
              <div>
                <h3 className="text-lg font-extrabold text-[#0B0B0C] font-malayalam">
                  {lang === 'ml' ? 'വ്യക്തിഗത വിവരങ്ങൾ മാറ്റുക' : 'Edit Personal Details'}
                </h3>
                <p className="text-xs text-[#5B6168]">
                  {lang === 'ml'
                    ? 'സ്ഥലവും ഫോൺ നമ്പറുകളും ഇമെയിലും'
                    : `Update location, email and contact numbers (${memberCode})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonalModalOpen(false)}
                aria-label="Close modal"
                className="w-10 h-10 rounded-full bg-[#F4F5F7] border border-[#E6E8EC] flex items-center justify-center text-[#0B0B0C] hover:bg-[#E6E8EC] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form
              onSubmit={handleSavePersonal}
              className="p-6 space-y-4 overflow-y-auto flex-1"
            >
              {personalError && (
                <div className="p-3 rounded-xl bg-[#FDECEE] border border-[#F8D7DA] text-xs font-semibold text-[#B3121F] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{personalError}</span>
                </div>
              )}
              {personalSuccess && (
                <div className="p-3 rounded-xl bg-[#E6F4EA] border border-[#CEEAD6] text-xs font-semibold text-[#137333] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{personalSuccess}</span>
                </div>
              )}

              {/* Location */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                  {lang === 'ml' ? 'സ്ഥലം' : 'Location'}
                </label>
                <input
                  type="text"
                  value={personalLocation}
                  onChange={(e) => setPersonalLocation(e.target.value)}
                  placeholder="e.g., Dubai, UAE (NRI) or Kochi, Kerala"
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#EB4D4B]"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                  {lang === 'ml' ? 'ഇമെയിൽ' : 'Email'}
                </label>
                <input
                  type="email"
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                  placeholder="e.g., user@example.com"
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#EB4D4B]"
                />
                <p className="mt-1 text-[11px] text-[#8A949E]">
                  {lang === 'ml'
                    ? 'ശ്രദ്ധിക്കുക: പ്രൈമറി അക്കൗണ്ട് ലോഗിൻ ഇമെയിൽ മാറ്റുന്നതിന് സുപബേസ് ഇമെയിൽ സ്ഥിരീകരണം ആവശ്യമാണ്.'
                    : 'Note: Changing login email requires Supabase email confirmation.'}
                </p>
              </div>

              {/* WhatsApp */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                  WhatsApp
                </label>
                <input
                  type="text"
                  value={personalWhatsapp}
                  onChange={(e) => setPersonalWhatsapp(e.target.value)}
                  placeholder="e.g., +91 98765 43210 or +971 50 123 4567"
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#EB4D4B]"
                />
                <p className="mt-1 text-[11px] text-[#8A949E]">
                  {lang === 'ml'
                    ? 'കൺട്രി കോഡ് സഹിതം നൽകുക (ഉദാ: +91 ..., +971 ...).'
                    : 'Must include international country code (e.g. +91 ..., +971 ...).'}
                </p>
              </div>

              {/* Home Line */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                  {lang === 'ml' ? 'ഹോം ഫോൺ' : 'Home Line (Optional)'}
                </label>
                <input
                  type="text"
                  value={personalHomePhone}
                  onChange={(e) => setPersonalHomePhone(e.target.value)}
                  placeholder="e.g., +91 484 234 9102"
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#EB4D4B]"
                />
                <p className="mt-1 text-[11px] text-[#8A949E]">
                  {lang === 'ml' ? 'ലാൻഡ്‌ലൈൻ അല്ലെങ്കിൽ രണ്ടാമത്തെ ഫോൺ നമ്പർ.' : 'Optional landline or home phone.'}
                </p>
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#E6E8EC]">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingPersonal}
                  onClick={() => setIsPersonalModalOpen(false)}
                >
                  {lang === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
                </Button>
                <Button type="submit" variant="primary" disabled={isSavingPersonal}>
                  {isSavingPersonal
                    ? (lang === 'ml' ? 'സേവ് ചെയ്യുന്നു...' : 'Saving...')
                    : (lang === 'ml' ? 'മാറ്റങ്ങൾ സേവ് ചെയ്യുക' : 'Save Changes')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Edit Profile & Upload DP Full Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-[24px] md:rounded-[24px] border border-[#E6E8EC] w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E8EC]">
              <div>
                <h3 className="text-lg font-extrabold text-[#0B0B0C] font-malayalam">
                  {lang === 'ml'
                    ? 'പ്രൊഫൈൽ എഡിറ്റ് ചെയ്യുക'
                    : 'Edit Member Profile & DP'}
                </h3>
                <p className="text-xs text-[#5B6168]">
                  {lang === 'ml'
                    ? 'ഫോട്ടോയും വ്യക്തിഗത വിവരങ്ങളും മാറ്റുക'
                    : `Update profile picture, overview and contact details (${memberCode})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                aria-label="Close modal"
                className="w-10 h-10 rounded-full bg-[#F4F5F7] border border-[#E6E8EC] flex items-center justify-center text-[#0B0B0C] hover:bg-[#E6E8EC] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form
              onSubmit={handleSaveProfile}
              className="p-6 space-y-5 overflow-y-auto flex-1"
            >
              {profileError && (
                <div className="p-3 rounded-xl bg-[#FDECEE] border border-[#F8D7DA] text-xs font-semibold text-[#B3121F] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}
              {profileSuccess && (
                <div className="p-3 rounded-xl bg-[#E6F4EA] border border-[#CEEAD6] text-xs font-semibold text-[#137333] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              {/* DP Upload & Preview Section */}
              <div className="rounded-2xl bg-[#F8F9FA] border border-[#E6E8EC] p-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="relative shrink-0">
                  {editAvatarDataUrl ? (
                    <img
                      src={editAvatarDataUrl}
                      alt={editNameEn || currentMember.nameEn}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 rounded-full object-cover border-4 border-[#FDECEE] shadow-2xs"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-[#EB4D4B] text-white text-2xl font-bold flex items-center justify-center border-4 border-[#FDECEE] select-none">
                      {(editNameEn || currentMember.nameEn)
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join('') || currentMember.initials}
                    </div>
                  )}
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <p className="text-sm font-bold text-[#0B0B0C]">
                    {lang === 'ml' ? 'പ്രൊഫൈൽ ചിത്രം (DP)' : 'Profile Picture (DP)'}
                  </p>
                  <p className="text-xs text-[#5B6168] mt-0.5">
                    {lang === 'ml'
                      ? 'JPG, PNG അല്ലെങ്കിൽ WEBP ചിത്രം തിരഞ്ഞെടുക്കുക'
                      : 'Upload a clear portrait photo (JPG, PNG, WEBP). Auto-compressed for offline vault storage.'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <input
                      ref={modalDpInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleModalDpUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => modalDpInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#EB4D4B] hover:bg-[#E03A45] text-white px-3.5 py-2 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {lang === 'ml' ? 'ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യുക' : 'Upload Photo'}
                      </span>
                    </button>
                    {editAvatarDataUrl && (
                      <button
                        type="button"
                        onClick={() => setEditAvatarDataUrl(undefined)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6E8EC] bg-white hover:bg-[#FDECEE] hover:text-[#B3121F] px-3 py-2 text-xs font-semibold text-[#5B6168] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                          {lang === 'ml' ? 'ഒഴിവാക്കുക' : 'Remove Photo'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Name Fields (EN & ML) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    {lang === 'ml' ? 'പേര് (English)' : 'Full Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={editNameEn}
                    onChange={(e) => setEditNameEn(e.target.value)}
                    placeholder="e.g., Kudumba"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#EB4D4B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    {lang === 'ml' ? 'പേര് (മലയാളം)' : 'Name (Malayalam)'}
                  </label>
                  <input
                    type="text"
                    value={editNameMl}
                    onChange={(e) => setEditNameMl(e.target.value)}
                    placeholder="ഉദാ: കുടുംബം"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] font-malayalam focus:outline-none focus:border-[#EB4D4B]"
                  />
                </div>
              </div>

              {/* Overview Fields: Household, Relation, Residency, Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    {lang === 'ml' ? 'കുടുംബപ്പേര്' : 'Household'}
                  </label>
                  <input
                    type="text"
                    value={editHousehold}
                    onChange={(e) => setEditHousehold(e.target.value)}
                    disabled={!canEditHousehold}
                    placeholder="e.g., Kudumba"
                    className={`w-full h-11 px-3.5 rounded-xl border text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none ${
                      canEditHousehold
                        ? 'bg-white border-[#E6E8EC] focus:border-[#EB4D4B]'
                        : 'bg-[#F4F5F7] border-[#E6E8EC] text-[#8A949E] cursor-not-allowed'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    {lang === 'ml' ? 'ബന്ധം (Relation)' : 'Relation'}
                  </label>
                  <select
                    value={editRelationEn}
                    onChange={(e) => {
                      setEditRelationEn(e.target.value);
                      setEditRelationMl(RELATION_MAP_ML[e.target.value] || e.target.value);
                    }}
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] focus:outline-none focus:border-[#EB4D4B]"
                  >
                    {RELATION_OPTIONS_EN.map((rel) => (
                      <option key={rel} value={rel}>
                        {lang === 'ml' ? `${RELATION_MAP_ML[rel] || rel} (${rel})` : rel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    {lang === 'ml' ? 'വിഭാഗം (Residency)' : 'Residency Status'}
                  </label>
                  <select
                    value={editResidency}
                    onChange={(e) => setEditResidency(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] focus:outline-none focus:border-[#EB4D4B]"
                  >
                    {RESIDENCY_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    {lang === 'ml' ? 'വോൾട്ട് റോൾ' : 'Vault Access Role'}
                  </label>
                  <select
                    value={editRole}
                    disabled={!canEditHousehold}
                    onChange={(e) =>
                      setEditRole(e.target.value as 'OWNER' | 'EDITOR')
                    }
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] focus:outline-none focus:border-[#EB4D4B]"
                  >
                    <option value="OWNER">OWNER (Full Vault Control)</option>
                    <option value="EDITOR">EDITOR (Can Add & Renew)</option>
                  </select>
                </div>
              </div>

              {/* Personal Details: Location, Email, WhatsApp, Home Line */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    {lang === 'ml' ? 'സ്ഥലം' : 'Location'}
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="e.g., Dubai, UAE (NRI)"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#EB4D4B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    {lang === 'ml' ? 'ഇമെയിൽ' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="e.g., user@example.com"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#EB4D4B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                    placeholder="e.g., +971 50 482 9104"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#EB4D4B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5B6168] mb-1.5">
                    {lang === 'ml' ? 'ഹോം ഫോൺ' : 'Home Line'}
                  </label>
                  <input
                    type="text"
                    value={editHomePhone}
                    onChange={(e) => setEditHomePhone(e.target.value)}
                    placeholder="e.g., +91 484 234 9102"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E6E8EC] text-sm font-semibold text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#EB4D4B]"
                  />
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#E6E8EC]">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingProfile}
                  onClick={() => setIsEditModalOpen(false)}
                >
                  {lang === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
                </Button>
                <Button type="submit" variant="primary" disabled={isSavingProfile}>
                  {isSavingProfile
                    ? (lang === 'ml' ? 'സേവ് ചെയ്യുന്നു...' : 'Saving...')
                    : (lang === 'ml' ? 'മാറ്റങ്ങൾ സേവ് ചെയ്യുക' : 'Save Changes')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

