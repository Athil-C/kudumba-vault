import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Car,
  Home as HomeIcon,
  HeartPulse,
  Plane,
  UserCheck,
  Plus,
  ChevronDown,
  LogIn,
  LogOut,
  CloudUpload,
  ShieldCheck,
  AlertCircle,
  Clock,
  Search,
  ArrowLeft,
  X,
  FolderLock,
  Users,
  Wrench,
  Settings,
} from 'lucide-react';
import {
  Button,
  SearchPill,
  IconRail,
  BottomTabs,
  MobileMoreSheet,
  InstallPrompt,
  AppNavTab,
} from '../ui/DesignSystem';
import {
  VaultDocumentItem,
  HouseholdMemberItem,
  WorkerRecordItem,
  SharePackItem,
} from '../../types/vault';
import {
  HomeDashboardScreen,
  CategoryMetaItem,
} from '../screens/HomeDashboardScreen';
import { SafeUser } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import { AuthModal } from '../modals/AuthModal';
import { MigrationModal } from '../modals/MigrationModal';
import { VaultExplorerScreen } from '../screens/VaultExplorerScreen';
import { Screen3DocumentDetail } from '../screens/DocumentDetailScreen';
import { Screen4AddDocument } from '../screens/AddDocumentScreen';
import { PeopleGridScreen } from '../screens/PeopleGridScreen';
import { MemberDetailScreen } from '../screens/MemberDetailScreen';
import { WorkersBookScreen } from '../screens/WorkersBookScreen';
import { SharePacksScreen } from '../screens/SharePacksScreen';
import { Screen6Pricing } from '../screens/PricingSettingsScreen';
import { SettingsDashboardScreen } from '../screens/SettingsDashboardScreen';
import { AddMemberModal } from '../modals/AddMemberModal';
import { AddWorkerModal } from '../modals/AddWorkerModal';
import { AddSharePackModal } from '../modals/AddSharePackModal';
import { TrialEndedModal } from '../modals/TrialEndedModal';
import { apiGetSubscriptionStatus, EntitlementStatusClient } from '../../services/apiClient';

export interface AppWorkspaceShellProps {
  lang: 'ml' | 'en';
  onToggleLang: (lang: 'ml' | 'en') => void;
  docs: VaultDocumentItem[];
  members: HouseholdMemberItem[];
  workers: WorkerRecordItem[];
  sharePacks: SharePackItem[];
  completenessScore: number;
  onRenewDocument: (docId: string) => void;
  onUpdateDocument: (updated: VaultDocumentItem) => void;
  onDeleteDocument?: (docId: string) => Promise<void> | void;
  onAddCreatedDoc: (newDoc: VaultDocumentItem) => void;
  onAddMember: (newMember: HouseholdMemberItem) => void;
  onUpdateMember: (updatedMember: HouseholdMemberItem) => Promise<any> | void;
  onDeleteMember: (memberId: string) => void;
  onAddWorker: (newWorker: WorkerRecordItem) => void;
  onUpdateWorker: (updatedWorker: WorkerRecordItem) => void;
  onDeleteWorker: (workerId: string) => void;
  onAddSharePack: (newPack: SharePackItem) => void;
  onDeleteSharePack: (packId: string) => void;
}

