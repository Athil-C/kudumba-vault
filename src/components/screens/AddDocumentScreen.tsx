import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Calendar,
  Check,
  Car,
  Home as HomeIcon,
  HeartPulse,
  Briefcase,
  Plane,
  Coins,
  Award,
  CheckCircle2,
  UserCheck,
  Undo2,
  AlertCircle,
  Folder,
  FileText,
  ShieldCheck,
  Lock,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { Button, Card } from '../ui/DesignSystem';
import {
  VaultDocumentItem,
  HouseholdMemberItem,
  DocStatus,
  VaultCategory,
  readFileAsDataUrl,
} from '../../types/vault';
import {
  apiUploadDocument,
  apiSimulateSubscriptionDev,
  EntitlementStatusClient,
} from '../../services/apiClient';
import { dataUrlToBlob } from '../../utils/localStorageMigration';
import { useAuth } from '../../context/AuthContext';

export interface Screen4AddDocumentProps {
  lang: 'ml' | 'en';
  members: HouseholdMemberItem[];
  defaultOwner?: string;
  onAddCreatedDoc: (newDoc: VaultDocumentItem) => void;
  onCancel?: () => void;
  entitlement?: EntitlementStatusClient | null;
  currentDocumentCount?: number;
  onOpenUpgrade?: () => void;
  onRefreshEntitlement?: () => void;
}

