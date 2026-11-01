import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  VaultDocumentItem,
  HouseholdMemberItem,
  WorkerRecordItem,
  SharePackItem,
} from './types/vault';
import { AppWorkspaceShell } from './components/layout/AppWorkspaceShell';
import { computeCompletenessScore } from './utils/vaultLogic';
import { getDefaultDocScanDataUrl } from './utils/documentCardGenerator';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  apiGetDocuments,
  apiGetMembers,
  apiCreateMember,
  apiUpdateMember,
  apiDeleteMember,
  apiGetWorkers,
  apiCreateWorker,
  apiUpdateWorker,
  apiDeleteWorker,
  apiGetSharePacks,
  apiCreateSharePack,
  apiDeleteSharePack,
  apiUpdateDocument,
  apiDeleteDocument,
} from './services/apiClient';
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import { LandingPage } from './components/LandingPage';
import { PlanComparisonModal } from './components/modals/PlanComparisonModal';

function AppWorkspaceContent() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [lang, setLang] = useState<'ml' | 'en'>(() => {
    try {
      return (window.localStorage.getItem('kudumba_vault_lang') as 'ml' | 'en') || 'ml';
    } catch {
      return 'ml';
    }
  });

  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Navigation routing state:
  // - /welcome, /landing, or / (automatically redirected) -> Public Marketing Landing Page
  // - /app or /vault -> Household Vault App Workspace
  // - /super-admin -> Super Admin Dashboard
  // - /plans or /pricing -> Plan Comparison
  // - /login or /signin -> Direct Sign In view
  // - /register or /signup -> Direct Sign Up view
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (p === '/' || p === '') {
        window.history.replaceState(null, '', '/welcome');
        return '/welcome';
      }
      return p;
    }
    return '/welcome';
  });

  const isSuperAdminView = currentPath.startsWith('/super-admin');
  const isLandingView =
    currentPath === '/welcome' ||
    currentPath === '/landing' ||
    currentPath === '/' ||
    currentPath === '';
  const isPlansView = currentPath === '/plans' || currentPath === '/pricing';
  const isLoginView = currentPath === '/login' || currentPath === '/signin';
  const isRegisterView = currentPath === '/register' || currentPath === '/signup';

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname;
      if (p === '/' || p === '') {
        window.history.replaceState(null, '', '/welcome');
        setCurrentPath('/welcome');
      } else {
        setCurrentPath(p);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (currentPath === '/' || currentPath === '') {
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/welcome');
        setCurrentPath('/welcome');
      }
    }
  }, [currentPath]);

  useEffect(() => {
    if (isAuthenticated && (isLoginView || isRegisterView)) {
      navigateTo('/app');
    }
  }, [isAuthenticated, isLoginView, isRegisterView]);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', path);
      setCurrentPath(path);
    }
  };

  // Cloud-persisted collections backed by MongoDB Atlas and Supabase Storage
  const [docs, setDocs] = useState<VaultDocumentItem[]>([]);
  const [members, setMembers] = useState<HouseholdMemberItem[]>([]);
  const [workers, setWorkers] = useState<WorkerRecordItem[]>([]);
  const [sharePacks, setSharePacks] = useState<SharePackItem[]>([]);

  // Fetch real persistent data from backend whenever authentication status changes
  useEffect(() => {
    let mounted = true;

    async function loadCloudData() {
      // 1. Wait until authentication state is resolved before querying
      if (authLoading) return;

      // 2. If unauthenticated, reset collections to empty state without querying protected endpoints
      if (!isAuthenticated) {
        if (mounted) {
          setDocs([]);
          setMembers([]);
          setWorkers([]);
          setSharePacks([]);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setBackendError(null);

        const [cloudDocs, cloudMembers, cloudWorkers, cloudSharePacks] = await Promise.all([
          apiGetDocuments().catch((err) => {
            console.warn('[App] Documents fetch notice:', err);
            return [];
          }),
          apiGetMembers().catch((err) => {
            console.warn('[App] Members fetch notice:', err);
            return [];
          }),
          apiGetWorkers().catch((err) => {
            console.warn('[App] Workers fetch notice:', err);
            return [];
          }),
          apiGetSharePacks().catch((err) => {
            console.warn('[App] Share packs fetch notice:', err);
            return [];
          }),
        ]);

        if (!mounted) return;

        const mappedDocs: VaultDocumentItem[] = (cloudDocs || []).map((d: any) => {
          let resolvedMemberId = d.memberId;
          if (!resolvedMemberId && d.ownerNameEn) {
            const matched = cloudMembers?.find(
              (m: any) =>
                m.nameEn &&
                m.nameEn.trim().toLowerCase() === String(d.ownerNameEn).trim().toLowerCase()
            );
            if (matched) {
              resolvedMemberId = matched._id || matched.id;
            }
          }
          const docItem: VaultDocumentItem = {
            id: d._id || d.id,
            titleMl: d.titleMl || d.title,
            titleEn: d.title,
            category: d.category,
            categoryMl: d.categoryMl || d.category,
            categoryEn: d.category,
            subMl: d.categoryMl || d.category,
            subEn: d.category,
            ownerMl: d.ownerNameMl || 'കുടുംബാംഗം',
            ownerEn: d.ownerNameEn || 'Household Member',
            memberId: resolvedMemberId,
            docNumber: d.docNumber || '',
            expiryDate: d.expiryDate ? new Date(d.expiryDate).toISOString().split('T')[0] : 'Lifetime',
            status: (() => {
              if (!d.expiryDate) return 'VALID';
              const diff = Math.round((new Date(d.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return diff < 0 ? 'EXPIRED' : diff <= 60 ? 'DUE_SOON' : 'VALID';
            })(),
            authorityMl: d.authorityMl || 'ഔദ്യോഗിക അതോറിറ്റി',
            authorityEn: d.authorityEn || 'Official Authority',
            renewalHistory: d.renewalHistory || [],
            fileDataUrl: d.signedUrl || d.fileDataUrl,
            fileName: d.fileName,
            fileSize: typeof d.fileSize === 'number' && !isNaN(d.fileSize) ? d.fileSize : undefined,
          };
          if (!docItem.fileDataUrl) {
            docItem.fileDataUrl = getDefaultDocScanDataUrl(docItem);
          }
          return docItem;
        });

        const seenMemberIds = new Set<string>();
        const mappedMembers: HouseholdMemberItem[] = [];
        for (const m of cloudMembers || []) {
          const mid = m._id || m.id;
          if (mid && !seenMemberIds.has(mid)) {
            seenMemberIds.add(mid);
            mappedMembers.push({
              id: mid,
              nameEn: m.nameEn,
              nameMl: m.nameMl,
              relationEn: m.relationEn,
              relationMl: m.relationMl,
              location: m.location || m.locEn,
              locEn: m.locEn || m.location,
              locMl: m.locMl || m.location,
              phone: m.phone,
              whatsapp: m.whatsapp,
              email: m.email,
              role: m.role || 'EDITOR',
              status: m.status || 'ACTIVE',
              initials: m.initials,
              avatarBg: m.colorHex || m.avatarBg || '#E03A45',
              avatarDataUrl: m.avatarDataUrl,
              homePhone: m.homePhone,
              residencyStatus: m.residencyStatus,
              householdName: m.householdName,
            });
          }
        }

        const mappedWorkers: WorkerRecordItem[] = (cloudWorkers || []).map((w: any) => ({
          id: w._id || w.id,
          nameEn: w.nameEn,
          nameMl: w.nameMl,
          areaEn: w.areaEn,
          areaMl: w.areaMl,
          tradeEn: w.tradeEn,
          tradeMl: w.tradeMl,
          tradeId: w.tradeId,
          iconName: w.iconName,
          countryCode: w.countryCode || '+91',
          phone: w.phone,
          altPhone: w.altPhone,
          whatsapp: w.whatsapp,
          rateAmount: w.rateAmount,
          rateUnit: w.rateUnit,
          lastVisit: w.lastVisit,
          lastServiceDate: w.lastServiceDate,
          notesEn: w.notesEn,
          notesMl: w.notesMl,
          rating: w.rating || 5,
          favourite: w.favourite || false,
          history: (w.history || []).map((h: any) => ({
            id: h.id,
            date: h.date,
            workEn: h.workEn,
            workMl: h.workMl,
            amount: h.amount,
            paid: h.paid,
            photoDataUrl: h.photoDataUrl,
            reminderCreated: h.reminderCreated,
          })),
        }));

        const mappedSharePacks: SharePackItem[] = (cloudSharePacks || []).map((sp: any) => ({
          id: sp._id || sp.id,
          titleEn: sp.titleEn,
          titleMl: sp.titleMl,
          recipientEn: sp.recipientEn,
          recipientMl: sp.recipientMl,
          descEn: sp.purpose || sp.descEn,
          descMl: sp.purpose || sp.descMl,
          docIds: sp.docIds || [],
          tag: sp.watermarkText || 'Kudumba Vault',
          createdAt: sp.createdAt ? new Date(sp.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          active: true,
        }));

        setDocs(mappedDocs);
        setMembers(mappedMembers);
        setWorkers(mappedWorkers);
        setSharePacks(mappedSharePacks);
      } catch (err: unknown) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to connect to cloud backend';
        console.error('[App] Failed to load initial cloud collections:', err);
        setBackendError(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCloudData();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, authLoading]);

  const handleToggleLang = () => {
    setLang((prev) => {
      const next = prev === 'ml' ? 'en' : 'ml';
      try {
        window.localStorage.setItem('kudumba_vault_lang', next);
      } catch {
        // Safe localStorage failure
      }
      return next;
    });
  };

  const completenessScore = computeCompletenessScore(docs.length, 18);

  // Document Operations connected to MongoDB & Supabase Storage
  const renewingDocsRef = useRef(new Set<string>());

  const handleRenewDocument = async (docId: string) => {
    // 1. Prevent concurrent in-flight renewal
    if (renewingDocsRef.current.has(docId)) {
      console.warn(`[App] Renewal already in-flight for document ${docId}`);
      return;
    }

    try {
      const target = docs.find((d) => d.id === docId);
      if (!target) return;

      // 2. Prevent duplicate renewals on the same calendar day
      const today = new Date().toISOString().slice(0, 10);
      const isAlreadyRenewedToday = target.renewalHistory?.some(
        (entry) =>
          entry.date === today &&
          (entry.actionEn?.toLowerCase().includes('renewed') || entry.actionMl?.includes('പുതുക്കി'))
      );

      if (isAlreadyRenewedToday) {
        console.warn(`[App] Document ${docId} has already been renewed today; blocking duplicate renewal.`);
        return;
      }

      renewingDocsRef.current.add(docId);

      const currentExpiry = target.expiryDate && target.expiryDate !== 'Lifetime' ? new Date(target.expiryDate) : new Date();
      currentExpiry.setFullYear(currentExpiry.getFullYear() + 1);
      const newExpiryIso = currentExpiry.toISOString().slice(0, 10);
      const actionEn = `Renewed until ${newExpiryIso}`;
      const actionMl = `${newExpiryIso} വരെ പുതുക്കി`;
      const historyEntry = { id: `ren-${Date.now()}`, date: today, actionEn, actionMl, by: 'Household Admin' };
      const updatedHistory = [historyEntry, ...(target.renewalHistory || [])];

      const updated = await apiUpdateDocument(docId, {
        expiryDate: newExpiryIso,
        renewalHistory: updatedHistory,
      });

      setDocs((prev) =>
        prev.map((d) => {
          if (d.id !== docId) return d;
          return {
            ...d,
            expiryDate: newExpiryIso,
            status: 'VALID',
            renewalHistory: updated.renewalHistory || updatedHistory,
          };
        })
      );
    } catch (err) {
      console.error('[App] Failed to renew document in MongoDB:', err);
    } finally {
      renewingDocsRef.current.delete(docId);
    }
  };

  const handleUpdateDocument = async (updatedDoc: VaultDocumentItem) => {
    try {
      await apiUpdateDocument(updatedDoc.id, {
        title: updatedDoc.titleEn,
        titleMl: updatedDoc.titleMl,
        category: updatedDoc.category,
        categoryMl: updatedDoc.categoryMl,
        docNumber: updatedDoc.docNumber,
        expiryDate: updatedDoc.expiryDate && updatedDoc.expiryDate !== 'Lifetime' ? updatedDoc.expiryDate : null,
        ownerNameEn: updatedDoc.ownerEn,
        ownerNameMl: updatedDoc.ownerMl,
        memberId: updatedDoc.memberId,
        authorityEn: updatedDoc.authorityEn,
        authorityMl: updatedDoc.authorityMl,
        renewalHistory: updatedDoc.renewalHistory,
      });

      setDocs((prev) =>
        prev.map((d) => (d.id === updatedDoc.id ? { ...d, ...updatedDoc } : d))
      );
    } catch (err) {
      console.error('[App] Failed to update document in MongoDB:', err);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      const res = await apiDeleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (res.storageStats && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kudumba:storage-updated', { detail: res.storageStats }));
      }
    } catch (err) {
      console.error('[App] Failed to delete document from MongoDB/Supabase:', err);
    }
  };

  const handleAddCreatedDoc = (newDoc: VaultDocumentItem) => {
    setDocs((prev) => [newDoc, ...prev]);
    // Refetch authoritative storage accounting to reconcile optimistic document addition
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kudumba:storage-updated'));
    }
  };

  // Household Member Operations connected to MongoDB
  const handleAddMember = async (newMember: HouseholdMemberItem) => {
    try {
      const created = await apiCreateMember(newMember);
      const memberItem: HouseholdMemberItem = {
        id: created._id || created.id,
        nameEn: created.nameEn,
        nameMl: created.nameMl,
        relationEn: created.relationEn,
        relationMl: created.relationMl,
        location: created.location || created.locEn,
        locEn: created.locEn || created.location,
        locMl: created.locMl || created.location,
        phone: created.phone,
        whatsapp: created.whatsapp,
        email: created.email,
        role: created.role || 'EDITOR',
        status: created.status || 'ACTIVE',
        initials: created.initials || created.nameEn.slice(0, 2).toUpperCase(),
        colorHex: created.colorHex,
        avatarBg: created.colorHex || created.avatarBg || '#E03A45',
        avatarDataUrl: created.avatarDataUrl,
        homePhone: created.homePhone,
        residencyStatus: created.residencyStatus,
        householdName: created.householdName,
      };
      setMembers((prev) => {
        const filtered = prev.filter((m) => m.id !== memberItem.id);
        return [...filtered, memberItem];
      });
      return memberItem;
    } catch (err) {
      console.error('[App] Failed to save household member to MongoDB:', err);
      throw err;
    }
  };

  const handleUpdateMember = async (updatedMember: HouseholdMemberItem) => {
    try {
      const updated = await apiUpdateMember(updatedMember.id, updatedMember);
      setMembers((prev) =>
        prev.map((m) => (m.id === updatedMember.id ? { ...m, ...updated } : m))
      );
      return updated;
    } catch (err) {
      console.error('[App] Failed to update household member in MongoDB:', err);
      throw err;
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    try {
      await apiDeleteMember(memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      console.error('[App] Failed to delete household member from MongoDB:', err);
    }
  };

  // Service Worker Directory Operations connected to MongoDB
  const handleAddWorker = async (newWorker: WorkerRecordItem) => {
    try {
      const created = await apiCreateWorker(newWorker);
      const workerItem: WorkerRecordItem = {
        id: created._id || created.id,
        nameEn: created.nameEn,
        nameMl: created.nameMl,
        areaEn: created.areaEn,
        areaMl: created.areaMl,
        tradeEn: created.tradeEn,
        tradeMl: created.tradeMl,
        tradeId: created.tradeId,
        iconName: created.iconName,
        countryCode: created.countryCode,
        phone: created.phone,
        altPhone: created.altPhone,
        whatsapp: created.whatsapp,
        rateAmount: created.rateAmount,
        rateUnit: created.rateUnit,
        lastVisit: created.lastVisit,
        lastServiceDate: created.lastServiceDate,
        notesEn: created.notesEn,
        notesMl: created.notesMl,
        rating: created.rating,
        favourite: created.favourite,
        history: created.history || [],
      };
      setWorkers((prev) => [workerItem, ...prev]);
    } catch (err) {
      console.error('[App] Failed to save worker to MongoDB:', err);
    }
  };

  const handleUpdateWorker = async (updatedWorker: WorkerRecordItem) => {
    try {
      const updated = await apiUpdateWorker(updatedWorker.id, updatedWorker);
      setWorkers((prev) =>
        prev.map((w) => (w.id === updatedWorker.id ? { ...w, ...updated } : w))
      );
    } catch (err) {
      console.error('[App] Failed to update worker in MongoDB:', err);
    }
  };

  const handleDeleteWorker = async (workerId: string) => {
    try {
      await apiDeleteWorker(workerId);
      setWorkers((prev) => prev.filter((w) => w.id !== workerId));
    } catch (err) {
      console.error('[App] Failed to delete worker from MongoDB:', err);
    }
  };

  // Share Pack Operations connected to MongoDB
  const handleAddSharePack = async (newPack: SharePackItem) => {
    try {
      const created = await apiCreateSharePack(newPack);
      const packItem: SharePackItem = {
        id: created._id || created.id,
        titleEn: created.titleEn,
        titleMl: created.titleMl,
        recipientEn: created.recipientEn,
        recipientMl: created.recipientMl,
        descEn: created.purpose || created.descEn,
        descMl: created.purpose || created.descMl,
        docIds: created.docIds || [],
        tag: created.watermarkText || 'Kudumba Vault',
        createdAt: created.createdAt ? new Date(created.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        active: true,
      };
      setSharePacks((prev) => [packItem, ...prev]);
    } catch (err) {
      console.error('[App] Failed to save share pack to MongoDB:', err);
    }
  };

  const handleDeleteSharePack = async (packId: string) => {
    try {
      await apiDeleteSharePack(packId);
      setSharePacks((prev) => prev.filter((sp) => sp.id !== packId));
    } catch (err) {
      console.error('[App] Failed to delete share pack from MongoDB:', err);
    }
  };

  // Prevent protected content flashing before initial session verification completes
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF5F5] border border-[#FEE2E2] text-[#E03A45] mb-3 shadow-xs">
          <ShieldCheck className="h-7 w-7 stroke-[2.2] animate-pulse" />
        </div>
        <h1 className="text-lg font-bold text-[#0B0B0C] font-malayalam tracking-tight">
          {lang === 'ml' ? 'കുടുംബ വോൾട്ട് ലോഡ് ചെയ്യുന്നു...' : 'Loading Kudumba Vault...'}
        </h1>
        <p className="text-xs text-[#5B6168] mt-0.5 font-malayalam">
          {lang === 'ml' ? 'സുരക്ഷിതമായ സെഷൻ പരിശോധിക്കുന്നു' : 'Verifying secure session'}
        </p>
      </div>
    );
  }

  if (isSuperAdminView) {
    return (
      <SuperAdminDashboard
        onBackToApp={() => {
          navigateTo('/app');
        }}
      />
    );
  }

  if (isLoginView) {
    return (
      <LandingPage
        onEnterApp={() => {
          navigateTo('/app');
        }}
        lang={lang}
        initialAuthMode="login"
        autoOpenAuth={true}
      />
    );
  }

  if (isRegisterView) {
    return (
      <LandingPage
        onEnterApp={() => {
          navigateTo('/app');
        }}
        lang={lang}
        initialAuthMode="register"
        autoOpenAuth={true}
      />
    );
  }

  if (isLandingView) {
    return (
      <LandingPage
        onEnterApp={() => {
          navigateTo('/app');
        }}
        lang={lang}
      />
    );
  }

  if (isPlansView) {
    return (
      <PlanComparisonModal
        isOpen={true}
        onClose={() => {
          navigateTo('/app');
        }}
        lang={lang}
        onSelectPlan={(_planId) => {
          navigateTo('/app?managePlan=true');
        }}
      />
    );
  }

  return (
    <div
      lang={lang}
      className={`min-h-screen bg-[#FFFFFF] text-[#0B0B0C] ${
        lang === 'ml' ? 'font-malayalam' : 'font-sans'
      }`}
    >
      <AppWorkspaceShell
        lang={lang}
        onToggleLang={handleToggleLang}
        docs={docs}
        members={members}
        workers={workers}
        sharePacks={sharePacks}
        completenessScore={completenessScore}
        onRenewDocument={handleRenewDocument}
        onUpdateDocument={handleUpdateDocument}
        onDeleteDocument={handleDeleteDocument}
        onAddCreatedDoc={handleAddCreatedDoc}
        onAddMember={handleAddMember}
        onUpdateMember={handleUpdateMember}
        onDeleteMember={handleDeleteMember}
        onAddWorker={handleAddWorker}
        onUpdateWorker={handleUpdateWorker}
        onDeleteWorker={handleDeleteWorker}
        onAddSharePack={handleAddSharePack}
        onDeleteSharePack={handleDeleteSharePack}
      />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppWorkspaceContent />
    </AuthProvider>
  );
}

export default App;