export const AppWorkspaceShell: React.FC<AppWorkspaceShellProps> = ({
  lang,
  onToggleLang,
  docs,
  members,
  workers,
  sharePacks,
  completenessScore,
  onRenewDocument,
  onUpdateDocument,
  onDeleteDocument,
  onAddCreatedDoc,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  onAddWorker,
  onUpdateWorker,
  onDeleteWorker,
  onAddSharePack,
  onDeleteSharePack,
}) => {
  const [activeNav, setActiveNav] = useState<AppNavTab>('home');
  const [subView, setSubView] = useState<
    'none' | 'doc-detail' | 'add-doc' | 'member-detail'
  >('none');
  const [selectedDocId, setSelectedDocId] = useState<string>(
    docs[0]?.id || 'doc-1'
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    members[0]?.id || 'mem-1'
  );
  const [preselectedMemberForDoc, setPreselectedMemberForDoc] = useState<
    string | undefined
  >(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showInstallPrompt, setShowInstallPrompt] = useState(true);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [showAddShareModal, setShowAddShareModal] = useState(false);
  const [showMobileMoreSheet, setShowMobileMoreSheet] = useState(false);

  // Authentication & Cloud Sync State from AuthContext
  const {
    user: authUser,
    unverifiedEmail,
    logout,
    inactivityExpired,
    isRecoveryFlow,
    isAuthModalOpen,
    authModalMode,
    authPromptMessage,
    openAuthModal,
    closeAuthModal,
    executeGuardedAction,
    handleAuthSuccess,
  } = useAuth();

  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const mandatoryAuthMessage =
    lang === 'ml'
      ? 'തുടരുന്നതിന് ദയവായി സൈൻ ഇൻ ചെയ്യുക അല്ലെങ്കിൽ ഒരു അക്കൗണ്ട് ആരംഭിക്കുക.'
      : 'Please sign in or create an account to continue.';

  const guardedRenewDocument = (docId: string) => {
    executeGuardedAction(() => onRenewDocument(docId), { promptMessage: mandatoryAuthMessage });
  };

  const guardedUpdateDocument = (updated: VaultDocumentItem) => {
    executeGuardedAction(() => onUpdateDocument(updated), { promptMessage: mandatoryAuthMessage });
  };

  const guardedDeleteDocument = (docId: string) => {
    executeGuardedAction(
      async () => {
        if (onDeleteDocument) await onDeleteDocument(docId);
        refreshEntitlement();
      },
      { promptMessage: mandatoryAuthMessage }
    );
  };

  const guardedAddMember = (m: HouseholdMemberItem) =>
    executeGuardedAction(() => onAddMember(m), { promptMessage: mandatoryAuthMessage });

  const guardedUpdateMember = (m: HouseholdMemberItem) =>
    executeGuardedAction(() => onUpdateMember(m), { promptMessage: mandatoryAuthMessage });

  const guardedDeleteMember = (id: string) =>
    executeGuardedAction(() => onDeleteMember(id), { promptMessage: mandatoryAuthMessage });

  const guardedAddWorker = (w: WorkerRecordItem) =>
    executeGuardedAction(() => onAddWorker(w), { promptMessage: mandatoryAuthMessage });

  const guardedUpdateWorker = (w: WorkerRecordItem) =>
    executeGuardedAction(() => onUpdateWorker(w), { promptMessage: mandatoryAuthMessage });

  const guardedDeleteWorker = (id: string) =>
    executeGuardedAction(() => onDeleteWorker(id), { promptMessage: mandatoryAuthMessage });

  const guardedAddSharePack = (p: SharePackItem) =>
    executeGuardedAction(() => onAddSharePack(p), { promptMessage: mandatoryAuthMessage });

  const guardedDeleteSharePack = (id: string) =>
    executeGuardedAction(() => onDeleteSharePack(id), { promptMessage: mandatoryAuthMessage });

  // Close account menu on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setIsAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Automatically prompt sign-in when 7-day inactivity triggers
  useEffect(() => {
    if (inactivityExpired) {
      openAuthModal(
        'login',
        lang === 'ml'
          ? '7 ദിവസത്തെ പ്രവർത്തനമില്ലായ്മ കാരണം സെഷൻ കാലഹരണപ്പെട്ടു. ദയവായി വീണ്ടും സൈൻ ഇൻ ചെയ്യുക.'
          : 'Your session has expired due to 7 consecutive days of inactivity. Please sign in again.'
      );
    }
  }, [inactivityExpired, openAuthModal, lang]);

  // Automatically prompt DOB verification when user lands from Supabase recovery email
  useEffect(() => {
    if (isRecoveryFlow) {
      openAuthModal('reset-password-dob');
    }
  }, [isRecoveryFlow, openAuthModal]);

  const currentUser = authUser;

  const activeFamilyName =
    currentUser?.familyName?.trim() ||
    members.find((m) => m.householdName?.trim())?.householdName?.trim();

  const displayFamilyVaultTitle = activeFamilyName
    ? (activeFamilyName.toLowerCase().includes('vault') || activeFamilyName.includes('വോൾട്ട്')
        ? activeFamilyName
        : `${activeFamilyName} ${lang === 'ml' ? 'വോൾട്ട്' : 'Vault'}`)
    : (lang === 'ml' ? 'കുടുംബ വോൾട്ട്' : 'Kudumba Vault');

  const displayFamilyDashboardSubtitle = activeFamilyName
    ? (lang === 'ml' ? `${activeFamilyName} ഫാമിലി ഡാഷ്‌ബോർഡ്` : `${activeFamilyName} Family Dashboard`)
    : (lang === 'ml' ? 'ഫാമിലി ഡാഷ്‌ബോർഡ്' : 'Family Dashboard');

  // Authoritative subscription entitlement state & Trial Ended Modal control
  const [entitlement, setEntitlement] = useState<EntitlementStatusClient | null>(null);
  const [isTrialEndedModalOpen, setIsTrialEndedModalOpen] = useState(false);
  const currentUserId = authUser?.id;

  const refreshEntitlement = useCallback(async (options?: { force?: boolean }) => {
    if (!currentUserId) return;
    try {
      const ent = await apiGetSubscriptionStatus({ force: options?.force, trigger: 'shell_entitlement' });
      setEntitlement(ent);
      if (ent.trialExpired && ent.status !== 'active') {
        setIsTrialEndedModalOpen(true);
      }
    } catch (err) {
      console.warn('[Subscription] Failed to load entitlement status:', err);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId) {
      refreshEntitlement();
    }
  }, [currentUserId, refreshEntitlement]);

  useEffect(() => {
    const handleStorageUpdated = () => {
      refreshEntitlement({ force: true });
    };
    window.addEventListener('kudumba:storage-updated', handleStorageUpdated);
    return () => {
      window.removeEventListener('kudumba:storage-updated', handleStorageUpdated);
    };
  }, [refreshEntitlement]);

  const selectedDoc = docs.find((d) => d.id === selectedDocId) || docs[0];
  const selectedMember =
    members.find((m) => m.id === selectedMemberId) || members[0];

  const countByCat = (catId: string) =>
    catId === 'ALL'
      ? docs.length
      : docs.filter((d) => d.categoryId === catId || d.category === catId)
          .length;

  const categories: CategoryMetaItem[] = [
    {
      id: 'ALL',
      ml: 'എല്ലാം (All)',
      en: 'All Vault',
      count: countByCat('ALL'),
      icon: FileText,
    },
    {
      id: 'IDENTITY',
      ml: 'തിരിച്ചറിയൽ',
      en: 'Identity',
      count: countByCat('IDENTITY'),
      icon: UserCheck,
    },
    {
      id: 'GULF',
      ml: 'ഗൾഫ് / NRI',
      en: 'Gulf / NRI',
      count: countByCat('GULF'),
      icon: Plane,
    },
    {
      id: 'VEHICLE',
      ml: 'വാഹനം',
      en: 'Vehicle',
      count: countByCat('VEHICLE'),
      icon: Car,
    },
    {
      id: 'PROPERTY',
      ml: 'വസ്തു / കരം',
      en: 'Property & Tax',
      count: countByCat('PROPERTY'),
      icon: HomeIcon,
    },
    {
      id: 'MEDICAL',
      ml: 'ഇൻഷുറൻസ് / മെഡിക്കൽ',
      en: 'Health & Policy',
      count: countByCat('MEDICAL') + countByCat('HEALTH'),
      icon: HeartPulse,
    },
  ];

  const filteredDocs = docs.filter((d) => {
    const matchesCat =
      selectedCategory === 'ALL' ||
      d.categoryId === selectedCategory ||
      d.category === selectedCategory ||
      (selectedCategory === 'MEDICAL' && d.category === 'HEALTH');
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      d.titleEn.toLowerCase().includes(q) ||
      d.titleMl.toLowerCase().includes(q) ||
      d.ownerEn.toLowerCase().includes(q) ||
      d.ownerMl.toLowerCase().includes(q) ||
      d.authorityEn.toLowerCase().includes(q) ||
      d.authorityMl.toLowerCase().includes(q) ||
      d.docNumber.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchEl = document.querySelector(
          'input[type="search"]'
        ) as HTMLInputElement | null;
        searchEl?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Backward navigation history stack
  const [navHistory, setNavHistory] = useState<
    Array<{
      nav: AppNavTab;
      subView: 'none' | 'doc-detail' | 'add-doc' | 'member-detail';
      docId?: string;
      memberId?: string;
    }>
  >([{ nav: 'home', subView: 'none' }]);

  const pushHistory = (
    nextNav: AppNavTab,
    nextSubView: 'none' | 'doc-detail' | 'add-doc' | 'member-detail',
    docId?: string,
    memberId?: string
  ) => {
    setNavHistory((prev) => {
      const top = prev[prev.length - 1];
      if (
        top &&
        top.nav === nextNav &&
        top.subView === nextSubView &&
        top.docId === docId &&
        top.memberId === memberId
      ) {
        return prev;
      }
      return [
        ...prev,
        {
          nav: nextNav,
          subView: nextSubView,
          docId,
          memberId,
        },
      ];
    });
  };

  const canGoBack =
    navHistory.length > 1 || subView !== 'none' || activeNav !== 'home';

  const handleGoBackward = () => {
    if (navHistory.length > 1) {
      const updated = [...navHistory];
      updated.pop(); // Pop current
      const prev = updated[updated.length - 1];
      setNavHistory(updated);
      setActiveNav(prev.nav);
      setSubView(prev.subView);
      if (prev.docId) setSelectedDocId(prev.docId);
      if (prev.memberId) setSelectedMemberId(prev.memberId);
      return;
    }

    if (subView !== 'none') {
      setSubView('none');
    } else if (activeNav !== 'home') {
      setActiveNav('home');
    }
  };

  // Keyboard shortcut listener: Alt + LeftArrow to go backward
  useEffect(() => {
    const onKeyNav = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.altKey && e.key === 'ArrowLeft') {
        if (canGoBack) {
          e.preventDefault();
          handleGoBackward();
        }
      } else if (!isInput && e.key === 'Backspace') {
        if (subView !== 'none' || activeNav !== 'home') {
          e.preventDefault();
          handleGoBackward();
        }
      }
    };
    window.addEventListener('keydown', onKeyNav);
    return () => window.removeEventListener('keydown', onKeyNav);
  }, [canGoBack, navHistory, subView, activeNav]);

  const handleSelectRailTab = (tab: AppNavTab) => {
    pushHistory(tab, 'none', selectedDocId, selectedMemberId);
    setActiveNav(tab);
    setSubView('none');
  };

  const handleOpenDocDetail = (doc: VaultDocumentItem) => {
    pushHistory(activeNav, 'doc-detail', doc.id, selectedMemberId);
    setSelectedDocId(doc.id);
    setSubView('doc-detail');
  };

  const handleOpenAddDoc = (forMemberName?: string) => {
    executeGuardedAction(
      () => {
        pushHistory(activeNav, 'add-doc', selectedDocId, selectedMemberId);
        setPreselectedMemberForDoc(forMemberName);
        setSubView('add-doc');
      },
      { promptMessage: mandatoryAuthMessage }
    );
  };

  const handleOpenAddMember = () => {
    executeGuardedAction(() => setShowAddMemberModal(true), { promptMessage: mandatoryAuthMessage });
  };

  const handleOpenAddWorker = () => {
    executeGuardedAction(() => setShowAddWorkerModal(true), { promptMessage: mandatoryAuthMessage });
  };

  const handleOpenAddShareModal = () => {
    executeGuardedAction(() => setShowAddShareModal(true), { promptMessage: mandatoryAuthMessage });
  };

  const handleOpenMemberDetailById = (memberId: string) => {
    pushHistory('people', 'member-detail', selectedDocId, memberId);
    setSelectedMemberId(memberId);
    setActiveNav('people');
    setSubView('member-detail');
  };

  const getPrimaryAddConfig = () => {
    if (activeNav === 'people') {
      return {
        label: lang === 'ml' ? 'അംഗത്തെ ചേർക്കുക' : 'Add Member',
        onClick: handleOpenAddMember,
      };
    }
    if (activeNav === 'workers') {
      return {
        label: lang === 'ml' ? 'ജോലിക്കാരനെ ചേർക്കുക' : 'Add Worker',
        onClick: handleOpenAddWorker,
      };
    }
    if (activeNav === 'share') {
      return {
        label: lang === 'ml' ? 'ഷെയർ പായ്ക്ക്' : 'Share Pack',
        onClick: handleOpenAddShareModal,
      };
    }
    return {
      label: lang === 'ml' ? 'രേഖ ചേർക്കുക' : 'Add Document',
      onClick: () => handleOpenAddDoc(),
    };
  };

  const primaryAdd = getPrimaryAddConfig();
  const expiringCount = docs.filter((d) => d.status !== 'VALID').length;

  const handleCreateServiceReminder = (
    worker: WorkerRecordItem,
    logEntry: { id: string; date: string; workEn: string; workMl: string }
  ) => {
    executeGuardedAction(() => {
      const baseDate = new Date(logEntry.date);
      const nextYear = isNaN(baseDate.getTime())
        ? new Date().getFullYear() + 1
        : baseDate.getFullYear() + 1;
      const monthDay =
        logEntry.date.length >= 10 ? logEntry.date.slice(4) : '-03-15';
      const nextExpiryDate = `${nextYear}${monthDay}`;
      const roleEn = worker.tradeEn || worker.roleEn || 'Household';
      const roleMl = worker.tradeMl || worker.roleMl || 'ഹൗസ്ഹോൾഡ്';

      const reminderDoc: VaultDocumentItem = {
        id: `doc-rem-${Date.now()}`,
        titleEn: `${roleEn} Annual Service (${worker.nameEn})`,
        titleMl: `${roleMl} വാർഷിക സർവീസ് (${worker.nameMl})`,
        subEn: `Scheduled maintenance • ${logEntry.workEn}`,
        subMl: `നിശ്ചയിച്ച സർവീസ് • ${logEntry.workMl}`,
        category: 'PROPERTY',
        ownerEn: 'All Family (Kochi)',
        ownerMl: 'കുടുംബം (കൊച്ചി)',
        docNumber: worker.phone,
        expiryDate: nextExpiryDate,
        status: 'VALID',
        daysTextEn: 'Scheduled',
        daysTextMl: 'നിശ്ചയിച്ചു',
        authorityEn: `${worker.nameEn} (${worker.areaEn})`,
        authorityMl: `${worker.nameMl} (${worker.areaMl})`,
        renewalHistory: [
          {
            id: `rh-${Date.now()}`,
            date: new Date().toISOString().slice(0, 10),
            actionEn: `Created annual reminder from Workers Book (${logEntry.workEn})`,
            actionMl: `ജോലിക്കാരുടെ ബുക്കിൽ നിന്ന് വാർഷിക ഓർമ്മപ്പെടുത്തൽ ചേർത്തു (${logEntry.workMl})`,
            by: 'Kudumba',
          },
        ],
      };

      onAddCreatedDoc(reminderDoc);
      onUpdateWorker({
        ...worker,
        history: worker.history.map((h) =>
          h.id === logEntry.id ? { ...h, reminderCreated: true } : h
        ),
      });
    }, { promptMessage: mandatoryAuthMessage });
  };

  return (
    <div className="relative flex min-h-screen w-full bg-white">
      {/* Desktop Left Coral-Red IconRail */}
      <IconRail
        activeTab={activeNav}
        onSelectTab={handleSelectRailTab}
        lang={lang}
        counts={{
          people: members.length,
          workers: workers.length,
          share: sharePacks.length,
          vaultHasExpiring: expiringCount > 0,
        }}
      />

      {/* Main White Dashboard Canvas with Balanced Left & Right Side Gaps */}
      <div className="flex-1 flex flex-col justify-between px-3.5 sm:px-10 md:px-14 lg:px-20 xl:px-24 py-3 sm:py-6 pb-28 md:pb-8 overflow-x-hidden">
        <div className="w-full max-w-[1140px] mx-auto">
          {/* Mandatory Email Verification Alert Banner */}
          {unverifiedEmail && (
            <div className="mb-4 rounded-2xl bg-[#FFF5F5] border border-[#FEE2E2] px-4 py-2.5 text-[12.5px] text-[#E03A45] flex flex-wrap items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-malayalam">
                  {lang === 'ml'
                    ? `ഇമെയിൽ സ്ഥിരീകരിച്ചിട്ടില്ല (${unverifiedEmail}). വോൾട്ട് പൂർണ്ണമായി ഉപയോഗിക്കാൻ 6 അക്ക കോഡ് രേഖപ്പെടുത്തുക.`
                    : `Email verification pending for ${unverifiedEmail}. Enter your 6-digit code to unlock your vault.`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  openAuthModal('verify-email');
                }}
                className="underline font-bold hover:text-[#C42F3A] cursor-pointer font-malayalam shrink-0"
              >
                {lang === 'ml' ? 'കോഡ് നൽകുക' : 'Enter Code'}
              </button>
            </div>
          )}

          {/* Seven-Day Inactivity Expiry Notice Banner */}
          {inactivityExpired && (
            <div className="mb-4 rounded-2xl bg-[#FEF3C7] border border-[#FDE68A] px-4 py-2.5 text-[12.5px] text-[#92400E] flex flex-wrap items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-[#B45309]" />
                <span className="font-malayalam font-medium">
                  {lang === 'ml'
                    ? '7 ദിവസത്തെ പ്രവർത്തനമില്ലായ്മ കാരണം നിങ്ങളുടെ സെഷൻ കാലഹരണപ്പെട്ടു. വോൾട്ട് അൺലോക്ക് ചെയ്യാൻ വീണ്ടും പ്രവേശിക്കുക.'
                    : 'Your session has expired due to 7 consecutive days of inactivity. Please sign in again to unlock your vault.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  openAuthModal('login');
                }}
                className="underline font-bold text-[#B45309] hover:text-[#78350F] cursor-pointer font-malayalam shrink-0"
              >
                {lang === 'ml' ? 'വീണ്ടും പ്രവേശിക്കുക (Sign In)' : 'Sign In Again'}
              </button>
            </div>
          )}

          {/* =========================================================================
              MOBILE TOP HEADER (Matches Screens 1-7 in Reference Image)
              ========================================================================= */}
          <div className="md:hidden pb-3 border-b border-[#E6E8EC] space-y-2">
            <div className="flex items-center justify-between gap-2">
              {/* Left: Section Icon in soft pink/red rounded badge + Title & Subtitle */}
              <div className="flex items-center gap-2.5 min-w-0">
                {subView !== 'none' ? (
                  <button
                    type="button"
                    onClick={handleGoBackward}
                    className="w-10 h-10 rounded-2xl bg-[#FFF0F1] text-[#E03A45] flex items-center justify-center shrink-0 cursor-pointer hover:bg-[#FCDADB] transition-colors"
                    aria-label="Back"
                  >
                    <ArrowLeft className="w-5 h-5 stroke-[2.3]" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSelectRailTab('home')}
                    className="w-10 h-10 rounded-2xl bg-[#FFF0F1] text-[#E03A45] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    {activeNav === 'vault' ? (
                      <FolderLock className="w-5 h-5" />
                    ) : activeNav === 'people' ? (
                      <Users className="w-5 h-5" />
                    ) : activeNav === 'workers' ? (
                      <Wrench className="w-5 h-5" />
                    ) : activeNav === 'share' ? (
                      <FolderLock className="w-5 h-5" />
                    ) : activeNav === 'settings' ? (
                      <Settings className="w-5 h-5" />
                    ) : (
                      <HomeIcon className="w-5 h-5" />
                    )}
                  </button>
                )}

                <div className="min-w-0">
                  <h1 className="text-[16px] font-extrabold text-[#111827] leading-tight truncate tracking-tight">
                    {displayFamilyVaultTitle}
                  </h1>
                  <p className="text-[11px] font-semibold text-[#64748B] leading-tight mt-0.5 truncate">
                    {displayFamilyDashboardSubtitle}
                  </p>
                </div>
              </div>

              {/* Right: Add Document, Search Toggle, Language Toggle, and Account Avatar */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Mobile Add Doc Button */}
                <button
                  type="button"
                  onClick={() => handleOpenAddDoc()}
                  aria-label="Add Document"
                  className="w-9 h-9 rounded-full bg-[#E03A45] text-white flex items-center justify-center hover:bg-[#C42F3A] cursor-pointer shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </button>

                {/* Search Toggle Icon */}
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen((prev) => !prev)}
                  aria-label="Search"
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    mobileSearchOpen || searchQuery
                      ? 'bg-[#E03A45] text-white shadow-2xs'
                      : 'bg-[#F5F6F8] text-[#5B6168] hover:text-[#0B0B0C]'
                  }`}
                >
                  <Search className="w-4 h-4" />
                </button>

                {/* Language Toggle Pill */}
                <button
                  type="button"
                  onClick={() => onToggleLang(lang === 'ml' ? 'en' : 'ml')}
                  className="h-8 px-2.5 rounded-full border border-[#E6E8EC] bg-[#F5F6F8] text-[11px] font-bold text-[#111827] flex items-center justify-center hover:border-[#111827] cursor-pointer"
                >
                  {lang === 'ml' ? 'EN' : 'മല'}
                </button>

                {/* Account / Avatar */}
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNav('settings');
                      setSubView('none');
                    }}
                    aria-label="Account Settings"
                    className="relative w-8 h-8 rounded-full border border-[#0F7B3E] bg-[#E4F7EC] text-[#0F7B3E] font-bold text-xs flex items-center justify-center cursor-pointer overflow-hidden shadow-xs"
                  >
                    <span>{currentUser.name?.charAt(0).toUpperCase() || 'U'}</span>
                    <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[#16A34A] ring-1 ring-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAuthModal('login', null)}
                    className="h-8 px-2.5 rounded-full bg-[#E03A45] text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{lang === 'ml' ? 'ലോഗിൻ' : 'Sign In'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Mobile Search Input when toggled or non-empty */}
            {(mobileSearchOpen || searchQuery) && (
              <div className="pt-1 animate-in fade-in duration-150">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A949E]" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      lang === 'ml'
                        ? 'രേഖകൾ, അംഗങ്ങൾ തിരയുക...'
                        : 'Search documents, members...'
                    }
                    className="w-full h-10 pl-9 pr-8 rounded-xl border border-[#E6E8EC] bg-[#F5F6F8] text-sm text-[#111827] placeholder:text-[#8A949E] focus:outline-none focus:border-[#E03A45] focus:bg-white"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#8A949E] hover:text-[#111827]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Top Utility Bar: Desktop Only */}
          <div className="hidden md:flex flex-wrap items-center justify-between gap-3.5 pb-4 border-b border-[#E6E8EC]">
            {/* Household Title Badge */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleSelectRailTab('home')}
                className="flex items-center gap-2.5 sm:gap-3 text-left cursor-pointer"
              >
                <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-[#FDECEE] text-[#E03A45]">
                  <HomeIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <p className="text-[14px] sm:text-[15px] font-bold text-[#0B0B0C] leading-tight tracking-tight truncate max-w-[180px] sm:max-w-[240px]">
                    {displayFamilyVaultTitle}
                  </p>
                  <p className="text-[11.5px] font-medium text-[#5B6168] leading-tight mt-0.5 truncate max-w-[180px] sm:max-w-[240px]">
                    {displayFamilyDashboardSubtitle}
                  </p>
                </div>
              </button>
            </div>

            <SearchPill
              value={searchQuery}
              onChange={(val) => {
                setSearchQuery(val);
                if (subView !== 'none') setSubView('none');
              }}
              placeholder={
                lang === 'ml'
                  ? 'രേഖകൾ, അംഗങ്ങൾ, ജോലിക്കാർ തിരയുക...'
                  : 'Search navigations... Ctrl K'
              }
            />

            <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => handleOpenAddDoc()}
                className="spring-interactive inline-flex h-[36px] items-center gap-1.5 rounded-full bg-[#E03A45] hover:bg-[#C42F3A] px-3.5 text-[11.5px] font-semibold text-white shadow-xs cursor-pointer transition-colors"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>{lang === 'ml' ? 'പുതിയ രേഖ' : 'Add Document'}</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleLang(lang === 'ml' ? 'en' : 'ml')}
                className="spring-interactive inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#E6E8EC] bg-[#F8F9FA] pl-3 pr-1 text-[11.5px] font-semibold text-[#0B0B0C] hover:border-[#0B0B0C] cursor-pointer"
              >
                <span>{lang === 'ml' ? 'English' : 'മലയാളം'}</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0B0B0C] text-[10px] font-bold text-white">
                  {lang === 'ml' ? 'മല' : 'EN'}
                </span>
              </button>

              {/* Authentication Status & Account Menu */}
              {currentUser ? (
                <div ref={accountMenuRef} className="relative group">
                  <button
                    type="button"
                    onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                    aria-expanded={isAccountMenuOpen}
                    aria-haspopup="true"
                    className={`inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#0F7B3E] bg-[#E4F7EC] px-3 text-[11.5px] font-semibold text-[#0F7B3E] transition-all cursor-pointer select-none hover:bg-[#D1F2DF] hover:border-[#0B6833] hover:text-[#0B6833] hover:shadow-xs active:scale-[0.98] ${
                      isAccountMenuOpen ? 'bg-[#D1F2DF] border-[#0B6833] text-[#0B6833]' : ''
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="max-w-[100px] truncate">{currentUser.name}</span>
                    <ChevronDown
                      className={`h-3 w-3 opacity-60 transition-transform duration-200 ${
                        isAccountMenuOpen ? 'rotate-180' : 'group-hover:rotate-180'
                      }`}
                    />
                  </button>
                  <div
                    className={`absolute right-0 top-full pt-1.5 z-50 transition-all before:absolute before:-top-2 before:h-2 before:inset-x-0 ${
                      isAccountMenuOpen ? 'block' : 'hidden group-hover:block'
                    }`}
                  >
                    <div className="w-48 rounded-2xl bg-white p-1.5 shadow-xl border border-[#E6E8EC] animate-in fade-in duration-150">
                      <div className="px-3 py-1.5 border-b border-[#F4F5F7] text-[11px] text-[#5B6168] truncate">
                        {currentUser.email}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          setIsMigrationModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] font-semibold text-[#0B0B0C] hover:bg-[#F8F9FA] cursor-pointer transition-colors"
                      >
                        <CloudUpload className="h-3.5 w-3.5 text-[#0F7B3E]" />
                        <span>{lang === 'ml' ? 'ലോക്കൽ സിങ്ക്' : 'Sync Local Vault'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsAccountMenuOpen(false);
                          await logout();
                        }}
                        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] font-semibold text-[#E03A45] hover:bg-[#FFF5F5] cursor-pointer transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>{lang === 'ml' ? 'പുറത്തുകടക്കുക' : 'Sign Out'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openAuthModal('login', null)}
                  className="spring-interactive inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#E6E8EC] bg-[#F8F9FA] px-3.5 text-[11.5px] font-semibold text-[#0B0B0C] hover:border-[#0B0B0C] cursor-pointer transition-colors"
                >
                  <LogIn className="h-3.5 w-3.5 text-[#E03A45]" />
                  <span>{lang === 'ml' ? 'പ്രവേശിക്കുക' : 'Sign In'}</span>
                </button>
              )}
            </div>
          </div>

          {subView === 'add-doc' && (
            <div className="mt-6">
              <Screen4AddDocument
                lang={lang}
                members={members}
                defaultOwner={preselectedMemberForDoc}
                entitlement={entitlement}
                currentDocumentCount={docs.length}
                onOpenUpgrade={() => {
                  setActiveNav('settings');
                  setSubView('none');
                }}
                onRefreshEntitlement={refreshEntitlement}
                onAddCreatedDoc={(newDoc) => {
                  onAddCreatedDoc(newDoc);
                  refreshEntitlement();
                  setSelectedDocId(newDoc.id);
                  setSubView('doc-detail');
                }}
                onCancel={() => setSubView('none')}
              />
            </div>
          )}

          {subView === 'doc-detail' && selectedDoc && (
            <div className="mt-6">
              <Screen3DocumentDetail
                lang={lang}
                doc={selectedDoc}
                onRenewDocument={guardedRenewDocument}
                onUpdateDocument={guardedUpdateDocument}
                onDeleteDocument={guardedDeleteDocument}
                onBackToHome={() => setSubView('none')}
              />
            </div>
          )}

          {subView === 'member-detail' && selectedMember && (
            <div className="mt-6">
              <MemberDetailScreen
                lang={lang}
                member={selectedMember}
                docs={docs}
                onBack={() => setSubView('none')}
                onSelectDoc={(docId) => {
                  setSelectedDocId(docId);
                  setSubView('doc-detail');
                }}
                onAddDocForMember={(memberName) => handleOpenAddDoc(memberName)}
                onRenewDoc={guardedRenewDocument}
                onUpdateMember={guardedUpdateMember}
                onDeleteMember={(id) => {
                  guardedDeleteMember(id).then((ok) => {
                    if (ok) setSubView('none');
                  });
                }}
              />
            </div>
          )}

          {subView === 'none' && activeNav === 'home' && (
            <div className="mt-6">
              <HomeDashboardScreen
                lang={lang}
                familyName={activeFamilyName}
                docs={docs}
                filteredDocs={filteredDocs}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                completenessScore={completenessScore}
                expiringCount={expiringCount}
                onOpenDocDetail={handleOpenDocDetail}
                onOpenAddDoc={() => handleOpenAddDoc()}
                onOpenWorkers={() => handleSelectRailTab('workers')}
                isAuthenticated={!!currentUser}
                onOpenSignIn={() => openAuthModal('login', null)}
                onOpenSignUp={() => openAuthModal('register', null)}
                onExploreFeatures={() => {
                  setSelectedCategory('ALL');
                  const targetEl = document.getElementById('vault-categories-section');
                  if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              />
            </div>
          )}

          {subView === 'none' && activeNav === 'vault' && (
            <div className="mt-6">
              <VaultExplorerScreen
                lang={lang}
                filteredDocs={filteredDocs}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onOpenDocDetail={handleOpenDocDetail}
                onOpenAddDoc={() => handleOpenAddDoc()}
              />
            </div>
          )}

          {subView === 'none' && activeNav === 'people' && (
            <div className="mt-6">
              <PeopleGridScreen
                lang={lang}
                members={members}
                docs={docs}
                onSelectMember={handleOpenMemberDetailById}
                onSelectDoc={(docId) => {
                  setSelectedDocId(docId);
                  setSubView('doc-detail');
                }}
                onOpenAddMember={handleOpenAddMember}
                onAddDocForMember={(memberName) => handleOpenAddDoc(memberName)}
              />
            </div>
          )}

          {subView === 'none' && activeNav === 'workers' && (
            <div className="mt-6">
              <WorkersBookScreen
                lang={lang}
                workers={workers}
                searchQuery={searchQuery}
                onOpenAddWorker={handleOpenAddWorker}
                onAddLog={(workerId, newEntry) => {
                  executeGuardedAction(() => {
                    const target = workers.find((w) => w.id === workerId);
                    if (!target) return;
                    onUpdateWorker({
                      ...target,
                      lastVisit: newEntry.date,
                      lastServiceDate: newEntry.date,
                      history: [newEntry, ...target.history],
                    });
                  }, { promptMessage: mandatoryAuthMessage });
                }}
                onUpdateWorker={guardedUpdateWorker}
                onDeleteWorker={guardedDeleteWorker}
                onCreateServiceReminder={handleCreateServiceReminder}
              />
            </div>
          )}

          {subView === 'none' && activeNav === 'share' && (
            <div className="mt-6">
              <SharePacksScreen
                lang={lang}
                sharePacks={sharePacks}
                docs={docs}
                onOpenAddShareModal={handleOpenAddShareModal}
                onDeleteSharePack={guardedDeleteSharePack}
                onOpenDocDetail={handleOpenDocDetail}
              />
            </div>
          )}

          {subView === 'none' && activeNav === 'settings' && (
            <div className="mt-6">
              <SettingsDashboardScreen
                lang={lang}
                onToggleLang={onToggleLang}
                docs={docs}
                members={members}
                sharePacks={sharePacks}
                workers={workers}
                onNavigateHome={() => handleSelectRailTab('home')}
                initialSection="plan"
              />
            </div>
          )}
        </div>
      </div>

      {/* Floating Install Prompt Banner (Fixed in Bottom-Right Corner) */}
      {showInstallPrompt && subView === 'none' && (
        <aside
          aria-label="Install Prompt"
          className="fixed bottom-20 md:bottom-6 right-4 md:right-8 z-40 max-w-[calc(100vw-2rem)] sm:max-w-md shadow-2xl transition-all duration-300"
        >
          <InstallPrompt
            lang={lang}
            onInstall={() => setShowInstallPrompt(false)}
            onDismiss={() => setShowInstallPrompt(false)}
          />
        </aside>
      )}

      {/* Mobile Bottom Tabs + Floating Coral "+" Button */}
      <BottomTabs
        activeTab={activeNav}
        onSelectTab={(tab) => {
          setShowMobileMoreSheet(false);
          handleSelectRailTab(tab);
        }}
        onAddDocument={primaryAdd.onClick}
        onOpenMore={() => setShowMobileMoreSheet((prev) => !prev)}
        isMoreOpen={showMobileMoreSheet}
        lang={lang}
      />

      {/* Mobile More Options Bottom Sheet */}
      <MobileMoreSheet
        isOpen={showMobileMoreSheet}
        onClose={() => setShowMobileMoreSheet(false)}
        onSelectTab={(tab) => {
          setShowMobileMoreSheet(false);
          handleSelectRailTab(tab);
        }}
        onToggleLang={() => onToggleLang(lang === 'ml' ? 'en' : 'ml')}
        lang={lang}
        counts={{
          people: members.length,
          share: sharePacks.length,
        }}
      />

      {showAddMemberModal && (
        <AddMemberModal
          lang={lang}
          onClose={() => setShowAddMemberModal(false)}
          onSave={async (member) => {
            const ok = await guardedAddMember(member);
            if (ok) {
              setShowAddMemberModal(false);
              setSelectedMemberId(member.id);
              setActiveNav('people');
              setSubView('member-detail');
            }
          }}
        />
      )}

      {showAddWorkerModal && (
        <AddWorkerModal
          lang={lang}
          onClose={() => setShowAddWorkerModal(false)}
          onSave={(worker) => {
            guardedAddWorker(worker).then((ok) => {
              if (ok) {
                setShowAddWorkerModal(false);
                setActiveNav('workers');
              }
            });
          }}
        />
      )}

      {showAddShareModal && (
        <AddSharePackModal
          lang={lang}
          docs={docs}
          members={members}
          onClose={() => setShowAddShareModal(false)}
          onSave={(pack) => {
            guardedAddSharePack(pack).then((ok) => {
              if (ok) {
                setShowAddShareModal(false);
                setActiveNav('share');
              }
            });
          }}
        />
      )}

      {/* Cloud Authentication & Sync Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        promptMessage={authPromptMessage}
        onClose={closeAuthModal}
        onSuccess={handleAuthSuccess}
        lang={lang}
      />

      <MigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        lang={lang}
      />

      {/* Trial Expiry & Grace Period Modal */}
      <TrialEndedModal
        isOpen={isTrialEndedModalOpen}
        onClose={() => setIsTrialEndedModalOpen(false)}
        entitlement={entitlement}
        onOpenUpgrade={() => {
          setIsTrialEndedModalOpen(false);
          setActiveNav('settings');
          setSubView('none');
        }}
        onViewDocuments={() => {
          setIsTrialEndedModalOpen(false);
          setActiveNav('vault');
          setSubView('none');
        }}
        lang={lang}
      />
    </div>
  );
};