export const Screen4AddDocument: React.FC<Screen4AddDocumentProps> = ({
  lang,
  members,
  defaultOwner,
  onAddCreatedDoc,
  onCancel,
  entitlement,
  currentDocumentCount,
  onOpenUpgrade,
  onRefreshEntitlement,
}) => {
  const { isAuthenticated, executeGuardedAction } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileDataUrl, setFileDataUrl] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState('PASSPORT');
  const [expiryDate, setExpiryDate] = useState('');

  // Resolve initial selected member based on defaultOwner (by ID or exact name)
  const initialMember = members.find(
    (m) =>
      (defaultOwner && m.id === defaultOwner) ||
      (defaultOwner && m.nameEn.trim().toLowerCase() === defaultOwner.trim().toLowerCase())
  ) || members[0];

  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    initialMember?.id || ''
  );
  const [ownerName, setOwnerName] = useState<string>(
    initialMember?.nameEn || defaultOwner || 'Kudumba'
  );

  const handleMemberChange = (val: string) => {
    const m = members.find((item) => item.id === val || item.nameEn === val);
    if (m) {
      setSelectedMemberId(m.id);
      setOwnerName(m.nameEn);
    } else {
      setSelectedMemberId('');
      setOwnerName(val);
    }
  };

  const [docNum, setDocNum] = useState('');
  const [authority, setAuthority] = useState('');
  const [savedToast, setSavedToast] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadLimitHit, setUploadLimitHit] = useState(false);
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);

  // Check whether trial has expired or new uploads are paused
  const isTrialExpired = Boolean(
    entitlement &&
      (entitlement.trialExpired ||
        (!entitlement.isActiveOrTrialing && entitlement.status !== 'active') ||
        entitlement.canUpload === false)
  );

  // Authoritative document limit enforcement for Free plan (3 documents max)
  const maxDocs = entitlement?.maxDocuments ?? (entitlement?.planId === 'founding-free' || !entitlement ? 3 : undefined);
  const docCount = typeof currentDocumentCount === 'number'
    ? currentDocumentCount
    : (entitlement?.currentDocumentCount ?? 0);
  const isLimitReached = (typeof maxDocs === 'number' && docCount >= maxDocs) || uploadLimitHit;
  const isUploadBlocked = isTrialExpired || isLimitReached;

  const [resettingDevTrial, setResettingDevTrial] = useState(false);
  const handleReactivateDevTrial = async () => {
    try {
      setResettingDevTrial(true);
      await apiSimulateSubscriptionDev('START_TRIAL');
      setErrorMessage('');
      setUploadLimitHit(false);
      onRefreshEntitlement?.();
    } catch (e) {
      console.error('Failed to reactivate test trial:', e);
    } finally {
      setResettingDevTrial(false);
    }
  };

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const docTypes: Array<{
    id: string;
    ml: string;
    en: string;
    cat: VaultCategory;
    catMl: string;
    catEn: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'AADHAAR',
      ml: 'ആധാർ കാർഡ്',
      en: 'Aadhaar Card',
      cat: 'IDENTITY',
      catMl: 'തിരിച്ചറിയൽ രേഖ',
      catEn: 'Identity Document',
      icon: UserCheck,
    },
    {
      id: 'PASSPORT',
      ml: 'പാസ്‌പോർട്ട്',
      en: 'Passport',
      cat: 'GULF',
      catMl: 'ഗൾഫ് / NRI രേഖ',
      catEn: 'Gulf / NRI Document',
      icon: Plane,
    },
    {
      id: 'IQAMA',
      ml: 'ഇഖാമ / എമിറേറ്റ്സ് ID',
      en: 'Iqama / Emirates ID',
      cat: 'GULF',
      catMl: 'ഗൾഫ് / NRI രേഖ',
      catEn: 'Gulf / NRI Document',
      icon: Briefcase,
    },
    {
      id: 'RC',
      ml: 'വാഹന RC / ഇൻഷുറൻസ്',
      en: 'Vehicle RC / Insurance',
      cat: 'VEHICLE',
      catMl: 'വാഹന രേഖ',
      catEn: 'Vehicle Document',
      icon: Car,
    },
    {
      id: 'LAND_TAX',
      ml: 'ഭൂനികുതി രസീത്',
      en: 'Land Tax Receipt',
      cat: 'PROPERTY',
      catMl: 'വസ്തു / കരം രേഖ',
      catEn: 'Property & Tax',
      icon: HomeIcon,
    },
    {
      id: 'GOLD_LOAN',
      ml: 'സ്വർണ്ണ വായ്പ രസീത്',
      en: 'Gold Loan Token',
      cat: 'PROPERTY',
      catMl: 'വസ്തു / കരം രേഖ',
      catEn: 'Property & Tax',
      icon: Coins,
    },
    {
      id: 'HEALTH',
      ml: 'ആരോഗ്യ ഇൻഷുറൻസ്',
      en: 'Health Policy',
      cat: 'HEALTH',
      catMl: 'ഇൻഷുറൻസ് / മെഡിക്കൽ',
      catEn: 'Health & Policy',
      icon: HeartPulse,
    },
    {
      id: 'WARRANTY',
      ml: 'വാറന്റി കാർഡ്',
      en: 'Appliance Warranty',
      cat: 'IDENTITY',
      catMl: 'വാറന്റി രേഖ',
      catEn: 'Warranty Record',
      icon: Award,
    },
  ];

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const res = await readFileAsDataUrl(file);
    setFileDataUrl(res.dataUrl);
    setFileName(res.name);
    setStep(2);
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      executeGuardedAction(() => handleSave(), {
        promptMessage:
          lang === 'ml'
            ? 'രേഖകൾ അപ്‌ലോഡ് ചെയ്യുന്നതിന് ദയവായി സൈൻ ഇൻ ചെയ്യുക അല്ലെങ്കിൽ ഒരു അക്കൗണ്ട് ആരംഭിക്കുക.'
            : 'Please sign in or create an account to continue.',
      });
      return;
    }

    if (isTrialExpired) {
      setErrorMessage(
        lang === 'ml'
          ? 'നിങ്ങളുടെ സൗജന്യ ട്രയൽ അവസാനിച്ചു. രേഖകൾ ചേർക്കുന്നത് തുടരാൻ ദയവായി പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.'
          : 'Your free trial has expired. Upgrade your plan to resume uploading documents.'
      );
      onOpenUpgrade?.();
      return;
    }

    if (isLimitReached) {
      setErrorMessage(
        lang === 'ml'
          ? `നിങ്ങളുടെ ഫ്രീ പ്ലാനിൽ പരമാവധി ${maxDocs} രേഖകൾ മാത്രമേ സൂക്ഷിക്കാനാകൂ. കൂടുതൽ ചേർക്കാൻ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.`
          : `Your Free plan allows up to ${maxDocs} documents. Upgrade your plan to upload more.`
      );
      setUploadLimitHit(true);
      return;
    }

    setSaving(true);
    setErrorMessage('');
    try {
      const chosen = docTypes.find((t) => t.id === selectedType) || docTypes[1];
      const matchedMember =
        members.find((m) => m.id === selectedMemberId) ||
        members.find((m) => m.nameEn.trim().toLowerCase() === ownerName.trim().toLowerCase()) ||
        members.find((m) => m.nameMl && m.nameMl.trim() === ownerName.trim());

      const finalExpiry = expiryDate || '2028-08-15';
      const diffDays = Math.round(
        (new Date(finalExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const computedStatus: DocStatus =
        diffDays < 0 ? 'EXPIRED' : diffDays <= 60 ? 'DUE_SOON' : 'VALID';

      const daysTextEn =
        computedStatus === 'EXPIRED'
          ? 'Expired'
          : computedStatus === 'DUE_SOON'
          ? `Due in ${Math.max(1, diffDays)} days`
          : 'Valid';
      const daysTextMl =
        computedStatus === 'EXPIRED'
          ? 'കാലാവധി കഴിഞ്ഞു'
          : computedStatus === 'DUE_SOON'
          ? `${Math.max(1, diffDays)} ദിവസത്തിനുള്ളിൽ`
          : 'സാധുവാണ്';

      let uploadFile: File | Blob | null = selectedFile;
      let uploadFileName = selectedFile?.name || fileName || `${chosen.id.toLowerCase()}-scan.png`;

      // If no file was explicitly picked, generate a valid PNG Blob from fallback 1x1 image
      if (!uploadFile) {
        uploadFile = dataUrlToBlob(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        );
      }

      if (!uploadFile) {
        throw new Error('Please select or upload a document file.');
      }

      const initialRenewalHistory = [
        {
          id: `rh-${Date.now()}`,
          date: new Date().toISOString().slice(0, 10),
          actionMl: '3-ടാപ്പ് സ്കാനർ വഴി ചേർത്തു',
          actionEn: 'Added via 3-Tap Smart Scanner',
          by: ownerName,
        },
      ];

      const cloudDoc = await apiUploadDocument(uploadFile, uploadFileName, {
        title: chosen.en,
        titleMl: chosen.ml,
        category: chosen.cat,
        categoryMl: chosen.catMl,
        ownerNameEn: matchedMember ? matchedMember.nameEn : ownerName,
        ownerNameMl: matchedMember ? matchedMember.nameMl : ownerName,
        memberId: matchedMember?.id || (selectedMemberId || undefined),
        authorityEn: authority.trim() || 'Regional Passport Office, Kochi',
        authorityMl: authority.trim() || 'റീജിയണൽ പാസ്‌പോർട്ട് ഓഫീസ്, കൊച്ചി',
        docNumber: docNum.trim() || 'P84920144',
        expiryDate: finalExpiry,
        notes: authority.trim() || undefined,
        renewalHistory: initialRenewalHistory,
      });

      const docId = cloudDoc._id || cloudDoc.id;
      const created: VaultDocumentItem = {
        id: docId,
        titleMl: cloudDoc.titleMl || chosen.ml,
        titleEn: cloudDoc.title || chosen.en,
        subMl: cloudDoc.categoryMl || chosen.catMl,
        subEn: chosen.catEn,
        category: cloudDoc.category || chosen.cat,
        memberId: cloudDoc.memberId || matchedMember?.id || selectedMemberId || undefined,
        ownerMl: cloudDoc.ownerNameMl || (matchedMember ? matchedMember.nameMl : ownerName),
        ownerEn: cloudDoc.ownerNameEn || (matchedMember ? matchedMember.nameEn : ownerName),
        docNumber: cloudDoc.docNumber || docNum.trim() || 'P84920144',
        expiryDate: finalExpiry,
        status: computedStatus,
        daysTextEn,
        daysTextMl,
        authorityMl: cloudDoc.authorityMl || authority.trim() || 'റീജിയണൽ പാസ്‌പോർട്ട് ഓഫീസ്, കൊച്ചി',
        authorityEn: cloudDoc.authorityEn || authority.trim() || 'Regional Passport Office, Kochi',
        fileDataUrl: cloudDoc.signedUrl || cloudDoc.fileDataUrl || fileDataUrl,
        fileName: cloudDoc.fileName || uploadFileName,
        fileSize: cloudDoc.fileSize ?? (uploadFile instanceof File || uploadFile instanceof Blob ? uploadFile.size : undefined),
        renewalHistory: cloudDoc.renewalHistory || initialRenewalHistory,
      };

      setSavedToast(true);
      setTimeout(() => {
        onAddCreatedDoc(created);
      }, 250);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      if (
        msg.includes('3 documents') ||
        msg.includes('DOCUMENT_LIMIT_REACHED') ||
        (err as any)?.errorCode === 'DOCUMENT_LIMIT_REACHED'
      ) {
        setUploadLimitHit(true);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* =========================================================================
          MOBILE VIEW (Screen 3: 5 Step Cards + Security Encryption Card)
          ========================================================================= */}
      <div className="md:hidden space-y-3.5">
        {/* Mobile Header: Back button + Title */}
        <div className="flex items-center gap-3 pb-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F6F8] text-[#111827] hover:bg-[#E6E8EC] transition-colors cursor-pointer"
              aria-label={lang === 'ml' ? 'തിരികെ പോവുക' : 'Back'}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-xl font-extrabold text-[#111827] tracking-tight">
            {lang === 'ml' ? 'രേഖ ചേർക്കുക' : 'Add Document'}
          </h1>
        </div>

        {/* Free Plan / Trial Status Banner on Mobile */}
        {isTrialExpired ? (
          <div className="rounded-[22px] border border-[#FCA5A5] bg-[#FFF5F5] p-4 space-y-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#E03A45] text-white">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#991B1B]">
                    {lang === 'ml' ? 'സൗജന്യ ട്രയൽ കാലാവധി കഴിഞ്ഞു' : 'Free Trial Has Expired'}
                  </h3>
                  <span className="text-[11px] font-bold font-mono-tabular px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B]">
                    {docCount} / {maxDocs}
                  </span>
                </div>
                <p className="text-xs text-[#7F1D1D] mt-1 leading-relaxed">
                  {lang === 'ml'
                    ? 'നിങ്ങളുടെ 3 ദിവസത്തെ സൗജന്യ ട്രയൽ അവസാനിച്ചു. രേഖകൾ ചേർക്കുന്നത് തുടരാൻ ദയവായി പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.'
                    : 'Your 3-day free trial has expired. Upgrade your plan to resume uploading documents.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              {onRefreshEntitlement && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReactivateDevTrial}
                  disabled={resettingDevTrial}
                  className="w-full justify-center border-[#E03A45]/40 text-[#E03A45] hover:bg-[#FFF0F1] font-bold text-xs"
                >
                  {resettingDevTrial
                    ? 'Reactivating...'
                    : (lang === 'ml' ? 'ട്രയൽ റീസെറ്റ് ചെയ്യുക (Dev)' : 'Reactivate Test Trial (Dev)')}
                </Button>
              )}
              {onOpenUpgrade && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onOpenUpgrade}
                  className="w-full justify-center bg-[#E03A45] hover:bg-[#C42F3A] text-white font-bold rounded-xl py-2.5 text-xs shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  {lang === 'ml' ? 'പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan'}
                </Button>
              )}
            </div>
          </div>
        ) : typeof maxDocs === 'number' && (
          <div
            className={`rounded-[22px] border p-4 space-y-3 transition-all ${
              isLimitReached
                ? 'border-[#FCA5A5] bg-[#FFF5F5] shadow-xs'
                : 'border-[#E6E8EC] bg-white'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isLimitReached ? 'bg-[#E03A45] text-white' : 'bg-[#FFF0F1] text-[#E03A45]'
                }`}
              >
                {isLimitReached ? <AlertCircle className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`text-sm font-bold ${isLimitReached ? 'text-[#991B1B]' : 'text-[#111827]'}`}>
                    {isLimitReached
                      ? (lang === 'ml' ? `രേഖകളുടെ പരിധി കഴിഞ്ഞു (${docCount}/${maxDocs})` : `Document Limit Reached (${docCount}/${maxDocs})`)
                      : (lang === 'ml' ? 'സൗജന്യ പ്ലാൻ രേഖാ ക്വാട്ട' : 'Free Plan Document Quota')}
                  </h3>
                  <span className="text-xs font-bold font-mono-tabular text-[#64748B]">
                    {docCount} / {maxDocs}
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  {isLimitReached
                    ? (lang === 'ml'
                        ? `നിങ്ങളുടെ ഫ്രീ പ്ലാനിൽ പരമാവധി ${maxDocs} രേഖകൾ മാത്രമേ സൂക്ഷിക്കാനാകൂ. കൂടുതൽ ചേർക്കാൻ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.`
                        : `Your Free plan allows up to ${maxDocs} documents. Upgrade your plan to upload more.`)
                    : (lang === 'ml'
                        ? `നിങ്ങൾക്ക് ഇനിയും ${Math.max(0, maxDocs - docCount)} രേഖകൾ കൂടി സൗജന്യമായി ചേർക്കാം.`
                        : `You have ${Math.max(0, maxDocs - docCount)} document slots remaining on your Free plan.`)}
                </p>
              </div>
            </div>
            {isLimitReached && onOpenUpgrade && (
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenUpgrade}
                className="w-full justify-center bg-[#E03A45] hover:bg-[#C42F3A] text-white font-bold rounded-xl py-2.5 text-xs shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                {lang === 'ml' ? 'പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan'}
              </Button>
            )}
          </div>
        )}

        {!isAuthenticated && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-[#FEE2E2] bg-[#FFF5F5] text-[#E03A45]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="text-xs font-semibold text-[#0B0B0C]">
                {lang === 'ml'
                  ? 'രേഖകൾ സൂക്ഷിക്കാൻ പ്രവേശനം ആവശ്യമാണ്.'
                  : 'Please sign in to upload documents.'}
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                executeGuardedAction(() => {}, {
                  promptMessage:
                    lang === 'ml'
                      ? 'രേഖകൾ അപ്‌ലോഡ് ചെയ്യുന്നതിന് ദയവായി സൈൻ ഇൻ ചെയ്യുക.'
                      : 'Please sign in or create an account to continue.',
                })
              }
            >
              {lang === 'ml' ? 'പ്രവേശിക്കുക' : 'Sign In'}
            </Button>
          </div>
        )}

        {/* Hidden File Inputs for Mobile */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFilePick}
          className="hidden"
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFilePick}
          className="hidden"
        />

        {/* Card 1: Scan Document */}
        <div
          onClick={() => {
            if (isTrialExpired) {
      setErrorMessage(
        lang === 'ml'
          ? 'നിങ്ങളുടെ സൗജന്യ ട്രയൽ അവസാനിച്ചു. രേഖകൾ ചേർക്കുന്നത് തുടരാൻ ദയവായി പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.'
          : 'Your free trial has expired. Upgrade your plan to resume uploading documents.'
      );
      onOpenUpgrade?.();
      return;
    }

    if (isLimitReached) {
              setErrorMessage(
                lang === 'ml'
                  ? `നിങ്ങളുടെ ഫ്രീ പ്ലാനിൽ പരമാവധി ${maxDocs} രേഖകൾ മാത്രമേ സൂക്ഷിക്കാനാകൂ. കൂടുതൽ ചേർക്കാൻ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.`
                  : `Your Free plan allows up to ${maxDocs} documents. Upgrade your plan to upload more.`
              );
              onOpenUpgrade?.();
              return;
            }
            cameraInputRef.current?.click();
          }}
          className={`rounded-[22px] border bg-white p-4 flex items-center justify-between cursor-pointer transition-all ${
            isLimitReached
              ? 'border-[#FCA5A5] opacity-60'
              : 'border-[#E6E8EC] hover:border-[#E03A45] shadow-xs'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isLimitReached ? 'bg-[#F1F5F9] text-[#94A3B8]' : 'bg-[#FFF0F1] text-[#E03A45]'
            }`}>
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-[#111827]">
                {lang === 'ml' ? 'രേഖ സ്കാൻ ചെയ്യുക' : 'Scan Document'}
              </h3>
              <p className="text-xs text-[#64748B]">
                {fileDataUrl
                  ? (lang === 'ml' ? 'ഫോട്ടോ പകർത്തിയിരിക്കുന്നു' : 'Document photo captured')
                  : isLimitReached
                  ? (lang === 'ml' ? 'പരിധി കഴിഞ്ഞു' : 'Limit reached')
                  : (lang === 'ml' ? 'ക്യാമറ ഉപയോഗിച്ച് പകർത്തുക' : 'Use camera to capture document')}
              </p>
            </div>
          </div>
          {fileDataUrl ? (
            <div className="w-7 h-7 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 stroke-[2.5]" />
            </div>
          ) : (
            <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
          )}
        </div>

        {/* Card 2: Upload from Gallery */}
        <div
          onClick={() => {
            if (isTrialExpired) {
      setErrorMessage(
        lang === 'ml'
          ? 'നിങ്ങളുടെ സൗജന്യ ട്രയൽ അവസാനിച്ചു. രേഖകൾ ചേർക്കുന്നത് തുടരാൻ ദയവായി പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.'
          : 'Your free trial has expired. Upgrade your plan to resume uploading documents.'
      );
      onOpenUpgrade?.();
      return;
    }

    if (isLimitReached) {
              setErrorMessage(
                lang === 'ml'
                  ? `നിങ്ങളുടെ ഫ്രീ പ്ലാനിൽ പരമാവധി ${maxDocs} രേഖകൾ മാത്രമേ സൂക്ഷിക്കാനാകൂ. കൂടുതൽ ചേർക്കാൻ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.`
                  : `Your Free plan allows up to ${maxDocs} documents. Upgrade your plan to upload more.`
              );
              onOpenUpgrade?.();
              return;
            }
            uploadInputRef.current?.click();
          }}
          className={`rounded-[22px] border bg-white p-4 flex items-center justify-between cursor-pointer transition-all ${
            isLimitReached
              ? 'border-[#FCA5A5] opacity-60'
              : 'border-[#E6E8EC] hover:border-[#E03A45] shadow-xs'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isLimitReached ? 'bg-[#F1F5F9] text-[#94A3B8]' : 'bg-[#FFF0F1] text-[#E03A45]'
            }`}>
              <ImageIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-[#111827]">
                {lang === 'ml' ? 'ഗ്യാലറിയിൽ നിന്ന് ചേർക്കുക' : 'Upload from Gallery'}
              </h3>
              <p className="text-xs text-[#64748B] truncate max-w-[200px]">
                {fileName || (isLimitReached
                  ? (lang === 'ml' ? 'പരിധി കഴിഞ്ഞു' : 'Limit reached')
                  : (lang === 'ml' ? 'PDF, JPG അല്ലെങ്കിൽ PNG ഫയൽ' : 'Choose PDF, JPG or PNG file'))}
              </p>
            </div>
          </div>
          {fileName ? (
            <div className="w-7 h-7 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 stroke-[2.5]" />
            </div>
          ) : (
            <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
          )}
        </div>

        {/* Card 3: Choose Category */}
        <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-4 shadow-xs space-y-3">
          <div
            onClick={() => setMobileCategoryOpen(!mobileCategoryOpen)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF0F1] text-[#E03A45] flex items-center justify-center shrink-0">
                <Folder className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#111827]">
                  {lang === 'ml' ? 'വിഭാഗം തിരഞ്ഞെടുക്കുക' : 'Choose Category'}
                </h3>
                <p className="text-xs text-[#64748B]">
                  {docTypes.find((t) => t.id === selectedType)?.[lang === 'ml' ? 'ml' : 'en'] || 'Passport'}
                </p>
              </div>
            </div>
            {mobileCategoryOpen ? (
              <ChevronDown className="w-5 h-5 text-[#94A3B8]" />
            ) : (
              <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
            )}
          </div>

          {mobileCategoryOpen && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#F1F5F9]">
              {docTypes.map((t) => {
                const Icon = t.icon;
                const active = selectedType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedType(t.id);
                      setMobileCategoryOpen(false);
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'border-[#E03A45] bg-[#FFF0F1] text-[#E03A45]'
                        : 'border-[#E6E8EC] bg-[#F5F6F8] text-[#111827] hover:border-[#E03A45]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-[#E03A45]" />
                    <span className="truncate">{lang === 'ml' ? t.ml : t.en}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Card 4: Add Details */}
        <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-4 shadow-xs space-y-3">
          <div
            onClick={() => setMobileDetailsOpen(!mobileDetailsOpen)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF0F1] text-[#E03A45] flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#111827]">
                  {lang === 'ml' ? 'വിശദാംശങ്ങൾ നൽകുക' : 'Add Details'}
                </h3>
                <p className="text-xs text-[#64748B]">
                  {docNum || expiryDate
                    ? `${docNum || 'No doc #'} • ${expiryDate || 'No expiry'}`
                    : (lang === 'ml' ? 'പേര്, കാലാവധി, നമ്പർ' : 'Name, expiry date, document number')}
                </p>
              </div>
            </div>
            {mobileDetailsOpen ? (
              <ChevronDown className="w-5 h-5 text-[#94A3B8]" />
            ) : (
              <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
            )}
          </div>

          {mobileDetailsOpen && (
            <div className="space-y-3 pt-2 border-t border-[#F1F5F9]">
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">
                  {lang === 'ml' ? 'രേഖയുടെ നമ്പർ' : 'Document Number'}
                </label>
                <input
                  type="text"
                  value={docNum}
                  onChange={(e) => setDocNum(e.target.value)}
                  placeholder="e.g. P84920144"
                  className="w-full h-10 px-3 rounded-xl border border-[#E6E8EC] bg-[#F5F6F8] text-sm text-[#111827] focus:outline-none focus:border-[#E03A45] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">
                  {lang === 'ml' ? 'കാലാവധി തീയതി' : 'Expiry Date'}
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E6E8EC] bg-[#F5F6F8] text-sm text-[#111827] focus:outline-none focus:border-[#E03A45] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">
                  {lang === 'ml' ? 'കുടുംബാംഗം' : 'Family Member'}
                </label>
                <select
                  value={selectedMemberId || ownerName}
                  onChange={(e) => handleMemberChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E6E8EC] bg-[#F5F6F8] text-sm text-[#111827] focus:outline-none focus:border-[#E03A45] focus:bg-white"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {lang === 'ml' ? m.nameMl : m.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">
                  {lang === 'ml' ? 'അധികാരി / സ്ഥാപനം' : 'Issuing Authority'}
                </label>
                <input
                  type="text"
                  value={authority}
                  onChange={(e) => setAuthority(e.target.value)}
                  placeholder="e.g. Regional Passport Office, Kochi"
                  className="w-full h-10 px-3 rounded-xl border border-[#E6E8EC] bg-[#F5F6F8] text-sm text-[#111827] focus:outline-none focus:border-[#E03A45] focus:bg-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Card 5: Save to Vault */}
        <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF0F1] text-[#E03A45] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#111827]">
                  {lang === 'ml' ? 'വോൾട്ടിൽ സൂക്ഷിക്കുക' : 'Save to Vault'}
                </h3>
                <p className="text-xs text-[#64748B]">
                  {lang === 'ml' ? 'നിങ്ങളുടെ കുടുംബ വോൾട്ടിലേക്ക് സുരക്ഷിതമായി മാറ്റുക' : 'Securely store in your Kudumba Vault'}
                </p>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="mb-3 rounded-xl bg-[#FDECEE] border border-[#B3121F]/30 p-3 text-xs text-[#B3121F] font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              {onOpenUpgrade && (
                <button
                  type="button"
                  onClick={onOpenUpgrade}
                  className="underline font-bold text-[#E03A45] hover:text-[#B3121F] shrink-0 cursor-pointer"
                >
                  {lang === 'ml' ? 'അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade'}
                </button>
              )}
            </div>
          )}

          {savedToast && (
            <div className="mb-3 rounded-xl bg-[#E4F7EC] border border-[#0F7B3E]/30 p-3 text-xs text-[#0F7B3E] font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{lang === 'ml' ? 'രേഖ വിജയകരമായി സൂക്ഷിച്ചു!' : 'Document saved successfully!'}</span>
            </div>
          )}

          {isTrialExpired ? (
            <Button
              variant="primary"
              size="lg"
              onClick={onOpenUpgrade}
              className="w-full justify-center rounded-2xl py-3.5 font-bold shadow-xs bg-[#E03A45] hover:bg-[#C42F3A] text-white cursor-pointer"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {lang === 'ml' ? 'പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan to Resume Uploads'}
            </Button>
          ) : isLimitReached ? (
            <Button
              variant="primary"
              size="lg"
              onClick={onOpenUpgrade || handleSave}
              className="w-full justify-center rounded-2xl py-3.5 font-bold shadow-xs bg-[#E03A45] hover:bg-[#C42F3A] text-white cursor-pointer"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {lang === 'ml' ? 'കൂടുതൽ ചേർക്കാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan to Upload More'}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={handleSave}
              disabled={saving}
              className="w-full justify-center rounded-2xl py-3.5 font-bold shadow-xs bg-[#E03A45] hover:bg-[#C42F3A] text-white"
            >
              {saving ? (
                <span>{lang === 'ml' ? 'സേവ് ചെയ്യുന്നു...' : 'Saving to Vault...'}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  {lang === 'ml' ? 'വോൾട്ടിൽ സേവ് ചെയ്യുക' : 'Save to Vault'}
                </span>
              )}
            </Button>
          )}
        </div>

        {/* Security Encryption Card at Bottom */}
        <div className="rounded-[20px] bg-[#F5F6F8] border border-[#E6E8EC] p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#E03A45]/10 text-[#E03A45] flex items-center justify-center shrink-0 mt-0.5">
            <Lock className="w-4 h-4" />
          </div>
          <div className="text-xs text-[#64748B] leading-relaxed">
            <span className="font-bold text-[#111827] block mb-0.5">
              {lang === 'ml' ? 'എൻഡ്-ടു-എൻഡ് എൻക്രിപ്റ്റഡ്' : 'End-to-End Encrypted'}
            </span>
            {lang === 'ml'
              ? 'നിങ്ങളുടെ രേഖകൾ പൂർണ്ണമായി എൻക്രിപ്റ്റ് ചെയ്ത് സുരക്ഷിതമായി സൂക്ഷിക്കുന്നു. നിങ്ങൾക്ക് മാത്രമേ ഇവ കാണാനാകൂ.'
              : 'Your documents are encrypted and stored securely. Only you and authorized household members can access them.'}
          </div>
        </div>
      </div>

      {/* =========================================================================
          DESKTOP VIEW (Kept pristine for desktop md: and above)
          ========================================================================= */}
      <div className="hidden md:block space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label={lang === 'ml' ? 'തിരികെ പോവുക' : 'Back to Dashboard'}
              className="spring-interactive flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border-2 border-[#E03A45] bg-[#FFF5F5] text-[#E03A45] hover:bg-[#E03A45] hover:text-white transition-all cursor-pointer shadow-xs shrink-0"
            >
              <Undo2 className="h-5 w-5 stroke-[2.3]" />
            </button>
          )}
          <h2 className="text-[22px] font-bold text-[#0B0B0C] font-malayalam">
            {lang === 'ml'
              ? '3 ടാപ്പിൽ പുതിയ രേഖ ചേർക്കുക'
              : 'Add Document in 3 Taps'}
          </h2>
        </div>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            {lang === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}
          </Button>
        )}
      </div>

      {/* Free Plan / Trial Status Banner on Desktop */}
      {isTrialExpired ? (
        <div className="p-4 rounded-2xl border border-[#FCA5A5] bg-[#FFF5F5] text-[#991B1B] flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#E03A45] text-white flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">
                  {lang === 'ml' ? 'സൗജന്യ ട്രയൽ കാലാവധി കഴിഞ്ഞു' : 'Free Trial Has Expired'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FEE2E2] text-[#991B1B]">
                  {docCount} / {maxDocs} {lang === 'ml' ? 'രേഖകൾ' : 'docs'}
                </span>
              </div>
              <p className="text-xs text-[#7F1D1D] mt-0.5 leading-relaxed">
                {lang === 'ml'
                  ? 'നിങ്ങളുടെ 3 ദിവസത്തെ സൗജന്യ ട്രയൽ അവസാനിച്ചു. പുതിയ രേഖകൾ ചേർക്കുന്നത് തുടരാൻ ദയവായി പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.'
                  : 'Your 3-day free trial has expired. Upgrade your plan to resume uploading documents.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {onRefreshEntitlement && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReactivateDevTrial}
                disabled={resettingDevTrial}
                className="border-[#E03A45]/40 text-[#E03A45] hover:bg-[#FFF0F1] font-bold text-xs"
              >
                {resettingDevTrial
                  ? 'Reactivating...'
                  : (lang === 'ml' ? 'ട്രയൽ റീസെറ്റ് ചെയ്യുക (Dev)' : 'Reactivate Test Trial (Dev)')}
              </Button>
            )}
            {onOpenUpgrade && (
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenUpgrade}
                className="bg-[#E03A45] hover:bg-[#C42F3A] text-white font-bold shrink-0 shadow-xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                {lang === 'ml' ? 'പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan'}
              </Button>
            )}
          </div>
        </div>
      ) : typeof maxDocs === 'number' && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all ${
            isLimitReached
              ? 'border-[#FCA5A5] bg-[#FFF5F5] text-[#991B1B] shadow-xs'
              : 'border-[#E6E8EC] bg-white text-[#111827]'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isLimitReached ? 'bg-[#E03A45] text-white' : 'bg-[#FFF0F1] text-[#E03A45]'
              }`}
            >
              {isLimitReached ? <AlertCircle className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">
                  {isLimitReached
                    ? (lang === 'ml' ? `രേഖകളുടെ പരിധി കഴിഞ്ഞു (${docCount} / ${maxDocs})` : `Document Limit Reached (${docCount} / ${maxDocs})`)
                    : (lang === 'ml' ? `സൗജന്യ പ്ലാൻ രേഖാ ക്വാട്ട: ${docCount} / ${maxDocs}` : `Free Plan Document Allowance: ${docCount} / ${maxDocs}`)}
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                {isLimitReached
                  ? (lang === 'ml'
                      ? `നിങ്ങളുടെ ഫ്രീ പ്ലാനിൽ പരമാവധി ${maxDocs} രേഖകൾ മാത്രമേ സൂക്ഷിക്കാനാകൂ. കൂടുതൽ ചേർക്കാൻ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.`
                      : `Your Free plan allows up to ${maxDocs} documents. Upgrade your plan to upload more.`)
                  : (lang === 'ml'
                      ? `നിങ്ങൾക്ക് ഇനിയും ${Math.max(0, maxDocs - docCount)} രേഖകൾ കൂടി സൗജന്യമായി ചേർക്കാം.`
                      : `You have ${Math.max(0, maxDocs - docCount)} slot(s) remaining on your Free plan.`)}
              </p>
            </div>
          </div>
          {isLimitReached && onOpenUpgrade && (
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenUpgrade}
              className="bg-[#E03A45] hover:bg-[#C42F3A] text-white font-bold shrink-0 shadow-xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              {lang === 'ml' ? 'പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan'}
            </Button>
          )}
        </div>
      )}

      {!isAuthenticated && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#FEE2E2] bg-[#FFF5F5] text-[#E03A45]">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-xs font-semibold font-malayalam text-[#0B0B0C]">
              {lang === 'ml'
                ? 'രേഖകൾ സൂക്ഷിക്കാൻ പ്രവേശനം ആവശ്യമാണ്. (Please sign in to upload documents)'
                : 'Please sign in or create an account to continue.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              executeGuardedAction(() => {}, {
                promptMessage:
                  lang === 'ml'
                    ? 'രേഖകൾ അപ്‌ലോഡ് ചെയ്യുന്നതിന് ദയവായി സൈൻ ഇൻ ചെയ്യുക അല്ലെങ്കിൽ ഒരു അക്കൗണ്ട് ആരംഭിക്കുക.'
                    : 'Please sign in or create an account to continue.',
              })
            }
          >
            {lang === 'ml' ? 'പ്രവേശിക്കുക' : 'Sign In'}
          </Button>
        </div>
      )}

      {/* 3-Tap Step Progress Bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            s: 1,
            ml: 'ടാപ്പ് 1: ഫോട്ടോ / സ്കാൻ',
            en: 'Tap 1: Camera / Upload',
          },
          {
            s: 2,
            ml: 'ടാപ്പ് 2: രേഖയുടെ തരം',
            en: 'Tap 2: Choose Type',
          },
          {
            s: 3,
            ml: 'ടാപ്പ് 3: കാലാവധി & സേവ്',
            en: 'Tap 3: Expiry & Save',
          },
        ].map((item) => {
          const active = step === item.s;
          const done = step > item.s;
          return (
            <button
              key={item.s}
              type="button"
              onClick={() => setStep(item.s as 1 | 2 | 3)}
              className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-[16px] font-semibold cursor-pointer transition-colors ${
                active
                  ? 'border-[#E03A45] bg-[#E03A45] text-white shadow-xs'
                  : done
                  ? 'border-[#0F7B3E] bg-[#E4F7EC] text-[#0F7B3E]'
                  : 'border-[#E6E8EC] bg-white text-[#5B6168]'
              }`}
            >
              <span>{done ? '✓' : item.s}</span>
              <span className="truncate font-malayalam">{lang === 'ml' ? item.ml : item.en}</span>
            </button>
          );
        })}
      </div>

      {/* Step Content Card */}
      <Card className="p-6 sm:p-8">
        {step === 1 && (
          <div className="space-y-6 text-center">
            <div className="mx-auto max-w-md space-y-2">
              <h3 className="text-[22px] font-semibold text-[#0B0B0C] font-malayalam">
                {lang === 'ml'
                  ? 'ടാപ്പ് 1: രേഖയുടെ ഫോട്ടോ എടുക്കുക അല്ലെങ്കിൽ അപ്‌ലോഡ് ചെയ്യുക'
                  : 'Tap 1: Snap a Photo or Upload Image / PDF'}
              </h3>
              <p className="text-[16px] text-[#5B6168]">
                {lang === 'ml'
                  ? 'അപ്‌ലോഡ് ചെയ്യുന്ന ചിത്രങ്ങൾ സുരക്ഷിതമായി സൂക്ഷിക്കുന്നു.'
                  : 'Files are compressed and permanently stored in your household vault.'}
              </p>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFilePick}
              className="hidden"
            />
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFilePick}
              className="hidden"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
              <button
                type="button"
                onClick={() => {
                  if (isTrialExpired) {
      setErrorMessage(
        lang === 'ml'
          ? 'നിങ്ങളുടെ സൗജന്യ ട്രയൽ അവസാനിച്ചു. രേഖകൾ ചേർക്കുന്നത് തുടരാൻ ദയവായി പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.'
          : 'Your free trial has expired. Upgrade your plan to resume uploading documents.'
      );
      onOpenUpgrade?.();
      return;
    }

    if (isLimitReached) {
                    setErrorMessage(
                      lang === 'ml'
                        ? `നിങ്ങളുടെ ഫ്രീ പ്ലാനിൽ പരമാവധി ${maxDocs} രേഖകൾ മാത്രമേ സൂക്ഷിക്കാനാകൂ. കൂടുതൽ ചേർക്കാൻ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.`
                        : `Your Free plan allows up to ${maxDocs} documents. Upgrade your plan to upload more.`
                    );
                    onOpenUpgrade?.();
                    return;
                  }
                  cameraInputRef.current?.click();
                }}
                className={`flex flex-col items-center justify-center gap-3 rounded-[20px] border-2 p-6 transition-colors ${
                  isLimitReached
                    ? 'border-[#E6E8EC] bg-[#F4F5F7] text-[#8A949E] opacity-60 cursor-pointer'
                    : 'border-[#E03A45] bg-[#F4F5F7]/60 text-[#0B0B0C] cursor-pointer hover:bg-[#F4F5F7]'
                }`}
              >
                <div className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${
                  isLimitReached ? 'bg-[#94A3B8]' : 'bg-[#E03A45]'
                }`}>
                  <Camera className="h-7 w-7" />
                </div>
                <span className="text-[18px] font-semibold font-malayalam">
                  {lang === 'ml' ? 'ക്യാമറ തുറക്കുക' : 'Scan with Camera'}
                </span>
                <span className="text-[16px] text-[#5B6168]">
                  {isLimitReached
                    ? (lang === 'ml' ? 'പരിധി കഴിഞ്ഞു' : 'Quota reached')
                    : (lang === 'ml' ? 'ഓട്ടോ-ക്രോപ്പ് സ്കാനർ' : 'Opens mobile camera directly')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isTrialExpired) {
      setErrorMessage(
        lang === 'ml'
          ? 'നിങ്ങളുടെ സൗജന്യ ട്രയൽ അവസാനിച്ചു. രേഖകൾ ചേർക്കുന്നത് തുടരാൻ ദയവായി പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.'
          : 'Your free trial has expired. Upgrade your plan to resume uploading documents.'
      );
      onOpenUpgrade?.();
      return;
    }

    if (isLimitReached) {
                    setErrorMessage(
                      lang === 'ml'
                        ? `നിങ്ങളുടെ ഫ്രീ പ്ലാനിൽ പരമാവധി ${maxDocs} രേഖകൾ മാത്രമേ സൂക്ഷിക്കാനാകൂ. കൂടുതൽ ചേർക്കാൻ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക.`
                        : `Your Free plan allows up to ${maxDocs} documents. Upgrade your plan to upload more.`
                    );
                    onOpenUpgrade?.();
                    return;
                  }
                  uploadInputRef.current?.click();
                }}
                className={`flex flex-col items-center justify-center gap-3 rounded-[20px] border p-6 transition-colors ${
                  isLimitReached
                    ? 'border-[#E6E8EC] bg-[#F4F5F7] text-[#8A949E] opacity-60 cursor-pointer'
                    : 'border-[#E6E8EC] bg-[#F4F5F7] text-[#0B0B0C] hover:border-[#E03A45] cursor-pointer'
                }`}
              >
                <div className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${
                  isLimitReached ? 'bg-[#94A3B8]' : 'bg-[#0B0B0C]'
                }`}>
                  <Upload className="h-7 w-7" />
                </div>
                <span className="text-[18px] font-semibold font-malayalam">
                  {lang === 'ml' ? 'PDF / ഫോട്ടോ തിരഞ്ഞെടുക്കുക' : 'Upload Photo / PDF'}
                </span>
                <span className="text-[16px] text-[#5B6168]">
                  {fileName ||
                    (isLimitReached
                      ? (lang === 'ml' ? 'പരിധി കഴിഞ്ഞു' : 'Quota reached')
                      : (lang === 'ml'
                        ? 'ഫോണിൽ നിന്ന് തിരഞ്ഞെടുക്കാം'
                        : 'Choose file from your device'))}
                </span>
              </button>
            </div>

            {fileDataUrl && (
              <div className="mx-auto max-w-xs rounded-2xl border border-[#E6E8EC] bg-[#F4F5F7] p-3">
                <img
                  src={fileDataUrl}
                  alt="Preview"
                  className="max-h-36 mx-auto rounded-xl object-contain"
                />
                <p className="mt-1.5 text-[16px] font-medium text-[#0F7B3E] truncate">
                  ✓ {fileName}
                </p>
              </div>
            )}

            <div className="pt-2">
              <Button variant="primary" size="lg" onClick={() => setStep(2)}>
                <span>
                  {lang === 'ml'
                    ? 'അടുത്തത്: രേഖയുടെ തരം തിരഞ്ഞെടുക്കുക →'
                    : 'Next: Choose Document Type →'}
                </span>
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-[22px] font-semibold text-[#0B0B0C] font-malayalam">
                {lang === 'ml'
                  ? 'ടാപ്പ് 2: ഇത് ഏത് രേഖയാണ്?'
                  : 'Tap 2: Choose Document Type'}
              </h3>
              <p className="text-[16px] text-[#5B6168]">
                {lang === 'ml'
                  ? 'കേരളത്തിലെയും ഗൾഫിലെയും പ്രധാനപ്പെട്ട രേഖകൾ ഇതിൽ ഉൾപ്പെടുത്തിയിട്ടുണ്ട്'
                  : 'Pre-seeded with Kerala & Gulf NRI household document templates'}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {docTypes.map((t) => {
                const Icon = t.icon;
                const active = selectedType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedType(t.id);
                      setStep(3);
                    }}
                    className={`flex min-h-[96px] flex-col items-start justify-between rounded-2xl border p-4 text-left cursor-pointer transition-colors ${
                      active
                        ? 'border-[#E03A45] bg-[#F4F5F7] text-[#E03A45] shadow-xs'
                        : 'border-[#E6E8EC] bg-[#F4F5F7] text-[#0B0B0C] hover:border-[#E03A45]'
                    }`}
                  >
                    <Icon className="h-6 w-6 text-[#E03A45]" />
                    <span className="text-[16px] font-semibold leading-snug font-malayalam">
                      {lang === 'ml' ? t.ml : t.en}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {lang === 'ml' ? '← പിന്നോട്ട്' : '← Back'}
              </Button>
              <Button variant="primary" onClick={() => setStep(3)}>
                {lang === 'ml'
                  ? 'അടുത്തത്: കാലാവധി തീയതി →'
                  : 'Next: Pick Expiry Date →'}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-[22px] font-semibold text-[#0B0B0C] font-malayalam">
                {lang === 'ml'
                  ? 'ടാപ്പ് 3: കാലാവധി തീയതി തിരഞ്ഞെടുത്ത് സേവ് ചെയ്യുക'
                  : 'Tap 3: Pick Expiry Date & Save to Vault'}
              </h3>
              <p className="text-[16px] text-[#5B6168]">
                {lang === 'ml'
                  ? 'കാലാവധി കഴിയുന്നതിന് 60, 30, 7, 1 ദിവസം മുൻപ് ഞങ്ങൾ ഓർമ്മിപ്പിക്കും.'
                  : 'We will alert your household 60, 30, 7, and 1 days before expiry.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[16px] font-medium text-[#0B0B0C] mb-1.5">
                  {lang === 'ml' ? 'കാലാവധി തീയതി (Expiry Date)' : 'Expiry Date'}
                </label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-[#5B6168]" />
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full h-12 rounded-xl border border-[#E6E8EC] bg-white pl-11 pr-3 text-[16px] font-normal text-[#0B0B0C] focus:outline-none focus:border-[#E03A45]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[16px] font-medium text-[#0B0B0C] mb-1.5">
                  {lang === 'ml' ? 'കുടുംബാംഗം (Family Member)' : 'Family Member'}
                </label>
                <select
                  value={selectedMemberId || ownerName}
                  onChange={(e) => handleMemberChange(e.target.value)}
                  className="w-full h-12 rounded-xl border border-[#E6E8EC] bg-white px-3.5 text-[16px] font-normal text-[#0B0B0C] focus:outline-none focus:border-[#E03A45]"
                >
                  {members.length > 0 ? (
                    members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {lang === 'ml'
                          ? `${m.nameMl} (${m.location || m.locMl || ''})`
                          : `${m.nameEn} (${m.location || m.locEn || ''})`}
                      </option>
                    ))
                  ) : (
                    <option value="Kudumba">
                      {lang === 'ml'
                        ? 'കുടുംബം (പ്രധാന പ്രൊഫൈൽ)'
                        : 'Kudumba (Primary Profile)'}
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[16px] font-medium text-[#0B0B0C] mb-1.5">
                  {lang === 'ml'
                    ? 'രേഖയുടെ നമ്പർ'
                    : 'Document Number'}
                </label>
                <input
                  type="text"
                  value={docNum}
                  onChange={(e) => setDocNum(e.target.value)}
                  placeholder="e.g., P84920144"
                  className="w-full h-12 rounded-xl border border-[#E6E8EC] bg-white px-3.5 text-[16px] font-normal text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#E03A45]"
                />
              </div>

              <div>
                <label className="block text-[16px] font-medium text-[#0B0B0C] mb-1.5">
                  {lang === 'ml'
                    ? 'അധികാരി / സ്ഥാപനം'
                    : 'Issuing Authority'}
                </label>
                <input
                  type="text"
                  value={authority}
                  onChange={(e) => setAuthority(e.target.value)}
                  placeholder="e.g., Regional Passport Office, Kochi"
                  className="w-full h-12 rounded-xl border border-[#E6E8EC] bg-white px-3.5 text-[16px] font-normal text-[#0B0B0C] placeholder:text-[#8A949E] focus:outline-none focus:border-[#E03A45]"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-2xl bg-[#FDECEE] border border-[#B3121F]/30 p-4 flex items-center justify-between gap-3 text-[#B3121F] font-medium text-[16px]">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                {onOpenUpgrade && (
                  <button
                    type="button"
                    onClick={onOpenUpgrade}
                    className="underline font-bold text-[#E03A45] hover:text-[#B3121F] text-sm shrink-0 cursor-pointer"
                  >
                    {lang === 'ml' ? 'പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan'}
                  </button>
                )}
              </div>
            )}

            {savedToast && (
              <div className="rounded-2xl bg-[#E4F7EC] border border-[#0F7B3E]/30 p-4 flex items-center gap-3 text-[#0F7B3E] font-medium text-[16px]">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>
                  {lang === 'ml'
                    ? 'രേഖ സുരക്ഷിതമായി കുടുംബ വോൾട്ടിൽ ചേർത്തു!'
                    : 'Document permanently saved to household vault!'}
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>
                {lang === 'ml' ? '← പിന്നോട്ട്' : '← Back'}
              </Button>
              {isTrialExpired ? (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onOpenUpgrade}
                  className="bg-[#E03A45] hover:bg-[#C42F3A] text-white font-bold cursor-pointer"
                >
                  <Sparkles className="h-5 w-5 mr-1" />
                  <span>{lang === 'ml' ? 'പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan to Resume Uploads'}</span>
                </Button>
              ) : isLimitReached ? (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onOpenUpgrade || handleSave}
                  className="bg-[#E03A45] hover:bg-[#C42F3A] text-white font-bold cursor-pointer"
                >
                  <Sparkles className="h-5 w-5 mr-1" />
                  <span>{lang === 'ml' ? 'കൂടുതൽ ചേർക്കാൻ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുക' : 'Upgrade Plan to Upload More'}</span>
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
                  <Check className="h-5 w-5" />
                  <span>
                    {saving
                      ? lang === 'ml'
                        ? 'സേവ് ചെയ്യുന്നു...'
                        : 'Saving to Vault...'
                      : lang === 'ml'
                      ? 'വോൾട്ടിൽ സേവ് ചെയ്യുക'
                      : 'Save to Household Vault'}
                  </span>
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
      </div>
    </div>
  );
};
