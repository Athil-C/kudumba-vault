import React, { useState, useMemo, useEffect } from 'react';
import {
  Settings,
  CreditCard,
  BarChart2,
  Wallet,
  Crown,
  Users,
  HardDrive,
  FileText,
  Folder,
  Link2,
  FileCheck,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Printer,
  ArrowRight,
  ArrowLeft,
  Database,
  Lock,
  Mail,
  Globe,
  Bell,
  RefreshCw,
  LogOut,
  X,
  FileDown,
  Clock,
} from 'lucide-react';
import { Button, Card, StatusBadge } from '../ui/DesignSystem';
import { useAuth } from '../../context/AuthContext';
import {
  apiSyncProfile,
  apiGetSettings,
  apiUpdateProfileSettings,
  apiUpdateNotificationSettings,
  apiUpdateSecuritySettings,
  apiGetStorageUsage,
  StorageUsageStats,
  apiGetSubscriptionStatus,
  apiSimulateSubscriptionDev,
  EntitlementStatusClient,
  invalidateSubscriptionCache,
} from '../../services/apiClient';
import { calculateStorageUsage, calculateMemberSeatsUsage, BYTES_PER_GIB } from '../../utils/vaultLogic';
import { getPlanConfig } from '../../config/planConfig';
import {
  Language,
  VaultDocumentItem,
  HouseholdMemberItem,
  SharePackItem,
  WorkerRecordItem,
} from '../../types/vault';
import { PlanComparisonModal } from '../modals/PlanComparisonModal';
import { getSupabaseBrowserClient } from '../../services/supabaseBrowserClient';
import { SubscriptionCheckoutPage } from '../checkout/SubscriptionCheckoutPage';
import { UpiPaymentPanel } from '../checkout/UpiPaymentPanel';
import {
  apiGetCurrentPaymentStatus,
  CurrentPaymentStatusClient,
  apiGetBillingOverview,
  apiGetBillingHistory,
  apiGetBillingReceipt,
  apiCancelBillingSubscription,
  BillingOverviewClient,
  BillingHistoryItemClient,
  BillingReceiptClient,
} from '../../services/apiClient';

export type SettingsSection = 'general' | 'plan' | 'usage' | 'payments';

export interface SettingsDashboardScreenProps {
  lang: Language;
  onToggleLang: (newLang: Language) => void;
  docs: VaultDocumentItem[];
  members: HouseholdMemberItem[];
  sharePacks: SharePackItem[];
  workers: WorkerRecordItem[];
  onNavigateHome?: () => void;
  initialSection?: SettingsSection;
}

export const SettingsDashboardScreen: React.FC<SettingsDashboardScreenProps> = ({
  lang,
  onToggleLang,
  docs,
  members,
  sharePacks,
  workers,
  onNavigateHome,
  initialSection = 'plan',
}) => {
  const {
    user: authUser,
    isAuthenticated,
    isEmailVerified: authIsEmailVerified,
    executeGuardedAction,
    refreshProfile,
    logout,
    requestPasswordReset,
    resendVerificationEmail,
  } = useAuth();

  const isVerified = Boolean(authIsEmailVerified || authUser?.isEmailVerified);

  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);

  // General Settings Form State
  const [householdName, setHouseholdName] = useState(
    authUser?.familyName || (lang === 'ml' ? 'കുടുംബ വോൾട്ട്' : 'Kudumba Vault')
  );
  const [fullName, setFullName] = useState(authUser?.fullName || authUser?.name || 'Athil');
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [generalSuccessMsg, setGeneralSuccessMsg] = useState<string | null>(null);
  const [generalErrorMsg, setGeneralErrorMsg] = useState<string | null>(null);

  // Settings Loading & Notification Preferences State
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [notificationSuccessMsg, setNotificationSuccessMsg] = useState<string | null>(null);
  const [notificationErrorMsg, setNotificationErrorMsg] = useState<string | null>(null);
  const [notify60Days, setNotify60Days] = useState(true);
  const [notify30Days, setNotify30Days] = useState(true);
  const [notify7Days, setNotify7Days] = useState(true);
  const [notifyExpired, setNotifyExpired] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);

  // Verification resend feedback
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  // Password reset feedback
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  // Modals state
  const [isManagePlanModalOpen, setIsManagePlanModalOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.search.includes('managePlan=true');
    }
    return false;
  });
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);

  // Authoritative Backend Storage Usage State
  const [backendStorage, setBackendStorage] = useState<StorageUsageStats | null>(null);
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);

  // Authoritative Subscription & Free Trial Entitlement
  const [entitlement, setEntitlement] = useState<EntitlementStatusClient | null>(null);
  const [isLoadingEntitlement, setIsLoadingEntitlement] = useState(false);
  const [entitlementError, setEntitlementError] = useState<string | null>(null);

  const activePlanConfig = useMemo(() => {
    return getPlanConfig(entitlement?.planId);
  }, [entitlement?.planId]);

  const maximumSeats = entitlement?.maxFamilyMembers || activePlanConfig.maxFamilyMembers || 5;

  const memberSeatsCalculation = useMemo(() => {
    return calculateMemberSeatsUsage(members.length, maximumSeats);
  }, [members.length, maximumSeats]);

  // Dynamic Plan limits constants derived from authoritative subscription entitlement & plan configuration
  const PLAN_LIMITS = useMemo(() => {
    return {
      nameEn: activePlanConfig.nameEn,
      nameMl: activePlanConfig.nameMl,
      status: entitlement?.status ? entitlement.status.toUpperCase() : 'TRIALING',
      membersLimit: maximumSeats,
      storageLimitGb: Math.round((entitlement?.storageQuotaBytes || activePlanConfig.storageQuotaBytes) / BYTES_PER_GIB),
      storageLimitBytes: entitlement?.storageQuotaBytes || activePlanConfig.storageQuotaBytes,
      fileSizeLimitMb: Math.round((entitlement?.maxFileSizeBytes || activePlanConfig.maxFileSizeBytes) / (1024 * 1024)),
    };
  }, [activePlanConfig, entitlement, maximumSeats]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccessMsg, setCheckoutSuccessMsg] = useState<string | null>(null);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [paymentStatusData, setPaymentStatusData] = useState<CurrentPaymentStatusClient | null>(null);
  const [isLoadingPaymentStatus, setIsLoadingPaymentStatus] = useState(false);

  const fetchPaymentStatus = async () => {
    if (!isAuthenticated) return;
    try {
      setIsLoadingPaymentStatus(true);
      const data = await apiGetCurrentPaymentStatus();
      if (data && data.ok) {
        setPaymentStatusData(data);
      }
    } catch (err) {
      console.warn('[SettingsDashboard] Payment status notice:', err);
    } finally {
      setIsLoadingPaymentStatus(false);
    }
  };

  const handleSelectPlan = (planId: string) => {
    if (planId === 'founding-free') {
      setIsManagePlanModalOpen(false);
      return;
    }
    // Rule: Reject new plan selection if another request is already pending
    if (paymentStatusData?.activeRequest && paymentStatusData.activeRequest.status === 'PENDING') {
      setCheckoutError(
        lang === 'ml'
          ? 'മറ്റൊരു സബ്‌സ്‌ക്രിപ്ഷൻ മാറ്റം നിലവിൽ പ്രോസസ്സിംഗിലാണ്. ദയവായി അത് പൂർത്തിയാക്കുകയോ റദ്ദാക്കുകയോ ചെയ്യുക.'
          : 'A subscription change is already pending. Cancel or complete it first.'
      );
      return;
    }
    setCheckoutError(null);
    setIsManagePlanModalOpen(false);
    setCheckoutPlanId(planId);
  };

  // Dynamic Billing & Invoicing State
  const [billingOverview, setBillingOverview] = useState<BillingOverviewClient | null>(null);
  const [isLoadingBillingOverview, setIsLoadingBillingOverview] = useState(false);
  const [billingOverviewError, setBillingOverviewError] = useState<string | null>(null);

  const [billingHistory, setBillingHistory] = useState<BillingHistoryItemClient[]>([]);
  const [billingHistoryTotal, setBillingHistoryTotal] = useState(0);
  const [billingHistoryPage, setBillingHistoryPage] = useState(1);
  const [billingHistoryTotalPages, setBillingHistoryTotalPages] = useState(1);
  const [isLoadingBillingHistory, setIsLoadingBillingHistory] = useState(false);

  const [selectedReceipt, setSelectedReceipt] = useState<BillingReceiptClient | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [isCancellingSubscription, setIsCancellingSubscription] = useState(false);

  const fetchBillingOverview = async () => {
    if (!isAuthenticated) return;
    try {
      setIsLoadingBillingOverview(true);
      setBillingOverviewError(null);
      const data = await apiGetBillingOverview();
      if (data && data.ok) {
        setBillingOverview(data);
      }
    } catch (err: any) {
      console.warn('[SettingsDashboard] Billing overview notice:', err);
      setBillingOverviewError(err?.message || 'Failed to load billing overview.');
    } finally {
      setIsLoadingBillingOverview(false);
    }
  };

  const fetchBillingHistory = async (page = 1) => {
    if (!isAuthenticated) return;
    try {
      setIsLoadingBillingHistory(true);
      const data = await apiGetBillingHistory(page, 10);
      if (data && data.ok) {
        setBillingHistory(data.records || []);
        setBillingHistoryTotal(data.total || 0);
        setBillingHistoryPage(data.page || 1);
        setBillingHistoryTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.warn('[SettingsDashboard] Billing history notice:', err);
    } finally {
      setIsLoadingBillingHistory(false);
    }
  };

  const handleOpenReceipt = async (paymentId: string) => {
    try {
      setIsLoadingReceipt(true);
      setReceiptError(null);
      setSelectedReceipt(null);
      setIsReceiptModalOpen(true);
      const data = await apiGetBillingReceipt(paymentId);
      if (data && data.ok) {
        setSelectedReceipt(data.receipt);
      }
    } catch (err: any) {
      setReceiptError(err?.message || 'Failed to load receipt.');
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  const handleConfirmCancelSubscription = async () => {
    try {
      setIsCancellingSubscription(true);
      const res = await apiCancelBillingSubscription({ cancelAtPeriodEnd: true });
      if (res && res.ok) {
        setIsCancelConfirmOpen(false);
        setIsManagePlanModalOpen(false);
        setCancelSuccessMsg(
          lang === 'ml'
            ? 'സബ്സ്ക്രിപ്ഷൻ റദ്ദാക്കൽ ഷെഡ്യൂൾ ചെയ്തു. നിലവിലെ ടേം കഴിയും വരെ ആക്ടീവായിരിക്കും.'
            : 'Subscription cancellation scheduled at end of current billing period.'
        );
        setTimeout(() => setCancelSuccessMsg(null), 5000);
        invalidateSubscriptionCache();
        await fetchBillingOverview();
        await fetchBillingHistory(1);
        await fetchEntitlement(true);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel subscription.');
    } finally {
      setIsCancellingSubscription(false);
    }
  };

  const fetchStorageAccounting = async () => {
    if (!isAuthenticated) return;
    setIsLoadingStorage(true);
    try {
      const stats = await apiGetStorageUsage();
      if (stats) {
        setBackendStorage(stats);
      }
    } catch (err) {
      console.warn('[SettingsDashboard] Backend storage accounting notice:', err);
    } finally {
      setIsLoadingStorage(false);
    }
  };

  const fetchEntitlement = async (force = false) => {
    if (!isAuthenticated) return;
    try {
      setIsLoadingEntitlement(true);
      setEntitlementError(null);
      const data = await apiGetSubscriptionStatus({ force, trigger: 'settings_screen' });
      if (data) {
        setEntitlement(data);
        fetchStorageAccounting();
      }
    } catch (err: any) {
      console.warn('[SettingsDashboard] Subscription status notice:', err);
      setEntitlementError(err?.message || 'Failed to load subscription details.');
    } finally {
      setIsLoadingEntitlement(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchEntitlement();
      fetchPaymentStatus();
      fetchStorageAccounting();
      fetchBillingOverview();
      fetchBillingHistory(1);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && activeSection === 'payments') {
      fetchBillingOverview();
      fetchBillingHistory(billingHistoryPage);
    }
  }, [isAuthenticated, activeSection]);

  const isPendingPayment = Boolean(
    paymentStatusData?.hasPendingRequest ||
    (paymentStatusData?.activeRequest && paymentStatusData.activeRequest.status === 'PENDING') ||
    billingOverview?.unifiedStatus === 'PENDING PAYMENT'
  );

  // Active polling when a payment request is pending approval to seamlessly update upon admin approval
  useEffect(() => {
    if (!isAuthenticated || !isPendingPayment) return;
    const interval = setInterval(async () => {
      try {
        const latest = await apiGetCurrentPaymentStatus();
        if (latest && latest.ok) {
          const stillPending = Boolean(
            latest.hasPendingRequest ||
            (latest.activeRequest && latest.activeRequest.status === 'PENDING')
          );
          if (!stillPending || latest.activeRequest?.status === 'APPROVED') {
            invalidateSubscriptionCache();
            await fetchEntitlement(true);
            await fetchStorageAccounting();
            await fetchBillingOverview();
            await fetchBillingHistory(billingHistoryPage);
            setPaymentStatusData(latest);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('kudumba:subscription-updated'));
              window.dispatchEvent(new CustomEvent('kudumba:storage-updated'));
            }
          } else {
            setPaymentStatusData(latest);
          }
        }
      } catch {
        // quiet poll
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isAuthenticated, isPendingPayment, billingHistoryPage]);

  // Fetch real authoritative settings and preferences from backend
  const fetchSettings = async () => {
    if (!isAuthenticated) return;
    try {
      setIsLoadingSettings(true);
      const res = await apiGetSettings();
      if (res && res.ok) {
        if (res.profile) {
          if (res.profile.familyName !== undefined && res.profile.familyName !== null) {
            setHouseholdName(res.profile.familyName);
          }
          if (res.profile.fullName) {
            setFullName(res.profile.fullName);
          }
        }
        if (res.notificationPreferences) {
          setNotify60Days(Boolean(res.notificationPreferences.reminder60Days));
          setNotify30Days(Boolean(res.notificationPreferences.reminder30Days));
          setNotify7Days(Boolean(res.notificationPreferences.reminder7Days));
          setNotifyExpired(Boolean(res.notificationPreferences.reminderExpired));
          setWeeklyDigest(Boolean(res.notificationPreferences.weeklyDigest));
        }
      }
    } catch (err: any) {
      console.warn('[SettingsDashboard] Failed to load settings from server:', err?.message);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings();
    }
  }, [isAuthenticated]);

  const handleSimulate = async (action: 'START_TRIAL' | 'EXPIRE_TRIAL' | 'SIMULATE_UPGRADE' | 'CANCEL') => {
    try {
      setIsSimulating(true);
      const res = await apiSimulateSubscriptionDev(action);
      setEntitlement(res);
      await fetchStorageAccounting();
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // Fetch real authoritative backend storage accounting on mount & listen to update events
  useEffect(() => {
    fetchStorageAccounting();

    // Listen for immediate authoritative storage and subscription updates
    const handleStorageUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<StorageUsageStats>;
      if (customEvent.detail) {
        setBackendStorage(customEvent.detail);
      } else {
        fetchStorageAccounting();
      }
    };

    const handleSubscriptionUpdated = () => {
      fetchEntitlement(true);
      fetchStorageAccounting();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('kudumba:storage-updated', handleStorageUpdated);
      window.addEventListener('kudumba:subscription-updated', handleSubscriptionUpdated);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('kudumba:storage-updated', handleStorageUpdated);
        window.removeEventListener('kudumba:subscription-updated', handleSubscriptionUpdated);
      }
    };
  }, [isAuthenticated]);

  // Client-side fallback storage from documents (used only during unauthenticated/offline or initial load before server responds)
  const clientUsedBytes = useMemo(() => {
    let total = 0;
    for (const doc of docs) {
      if (typeof doc.fileSize === 'number' && doc.fileSize > 0) {
        total += doc.fileSize;
      } else if (doc.attachmentSize) {
        const str = doc.attachmentSize.trim().toUpperCase();
        if (str.includes('MB')) {
          total += parseFloat(str) * 1024 * 1024;
        } else if (str.includes('KB')) {
          total += parseFloat(str) * 1024;
        } else if (str.includes('GB')) {
          total += parseFloat(str) * 1024 * 1024 * 1024;
        }
      } else if (doc.attachmentDataUrl) {
        total += Math.round(doc.attachmentDataUrl.length * 0.75);
      }
    }
    return total;
  }, [docs]);

  // Authoritative Single Source of Truth for storage usage:
  // The authenticated backend summary is authoritative for both documentCount and usedBytes.
  // When backend storage is loaded, use its documentCount and usedBytes directly.
  const effectiveUsedBytes = backendStorage !== null ? backendStorage.usedBytes : clientUsedBytes;
  const effectiveQuotaBytes =
    entitlement?.storageQuotaBytes ||
    (backendStorage !== null && backendStorage.quotaBytes > 0
      ? backendStorage.quotaBytes
      : PLAN_LIMITS.storageLimitBytes);

  const storageCalculation = useMemo(() => {
    return calculateStorageUsage(effectiveUsedBytes, effectiveQuotaBytes);
  }, [effectiveUsedBytes, effectiveQuotaBytes]);

  const displayUsed = useMemo(() => {
    return storageCalculation.formattedUsed.replace('GiB', 'GB').replace('MiB', 'MB');
  }, [storageCalculation.formattedUsed]);

  const displayQuota = useMemo(() => {
    return storageCalculation.formattedQuota.replace('.0 GiB', ' GB').replace('GiB', 'GB');
  }, [storageCalculation.formattedQuota]);

  const totalDocCount = backendStorage !== null ? backendStorage.documentCount : docs.length;

  // Category counts breakdown for Usage Tab
  const categoryCounts = useMemo(() => {
    if (backendStorage?.categoryBreakdown) {
      return {
        IDENTITY: backendStorage.categoryBreakdown.IDENTITY?.count || 0,
        PROPERTY: backendStorage.categoryBreakdown.PROPERTY?.count || 0,
        VEHICLE: backendStorage.categoryBreakdown.VEHICLE?.count || 0,
        HEALTH: backendStorage.categoryBreakdown.HEALTH?.count || 0,
        GULF: backendStorage.categoryBreakdown.GULF?.count || 0,
        OTHER: backendStorage.categoryBreakdown.OTHER?.count || 0,
      };
    }
    const counts: Record<string, number> = {
      IDENTITY: 0,
      PROPERTY: 0,
      VEHICLE: 0,
      HEALTH: 0,
      GULF: 0,
      OTHER: 0,
    };
    for (const doc of docs) {
      const cat = (doc.categoryId || doc.category || 'OTHER').toUpperCase();
      if (cat === 'MEDICAL' || cat === 'HEALTH') counts.HEALTH += 1;
      else if (counts[cat] !== undefined) counts[cat] += 1;
      else counts.OTHER += 1;
    }
    return counts;
  }, [backendStorage, docs]);

  // Handle General Profile Update
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      executeGuardedAction(() => {}, {
        promptMessage:
          lang === 'ml'
            ? 'സെറ്റിംഗ്സ് മാറ്റുന്നതിന് ദയവായി സൈൻ ഇൻ ചെയ്യുക അല്ലെങ്കിൽ ഒരു അക്കൗണ്ട് ആരംഭിക്കുക.'
            : 'Please sign in or create an account to continue.',
      });
      return;
    }

    const cleanHousehold = householdName.trim();
    const cleanFull = fullName.trim();
    if (cleanHousehold.length < 2) {
      setGeneralErrorMsg(
        lang === 'ml'
          ? 'കുടുംബത്തിന്റെ പേര് കുറഞ്ഞത് 2 അക്ഷരങ്ങൾ ഉണ്ടായിരിക്കണം.'
          : 'Household name must be at least 2 characters.'
      );
      return;
    }
    if (cleanFull.length < 2) {
      setGeneralErrorMsg(
        lang === 'ml'
          ? 'മുഴുവൻ പേര് കുറഞ്ഞത് 2 അക്ഷരങ്ങൾ ഉണ്ടായിരിക്കണം.'
          : 'Full name must be at least 2 characters.'
      );
      return;
    }
    if (cleanHousehold.length > 120 || cleanFull.length > 120) {
      setGeneralErrorMsg(
        lang === 'ml'
          ? 'പേര് 120 അക്ഷരങ്ങളിൽ കൂടരുത്.'
          : 'Name cannot exceed 120 characters.'
      );
      return;
    }

    if (isSavingGeneral) return; // Prevent duplicate submissions
    setIsSavingGeneral(true);
    setGeneralSuccessMsg(null);
    setGeneralErrorMsg(null);
    try {
      const res = await apiUpdateProfileSettings({
        fullName: cleanFull,
        householdName: cleanHousehold,
        preferredLang: lang,
      });

      // Synchronize Supabase user metadata so that client auth session reflects the changes
      try {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await supabase.auth.updateUser({
            data: {
              full_name: cleanFull,
              fullName: cleanFull,
              family_name: cleanHousehold,
              familyName: cleanHousehold,
            },
          });
        }
      } catch (sbErr) {
        console.warn('[SettingsDashboard] Supabase user metadata sync notice:', sbErr);
      }

      if (res && res.profile) {
        setFullName(res.profile.fullName);
        if (res.profile.familyName !== undefined && res.profile.familyName !== null) {
          setHouseholdName(res.profile.familyName);
        }
      }
      await refreshProfile();
      setGeneralSuccessMsg(
        lang === 'ml'
          ? 'സെറ്റിംഗ്സ് വിജയകരമായി സേവ് ചെയ്തു!'
          : 'Settings updated successfully!'
      );
      setTimeout(() => setGeneralSuccessMsg(null), 4000);
    } catch (err: any) {
      setGeneralErrorMsg(err?.message || 'Failed to save settings.');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  // Handle Dynamic Notification Milestone Toggle
  const handleToggleNotification = async (
    field: 'reminder60Days' | 'reminder30Days' | 'reminder7Days' | 'weeklyDigest',
    currentValue: boolean
  ) => {
    const nextValue = !currentValue;
    // Optimistically update UI
    if (field === 'reminder60Days') setNotify60Days(nextValue);
    else if (field === 'reminder30Days') setNotify30Days(nextValue);
    else if (field === 'reminder7Days') setNotify7Days(nextValue);
    else if (field === 'weeklyDigest') setWeeklyDigest(nextValue);

    if (!isAuthenticated) return;

    setIsSavingNotifications(true);
    setNotificationErrorMsg(null);
    setNotificationSuccessMsg(null);
    try {
      const res = await apiUpdateNotificationSettings({ [field]: nextValue });
      if (res && res.notificationPreferences) {
        setNotify60Days(Boolean(res.notificationPreferences.reminder60Days));
        setNotify30Days(Boolean(res.notificationPreferences.reminder30Days));
        setNotify7Days(Boolean(res.notificationPreferences.reminder7Days));
        setNotifyExpired(Boolean(res.notificationPreferences.reminderExpired));
        setWeeklyDigest(Boolean(res.notificationPreferences.weeklyDigest));
      }
      setNotificationSuccessMsg(
        lang === 'ml' ? 'അലേർട്ട് മുൻഗണനകൾ സേവ് ചെയ്തു.' : 'Notification preferences saved.'
      );
      setTimeout(() => setNotificationSuccessMsg(null), 3000);
    } catch (err: any) {
      // Revert on error
      if (field === 'reminder60Days') setNotify60Days(currentValue);
      else if (field === 'reminder30Days') setNotify30Days(currentValue);
      else if (field === 'reminder7Days') setNotify7Days(currentValue);
      else if (field === 'weeklyDigest') setWeeklyDigest(currentValue);
      setNotificationErrorMsg(err?.message || 'Failed to save notification preferences.');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  // Handle Resend Verification
  const handleResendVerification = async () => {
    if (!authUser?.email) return;
    setIsResendingVerification(true);
    setVerificationFeedback(null);
    try {
      const res = await resendVerificationEmail(authUser.email);
      setVerificationFeedback(
        res.message ||
          (lang === 'ml'
            ? 'സ്ഥിരീകരണ ലിങ്ക് ഇമെയിലിലേക്ക് അയച്ചിട്ടുണ്ട്.'
            : 'Verification email sent. Please check your inbox.')
      );
    } catch (err: any) {
      setVerificationFeedback(err?.message || 'Failed to send verification email.');
    } finally {
      setIsResendingVerification(false);
    }
  };

  // Handle Password Reset Request
  const handleRequestPasswordReset = async () => {
    if (!authUser?.email) return;
    setIsRequestingReset(true);
    setResetFeedback(null);
    try {
      const res = await requestPasswordReset(authUser.email);
      setResetFeedback(
        res.message ||
          (lang === 'ml'
            ? 'പാസ്‌വേഡ് മാറ്റാനുള്ള ലിങ്ക് നിങ്ങളുടെ ഇമെയിലിലേക്ക് അയച്ചു.'
            : 'Password reset link sent to your email.')
      );
    } catch (err: any) {
      setResetFeedback(err?.message || 'Failed to request password reset.');
    } finally {
      setIsRequestingReset(false);
    }
  };

  // Navigation tabs configuration
  const NAV_TABS = [
    {
      id: 'general' as SettingsSection,
      labelEn: 'General',
      labelMl: 'പൊതുവായവ',
      icon: Settings,
    },
    {
      id: 'plan' as SettingsSection,
      labelEn: 'Plan',
      labelMl: 'പ്ലാൻ',
      icon: CreditCard,
    },
    {
      id: 'usage' as SettingsSection,
      labelEn: 'Usage',
      labelMl: 'ഉപയോഗം',
      icon: BarChart2,
    },
    {
      id: 'payments' as SettingsSection,
      labelEn: 'Payments',
      labelMl: 'പേയ്‌മെന്റുകൾ',
      icon: Wallet,
    },
  ];

  if (checkoutPlanId) {
    return (
      <SubscriptionCheckoutPage
        planId={checkoutPlanId}
        lang={lang}
        savedAddress={paymentStatusData?.savedBillingAddress}
        onBack={() => {
          setCheckoutPlanId(null);
          setIsManagePlanModalOpen(true);
        }}
        onProceedToPayment={(_res) => {
          setCheckoutPlanId(null);
          setActiveSection('plan');
          fetchPaymentStatus();
          fetchEntitlement(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-5 pb-12 animate-in fade-in duration-200">
      {/* Settings Top Heading (Screen 8-11: Back button + Title) */}
      <div className="flex items-center gap-3">
        {onNavigateHome && (
          <button
            type="button"
            onClick={onNavigateHome}
            aria-label={lang === 'ml' ? 'ഹോമിലേക്ക് മടങ്ങുക' : 'Back to Home'}
            className="md:hidden flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F6F8] text-[#111827] hover:bg-[#E6E8EC] transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div>
          <h1 className="text-xl sm:text-2xl md:text-[28px] font-extrabold text-[#0B0B0C] tracking-tight font-malayalam">
            {lang === 'ml' ? 'സെറ്റിംഗ്സ്' : 'Settings'}
          </h1>
          <p className="text-xs sm:text-[13px] text-[#5B6168] mt-0.5 font-malayalam line-clamp-1 sm:line-clamp-none">
            {lang === 'ml'
              ? 'നിങ്ങളുടെ കുടുംബ അക്കൗണ്ട്, സബ്സ്ക്രിപ്ഷൻ, സ്റ്റോറേജ്, സുരക്ഷ എന്നിവ നിയന്ത്രിക്കുക.'
              : 'Manage your household account, subscription, storage limits, and preferences.'}
          </p>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="flex flex-col md:flex-row gap-5 lg:gap-8 items-start">
        {/* Left Column / Mobile Sub-Nav: Horizontal Scrollable Pills on Mobile */}
        <aside className="w-full md:w-56 shrink-0">
          <nav
            aria-label="Settings sub navigation"
            className="flex md:flex-col overflow-x-auto md:overflow-visible gap-2 p-1 rounded-2xl bg-[#F8F9FA] md:bg-transparent border md:border-0 border-[#E6E8EC] no-scrollbar"
          >
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  aria-selected={isActive}
                  role="tab"
                  className={`flex items-center gap-2 px-4 py-2.5 md:py-3 text-xs sm:text-[13.5px] font-bold rounded-full md:rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 text-left ${
                    isActive
                      ? 'bg-[#E03A45] text-white md:bg-[#FFF5F5] md:text-[#E03A45] md:border-l-4 md:border-[#E03A45] md:rounded-l-none md:rounded-r-xl shadow-xs'
                      : 'bg-white md:bg-transparent text-[#5B6168] hover:text-[#0B0B0C] hover:bg-[#F4F5F7] border border-[#E6E8EC] md:border-0'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-white md:text-[#E03A45]' : 'text-[#8A949E]'
                    }`}
                  />
                  <span className="font-malayalam">{lang === 'ml' ? tab.labelMl : tab.labelEn}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right Column: Settings Content Panels */}
        <main className="flex-1 w-full min-w-0 space-y-6">
          {/* =========================================================================
              SECTION 1: PLAN SETTINGS (Matches the reference screenshot layout)
             ========================================================================= */}
          {activeSection === 'plan' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Active Pending Manual UPI Payment Panel (Screenshot 3 Reference) */}
              {paymentStatusData?.activeRequest && paymentStatusData.activeRequest.status === 'PENDING' && (
                <UpiPaymentPanel
                  request={paymentStatusData.activeRequest}
                  qrSvg={paymentStatusData.qrSvg}
                  qrDataUrl={paymentStatusData.qrDataUrl}
                  upiUri={paymentStatusData.upiUri}
                  upiConfig={paymentStatusData.upiConfig}
                  lang={lang}
                  onPaymentSubmitted={(_updated) => {
                    fetchPaymentStatus();
                    fetchEntitlement(true);
                  }}
                  onRequestCancelled={() => {
                    fetchPaymentStatus();
                    fetchEntitlement(true);
                  }}
                />
              )}

              {/* Rejected Payment Notice (Requirement 8) */}
              {paymentStatusData?.activeRequest && paymentStatusData.activeRequest.status === 'REJECTED' && (
                <div className="rounded-[22px] border border-[#F9C3C6] bg-[#FDECEE] p-5 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-[#E03A45] font-bold text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>Your previous manual payment was rejected by admin</span>
                  </div>
                  <p className="text-xs text-[#5B6168]">
                    Reason: <strong className="text-[#0B0B0C]">{paymentStatusData.activeRequest.rejectionReason || 'UTR not verified'}</strong>
                  </p>
                  <p className="text-[11px] text-[#7C879B]">
                    Please verify your transaction in your UPI app and submit a new payment request with the correct UTR reference.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsManagePlanModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-[#E03A45] hover:bg-[#C42F3A] text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      Choose Plan & Resubmit
                    </button>
                  </div>
                </div>
              )}
              {/* Development-Only Simulation Banner (Guarded by query param per Rule 14) */}
              {typeof window !== 'undefined' && window.location.search.includes('debug=billing') && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <span className="font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                        DEVELOPMENT BILLING SIMULATION — NO REAL PAYMENT
                      </span>
                      <p className="text-amber-900 mt-1">
                        Test SaaS subscription transitions locally without real payment gateways.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isSimulating}
                        onClick={() => handleSimulate('START_TRIAL')}
                        className="px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-amber-900 font-bold hover:bg-amber-100 cursor-pointer text-[11px]"
                      >
                        Reset 3-Day Trial
                      </button>
                      <button
                        type="button"
                        disabled={isSimulating}
                        onClick={() => handleSimulate('EXPIRE_TRIAL')}
                        className="px-2.5 py-1.5 bg-red-100 border border-red-300 rounded-lg text-red-900 font-bold hover:bg-red-200 cursor-pointer text-[11px]"
                      >
                        Simulate Trial Expiry
                      </button>
                      <button
                        type="button"
                        disabled={isSimulating}
                        onClick={() => handleSimulate('SIMULATE_UPGRADE')}
                        className="px-2.5 py-1.5 bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-900 font-bold hover:bg-emerald-200 cursor-pointer text-[11px]"
                      >
                        Simulate NRI Plus
                      </button>
                      <button
                        type="button"
                        disabled={isSimulating}
                        onClick={() => handleSimulate('CANCEL')}
                        className="px-2.5 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-gray-800 font-bold hover:bg-gray-200 cursor-pointer text-[11px]"
                      >
                        Simulate Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Free Trial Status Banner */}
              {entitlement?.isTrialing && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-xs flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-[#0B0B0C] text-sm">
                        Free Trial Active — {
                          entitlement.hoursRemainingInTrial !== undefined && entitlement.hoursRemainingInTrial <= 24
                            ? `${entitlement.hoursRemainingInTrial} ${entitlement.hoursRemainingInTrial === 1 ? 'Hour' : 'Hours'} Remaining`
                            : `${entitlement.daysRemainingInTrial} ${entitlement.daysRemainingInTrial === 1 ? 'Day' : 'Days'} Remaining`
                        }
                      </h4>
                      <p className="text-[#5B6168]">
                        Ends on {entitlement.trialEnd ? new Date(entitlement.trialEnd).toLocaleDateString() : 'N/A'}. Full access to all vault features.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsManagePlanModalOpen(true)}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer shrink-0"
                  >
                    View Upgrade Plans
                  </button>
                </div>
              )}

              {/* Expired Trial Warning Banner with Grace Period */}
              {entitlement?.trialExpired && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-amber-900 text-sm">
                        {entitlement.inGracePeriod
                          ? `Free Trial Ended — 48-Hour Grace Period Active (${entitlement.hoursRemainingInGrace ?? 48}h remaining)`
                          : `Free Trial Expired — Transitioned to ${entitlement.planName || 'Founding Free Plan'}`}
                      </h4>
                      <p className="text-amber-800 mt-0.5">
                        {entitlement.inGracePeriod
                          ? `Your vault is operating under ${entitlement.planName || 'Founding Free'} limits (3 GB storage, 3 documents limit). All existing documents and family records are safe and accessible in read-only mode.`
                          : `Your account is active on ${entitlement.planName || 'Founding Free Plan'} (3 GB quota, 3 documents limit). Existing documents and family records remain viewable and downloadable.`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsManagePlanModalOpen(true)}
                    className="px-4 py-2 bg-[#6F4E37] hover:bg-[#583D2B] text-white font-bold rounded-xl text-xs cursor-pointer shrink-0 transition-colors shadow-xs"
                  >
                    Upgrade Plan
                  </button>
                </div>
              )}

              {/* Cancellation Notification Banners */}
              {entitlement?.cancelAtPeriodEnd && entitlement?.status === 'active' && entitlement?.currentPeriodEnd && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-2xs flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">
                      Your subscription is scheduled to end on {new Date(entitlement.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Your benefits remain active until then.
                    </h4>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      No further renewal payments will be charged. After this date, your account will transition to the free tier.
                    </p>
                  </div>
                </div>
              )}

              {entitlement?.status === 'canceled' && (
                <div className="rounded-2xl border border-red-200 bg-red-50/90 p-4 shadow-2xs flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-red-900">
                      Your paid subscription has been cancelled.
                    </h4>
                    <p className="text-[11px] text-red-700 mt-0.5">
                      Your existing documents and family records remain securely preserved and accessible.
                    </p>
                  </div>
                </div>
              )}

              {/* 1. Subscription Summary Card */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-gradient-to-r from-[#FFFBFB] via-[#FFF9F9] to-[#FFF5F5] p-5 sm:p-6 lg:p-7 relative overflow-hidden shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
                  <div className="flex items-start sm:items-center gap-4">
                    {/* Pink Circle Crown Badge */}
                    <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-[#FDECEE] text-[#E03A45] flex items-center justify-center shrink-0 shadow-xs border border-[#FCDADB]">
                      <Crown className="w-6 h-6 stroke-[2.2]" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-xl sm:text-[22px] font-bold text-[#0B0B0C] tracking-tight font-malayalam">
                          {isLoadingEntitlement
                            ? (lang === 'ml' ? 'സബ്‌സ്‌ക്രിപ്ഷൻ വിവരങ്ങൾ ലോഡ് ചെയ്യുന്നു...' : 'Loading subscription...')
                            : entitlementError && !entitlement
                            ? (lang === 'ml' ? 'വിവരങ്ങൾ ലഭ്യമല്ല' : 'Subscription Unavailable')
                            : entitlement?.planName || (lang === 'ml' ? PLAN_LIMITS.nameMl : PLAN_LIMITS.nameEn)}
                        </h2>
                        {isLoadingEntitlement ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            {lang === 'ml' ? 'ലോഡിംഗ്' : 'LOADING'}
                          </span>
                        ) : entitlementError && !entitlement ? (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            {lang === 'ml' ? 'ലഭ്യമല്ല' : 'UNAVAILABLE'}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                            entitlement?.status?.toLowerCase() === 'canceled'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : entitlement?.cancelAtPeriodEnd && entitlement?.status?.toLowerCase() === 'active'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : entitlement?.status?.toLowerCase() === 'expired'
                              ? 'bg-red-100 text-red-700 border border-red-200'
                              : entitlement?.status?.toLowerCase() === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-[#FFF0F0] text-[#E03A45] border border-[#FDECEE]'
                          }`}>
                            {entitlement?.status?.toLowerCase() === 'canceled'
                              ? (lang === 'ml' ? 'റദ്ദാക്കി' : 'CANCELLED')
                              : entitlement?.cancelAtPeriodEnd && entitlement?.status?.toLowerCase() === 'active'
                              ? (lang === 'ml' ? 'കാലാവധിയിൽ അവസാനിക്കും' : 'SCHEDULED TO END')
                              : entitlement?.status?.toLowerCase() === 'trialing' || (!entitlement && !entitlementError)
                              ? (lang === 'ml' ? 'സൗജന്യ ട്രയൽ' : 'FREE TRIAL')
                              : entitlement?.status?.toLowerCase() === 'active'
                              ? (lang === 'ml' ? 'ആക്ടീവ്' : 'ACTIVE')
                              : entitlement?.status?.toLowerCase() === 'expired'
                              ? (lang === 'ml' ? 'കാലാവധി കഴിഞ്ഞു' : 'EXPIRED')
                              : (entitlement?.status?.toUpperCase() || 'FREE TRIAL')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-[#5B6168] mt-1 font-mono-tabular">
                        {isLoadingEntitlement
                          ? (lang === 'ml' ? 'ദയവായി കാത്തിരിക്കുക...' : 'Please wait...')
                          : entitlementError && !entitlement
                          ? (lang === 'ml' ? 'വിവരങ്ങൾ ലഭ്യമാക്കാൻ സാധിച്ചില്ല. വീണ്ടും ശ്രമിക്കുക.' : 'Unable to connect to billing service.')
                          : entitlement?.isTrialing && entitlement.trialEnd
                          ? (lang === 'ml'
                              ? `ട്രയൽ അവസാനിക്കുന്നത്: ${new Date(entitlement.trialEnd).toLocaleDateString()} (${
                                  entitlement.hoursRemainingInTrial !== undefined && entitlement.hoursRemainingInTrial <= 24
                                    ? `${entitlement.hoursRemainingInTrial} മണിക്കൂർ ബാക്കി`
                                    : `${entitlement.daysRemainingInTrial} ദിവസം ബാക്കി`
                                })`
                              : `Free Trial Ends: ${new Date(entitlement.trialEnd).toLocaleDateString()} (${
                                  entitlement.hoursRemainingInTrial !== undefined && entitlement.hoursRemainingInTrial <= 24
                                    ? `${entitlement.hoursRemainingInTrial} ${entitlement.hoursRemainingInTrial === 1 ? 'hour' : 'hours'} remaining`
                                    : `${entitlement.daysRemainingInTrial} ${entitlement.daysRemainingInTrial === 1 ? 'day' : 'days'} remaining`
                                })`)
                          : entitlement?.trialExpired
                          ? (lang === 'ml'
                              ? `സൗജന്യ ഫൗണ്ടിംഗ് പ്ലാൻ (${entitlement?.planName || 'ഫൗണ്ടിംഗ് ഫാമിലി പ്ലാൻ'})`
                              : `Transitioned to ${entitlement?.planName || 'Founding Free Plan'}`)
                          : entitlement?.status === 'active'
                          ? (lang === 'ml' ? 'ആക്ടീവ് സബ്‌സ്‌ക്രിപ്ഷൻ' : 'Active Paid Subscription')
                          : (lang === 'ml' ? 'സൗജന്യ 3-ദിവസ ട്രയൽ' : '3-Day Free Trial')}
                      </p>
                      <p className="text-xs text-[#8A949E] mt-0.5 max-w-md font-malayalam">
                        {lang === 'ml'
                          ? 'നിങ്ങളുടെ കുടുംബത്തിന്റെ പ്രധാനപ്പെട്ട രേഖകൾക്കായി സുരക്ഷിതമായ ക്ലൗഡ് സംഭരണം.'
                          : "Secure cloud storage for your family's important documents."}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Mascot Accent */}
                  <div className="flex items-center gap-4 sm:gap-6 self-start sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsManagePlanModalOpen(true)}
                      className="spring-interactive inline-flex items-center gap-2 rounded-xl bg-[#E03A45] hover:bg-[#C42F3A] text-white px-4 py-2.5 text-xs sm:text-sm font-semibold shadow-xs cursor-pointer transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      <span>{lang === 'ml' ? 'പ്ലാൻ മാറ്റുക' : 'Manage plan'}</span>
                      <ArrowRight className="w-4 h-4 ml-0.5" />
                    </button>

                    {/* Mascot with Concentric Circles Background (Refined 1:1 with reference) */}
                    <div className="hidden lg:flex relative items-center justify-center w-28 h-24 shrink-0 pointer-events-none select-none">
                      <div className="absolute w-28 h-28 rounded-full border border-[#FDECEE] bg-[#FFF8F8] opacity-70" />
                      <div className="absolute w-20 h-20 rounded-full border border-[#FCDADB] bg-[#FFF0F1] opacity-70" />
                      <div className="absolute w-14 h-14 rounded-full border border-[#F9C3C6] bg-[#FFE8E9] opacity-80" />
                      <img
                        src="/assets/avatar-mascot-hd.png"
                        alt="Kudumba Vault Mascot"
                        className="relative w-20 h-20 object-contain drop-shadow-sm mascot-bounce"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. PLAN LIMITS Card */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-5 sm:p-6 lg:p-7 shadow-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8A949E] mb-2 font-mono-tabular">
                  {lang === 'ml' ? 'പ്ലാൻ പരിധികൾ' : 'PLAN LIMITS'}
                </h3>
                <div className="divide-y divide-[#F0F1F4]">
                  {/* Row 1: Family members */}
                  <div className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#5B6168] flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-semibold text-[#0B0B0C] font-malayalam">
                        {lang === 'ml' ? 'കുടുംബാംഗങ്ങൾ' : 'Family members'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {memberSeatsCalculation.isLimitExceeded && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF0F1] border border-[#FDECEE] px-2 py-0.5 text-[10px] font-bold text-[#E03A45] uppercase tracking-wide">
                          <AlertCircle className="w-3 h-3 text-[#E03A45]" />
                          {lang === 'ml' ? 'പരിധി കഴിഞ്ഞു' : 'Limit Exceeded'}
                        </span>
                      )}
                      <span className={`text-sm font-bold tabular-nums font-mono-tabular ${
                        memberSeatsCalculation.isLimitExceeded
                          ? 'text-[#E03A45]'
                          : 'text-[#0B0B0C]'
                      }`}>
                        {memberSeatsCalculation.currentMembers} / {memberSeatsCalculation.maximumSeats}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Storage */}
                  <div className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#5B6168] flex items-center justify-center shrink-0">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-semibold text-[#0B0B0C] font-malayalam">
                        {lang === 'ml' ? 'സ്റ്റോറേജ്' : 'Storage'}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-[#0B0B0C] tabular-nums font-mono-tabular">
                      {entitlement?.storageQuotaBytes
                        ? `${Math.round(entitlement.storageQuotaBytes / BYTES_PER_GIB)} GB`
                        : `${PLAN_LIMITS.storageLimitGb} GB`}
                    </span>
                  </div>

                  {/* Row 3: Documents Stored */}
                  <div className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#5B6168] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-semibold text-[#0B0B0C] font-malayalam">
                        {lang === 'ml' ? 'രേഖകൾ' : 'Documents'}
                      </span>
                    </div>
                    <span className={`text-sm font-bold tabular-nums font-mono-tabular ${
                      typeof entitlement?.maxDocuments === 'number' && totalDocCount > entitlement.maxDocuments
                        ? 'text-[#E03A45]'
                        : 'text-[#0B0B0C]'
                    }`}>
                      {typeof entitlement?.maxDocuments === 'number'
                        ? `${totalDocCount} / ${entitlement.maxDocuments}`
                        : (!entitlement || entitlement.planId === 'founding-free' ? `${totalDocCount} / 3` : totalDocCount)}
                    </span>
                  </div>

                  {/* Row 4: File size limit */}
                  <div className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#5B6168] flex items-center justify-center shrink-0">
                        <FileCheck className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-semibold text-[#0B0B0C] font-malayalam">
                        {lang === 'ml' ? 'പരമാവധി ഫയൽ വലിപ്പം' : 'File size limit'}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-[#0B0B0C] tabular-nums font-mono-tabular">
                      {entitlement?.maxFileSizeBytes
                        ? `${Math.round(entitlement.maxFileSizeBytes / (1024 * 1024))} MB`
                        : `${PLAN_LIMITS.fileSizeLimitMb} MB`}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Storage Usage Card */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-5 sm:p-6 lg:p-7 shadow-xs">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-[#FDECEE] text-[#E03A45] flex items-center justify-center shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#0B0B0C] font-malayalam">
                        {lang === 'ml' ? 'സ്റ്റോറേജ് ഉപയോഗം' : 'Storage Usage'}
                      </h4>
                      <p className="text-xs text-[#5B6168] mt-0.5 font-mono-tabular">
                        {lang === 'ml'
                          ? `${displayQuota}-ൽ ${displayUsed} ഉപയോഗിച്ചു (${totalDocCount} രേഖകൾ)`
                          : `${displayUsed} of ${displayQuota} used`}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#0B0B0C] tabular-nums font-mono-tabular">
                    {storageCalculation.percentageUsed}% {lang === 'ml' ? 'ഉപയോഗിച്ചു' : 'used'}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="h-2.5 w-full bg-[#F0F1F4] rounded-full overflow-hidden mt-4">
                  <div
                    className="h-full bg-[#E03A45] rounded-full transition-all duration-500"
                    style={{ width: `${storageCalculation.percentageUsed}%` }}
                  />
                </div>

                {storageCalculation.percentageUsed > 85 && (
                  <div className="mt-4 p-3 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] text-xs text-[#92400E] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      {lang === 'ml'
                        ? 'സ്റ്റോറേജ് പരിധി അടുത്തെത്തിയിരിക്കുന്നു. പഴയ രേഖകൾ ആർക്കൈവ് ചെയ്യുകയോ പ്ലാൻ അപ്‌ഗ്രേഡ് ചെയ്യുകയോ ചെയ്യുക.'
                        : 'Storage is approaching plan limit. Consider upgrading or archiving older documents.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================================
              SECTION 2: GENERAL SETTINGS (Account & Family Profile)
             ========================================================================= */}
          {activeSection === 'general' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {generalSuccessMsg && (
                <div className="p-4 rounded-2xl bg-[#E4F7EC] border border-[#BDE8D0] text-[#0F7B3E] text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{generalSuccessMsg}</span>
                </div>
              )}

              {generalErrorMsg && (
                <div className="p-4 rounded-2xl bg-[#FDECEE] border border-[#F9C3C6] text-[#E03A45] text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{generalErrorMsg}</span>
                </div>
              )}

              {/* Card 1: Family & Account Profile */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-5 sm:p-6 lg:p-7 shadow-xs">
                <div className="border-b border-[#F0F1F4] pb-4 mb-5">
                  <h3 className="text-base font-bold text-[#0B0B0C] font-malayalam">
                    {lang === 'ml' ? 'കുടുംബ പ്രൊഫൈൽ വിവരങ്ങൾ' : 'Household & Family Profile'}
                  </h3>
                  <p className="text-xs text-[#5B6168] mt-0.5 font-malayalam">
                    {lang === 'ml'
                      ? 'നിങ്ങളുടെ കുടുംബത്തിന്റെ പേരും അക്കൗണ്ട് ഉടമയുടെ വിവരങ്ങളും.'
                      : 'Update your family identifier and account holder details.'}
                  </p>
                </div>

                <form onSubmit={handleSaveGeneral} className="space-y-4 max-w-xl">
                  <div>
                    <label className="block text-xs font-bold text-[#0B0B0C] mb-1.5 font-malayalam">
                      {lang === 'ml' ? 'കുടുംബത്തിന്റെ പേര് (Household Name)' : 'Household / Family Name'}
                    </label>
                    <input
                      type="text"
                      value={householdName}
                      onChange={(e) => setHouseholdName(e.target.value)}
                      placeholder="e.g. Chaliyil Kudumbam"
                      className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-sm font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0B0B0C] mb-1.5 font-malayalam">
                      {lang === 'ml' ? 'അക്കൗണ്ട് ഉടമയുടെ പേര് (Account Holder)' : 'Account Holder Full Name'}
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Athil"
                      className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-sm font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <span className="block text-xs font-bold text-[#5B6168] mb-1">
                        {lang === 'ml' ? 'അക്കൗണ്ട് റോൾ' : 'Account Role'}
                      </span>
                      <div className="h-10 px-3 rounded-xl bg-[#F4F5F7] border border-[#E6E8EC] flex items-center justify-between text-xs font-bold text-[#0B0B0C]">
                        <span>{authUser?.role || 'OWNER'}</span>
                        <span className="text-[10px] text-[#0F7B3E] bg-[#E4F7EC] px-2 py-0.5 rounded-md">
                          {authUser?.role === 'ADMIN' ? 'Super Admin' : 'Primary Admin'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-bold text-[#5B6168] mb-1">
                        {lang === 'ml' ? 'ജനനത്തീയതി (സുരക്ഷാ റിക്കവറി)' : 'Date of Birth (Security DOB)'}
                      </span>
                      <div className="h-10 px-3 rounded-xl bg-[#F4F5F7] border border-[#E6E8EC] flex items-center text-xs font-bold text-[#5B6168]">
                        <span>••••-••-•• (Bank-grade Encrypted)</span>
                      </div>
                    </div>
                  </div>

                  {authUser?.role === 'ADMIN' && (
                    <div className="pt-2">
                      <a
                        href="/super-admin"
                        onClick={(e) => {
                          e.preventDefault();
                          if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/super-admin');
                            window.dispatchEvent(new PopStateEvent('popstate'));
                          }
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E03A45] hover:bg-[#C42F3A] text-white text-xs font-bold transition-colors shadow-xs"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Launch Super Admin Panel (/super-admin)</span>
                      </a>
                    </div>
                  )}

                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={isSavingGeneral}
                      className="cursor-pointer"
                    >
                      {isSavingGeneral ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{lang === 'ml' ? 'സേവ് ചെയ്യുന്നു...' : 'Saving...'}</span>
                        </>
                      ) : (
                        <span>{lang === 'ml' ? 'മാറ്റങ്ങൾ സേവ് ചെയ്യുക' : 'Save Changes'}</span>
                      )}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Card 2: Email & Verification Status */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-5 sm:p-6 lg:p-7 shadow-xs">
                <div className="border-b border-[#F0F1F4] pb-4 mb-5 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-bold text-[#0B0B0C] font-malayalam">
                      {lang === 'ml' ? 'ഇമെയിലും സ്ഥിരീകരണവും' : 'Email Address & Verification'}
                    </h3>
                    <p className="text-xs text-[#5B6168] mt-0.5 font-malayalam">
                      {lang === 'ml'
                        ? 'അലേർട്ടുകളും റിക്കവറിയും ലഭിക്കുന്ന അക്കൗണ്ട് ഇമെയിൽ.'
                        : 'Your primary address for vault alerts, family notifications, and secure logins.'}
                    </p>
                  </div>
                  {isVerified ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E4F7EC] text-[#0F7B3E] text-xs font-bold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{lang === 'ml' ? 'സ്ഥിരീകരിച്ചു' : 'Verified'}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF5F5] text-[#E03A45] text-xs font-bold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{lang === 'ml' ? 'സ്ഥിരീകരിച്ചിട്ടില്ല' : 'Pending Verification'}</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#FAFAFA] border border-[#E6E8EC]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-[#E6E8EC] flex items-center justify-center text-[#5B6168]">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0B0B0C] break-all font-mono-tabular">
                        {authUser?.email || ''}
                      </p>
                      <p className="text-xs text-[#8A949E] mt-0.5">
                        {isVerified
                          ? lang === 'ml'
                            ? 'ഇമെയിൽ സുരക്ഷിതമായി സ്ഥിരീകരിച്ചു.'
                            : 'Confirmed via Supabase Auth.'
                          : lang === 'ml'
                          ? 'ഇമെയിൽ സ്ഥിരീകരിക്കാൻ ഇൻബോക്സ് പരിശോധിക്കുക.'
                          : 'Action required: verify email to ensure uninterrupted access.'}
                      </p>
                    </div>
                  </div>

                  {!isVerified && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleResendVerification}
                      disabled={isResendingVerification}
                      className="cursor-pointer shrink-0"
                    >
                      {isResendingVerification ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>{lang === 'ml' ? 'സ്ഥിരീകരണ ലിങ്ക് അയക്കുക' : 'Resend Verification'}</span>
                      )}
                    </Button>
                  )}
                </div>

                {verificationFeedback && (
                  <p className="mt-3 text-xs font-medium text-[#0F7B3E]">{verificationFeedback}</p>
                )}
              </div>

              {/* Card 3: Notification & Expiry Alert Preferences */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-5 sm:p-6 lg:p-7 shadow-xs">
                <div className="border-b border-[#F0F1F4] pb-4 mb-5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FDECEE] text-[#E03A45] flex items-center justify-center">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#0B0B0C] font-malayalam">
                      {lang === 'ml' ? 'അലേർട്ട് മുൻഗണനകൾ' : 'Notification & Expiry Reminders'}
                    </h3>
                    <p className="text-xs text-[#5B6168] mt-0.5 font-malayalam">
                      {lang === 'ml'
                        ? 'പാസ്‌പോർട്ട്, ഇഖാമ, ഇൻഷുറൻസ് എന്നിവ അവസാനിക്കുന്നതിന് മുമ്പ് ഓട്ടോമേറ്റഡ് അലേർട്ടുകൾ.'
                        : 'Scheduled email notifications before household documents expire.'}
                    </p>
                  </div>
                </div>

                {notificationSuccessMsg && (
                  <div className="mb-4 p-3 rounded-xl bg-[#E4F7EC] border border-[#BDE8D0] text-[#0F7B3E] text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{notificationSuccessMsg}</span>
                  </div>
                )}
                {notificationErrorMsg && (
                  <div className="mb-4 p-3 rounded-xl bg-[#FDECEE] border border-[#F9C3C6] text-[#E03A45] text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{notificationErrorMsg}</span>
                  </div>
                )}

                <div className="space-y-3 max-w-xl">
                  <label className="flex items-center justify-between p-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] hover:bg-white cursor-pointer transition-colors">
                    <div>
                      <span className="text-xs font-bold text-[#0B0B0C] block font-malayalam">
                        {lang === 'ml' ? '60 ദിവസം മുമ്പ് (Early Warning)' : '60 Days Milestone'}
                      </span>
                      <span className="text-[11px] text-[#5B6168]">
                        {lang === 'ml'
                          ? 'പാസ്‌പോർട്ട്, വിസ പുതുക്കലുകൾക്ക് മുൻകൂട്ടി സമയം ലഭിക്കാൻ.'
                          : 'Early reminder for passports, visas, and Gulf documents.'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notify60Days}
                      disabled={isSavingNotifications}
                      onChange={() => handleToggleNotification('reminder60Days', notify60Days)}
                      className="w-4 h-4 text-[#E03A45] rounded-md accent-[#E03A45] cursor-pointer disabled:opacity-50"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] hover:bg-white cursor-pointer transition-colors">
                    <div>
                      <span className="text-xs font-bold text-[#0B0B0C] block font-malayalam">
                        {lang === 'ml' ? '30 ദിവസം മുമ്പ് (Urgent Alert)' : '30 Days Milestone'}
                      </span>
                      <span className="text-[11px] text-[#5B6168]">
                        {lang === 'ml'
                          ? 'വാഹന ഇൻഷുറൻസ്, റീടെസ്റ്റ്, വാടക കരാർ അലേർട്ട്.'
                          : 'Urgent reminder for vehicle insurance, fitness certificates, and rent agreements.'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notify30Days}
                      disabled={isSavingNotifications}
                      onChange={() => handleToggleNotification('reminder30Days', notify30Days)}
                      className="w-4 h-4 text-[#E03A45] rounded-md accent-[#E03A45] cursor-pointer disabled:opacity-50"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] hover:bg-white cursor-pointer transition-colors">
                    <div>
                      <span className="text-xs font-bold text-[#0B0B0C] block font-malayalam">
                        {lang === 'ml' ? '7 ദിവസം മുമ്പ് & കാലാവധി ദിനം' : '7 Days & Due Day Alerts'}
                      </span>
                      <span className="text-[11px] text-[#5B6168]">
                        {lang === 'ml'
                          ? 'പിഴയില്ലാതെ അടിയന്തരമായി പുതുക്കാനുള്ള ഓർമ്മപ്പെടുത്തൽ.'
                          : 'Final emergency warning to prevent compliance fines.'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notify7Days}
                      disabled={isSavingNotifications}
                      onChange={() => handleToggleNotification('reminder7Days', notify7Days)}
                      className="w-4 h-4 text-[#E03A45] rounded-md accent-[#E03A45] cursor-pointer disabled:opacity-50"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] hover:bg-white cursor-pointer transition-colors">
                    <div>
                      <span className="text-xs font-bold text-[#0B0B0C] block font-malayalam">
                        {lang === 'ml' ? 'പ്രതിവാര കുടുംബ സമ്മറി (Weekly Digest)' : 'Weekly Vault Digest'}
                      </span>
                      <span className="text-[11px] text-[#5B6168]">
                        {lang === 'ml'
                          ? 'കുടുംബ വോൾട്ടിന്റെ സമഗ്ര സ്ഥിതി വിവര റിപ്പോർട്ട്.'
                          : 'Summary of active documents, upcoming renewals, and worker history.'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={weeklyDigest}
                      disabled={isSavingNotifications}
                      onChange={() => handleToggleNotification('weeklyDigest', weeklyDigest)}
                      className="w-4 h-4 text-[#E03A45] rounded-md accent-[#E03A45] cursor-pointer disabled:opacity-50"
                    />
                  </label>
                </div>
              </div>

              {/* Card 4: Security & Bank-Grade Protection */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-5 sm:p-6 lg:p-7 shadow-xs">
                <div className="border-b border-[#F0F1F4] pb-4 mb-5 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-bold text-[#0B0B0C] font-malayalam">
                      {lang === 'ml' ? 'സുരക്ഷയും സെഷനും' : 'Security & Session Protection'}
                    </h3>
                    <p className="text-xs text-[#5B6168] mt-0.5 font-malayalam">
                      {lang === 'ml'
                        ? 'ബാങ്ക്-ഗ്രേഡ് എൻക്രിപ്ഷനും 7 ദിവസത്തെ സുരക്ഷാ നിബന്ധനയും.'
                        : 'High security standards protecting sensitive Kerala & Gulf household files.'}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0F7B3E] bg-[#E4F7EC] px-3 py-1 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>256-bit AES Vault</span>
                  </span>
                </div>

                <div className="space-y-4 max-w-xl">
                  <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-[#E6E8EC] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#0B0B0C]">
                      <Lock className="w-4 h-4 text-[#0F7B3E]" />
                      <span>{lang === 'ml' ? '7 ദിവസത്തെ സുരക്ഷാ ലോക്ക്' : '7-Day Inactivity Auto-Lock'}</span>
                    </div>
                    <p className="text-xs text-[#5B6168] leading-relaxed font-malayalam">
                      {lang === 'ml'
                        ? 'നിങ്ങൾ 7 ദിവസം തുടർച്ചയായി ആപ്പിൽ പ്രവേശിച്ചില്ലെങ്കിൽ, അനധികൃതമായി ആരും ഫോണിൽ നിന്ന് രേഖകൾ കാണാതിരിക്കാൻ വോൾട്ട് സ്വയം ലോക്കാകും.'
                        : 'If your vault remains untouched for 7 consecutive days, access is automatically locked to protect sensitive family documents. Re-authentication unlocks full access.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleRequestPasswordReset}
                      disabled={isRequestingReset}
                      className="cursor-pointer"
                    >
                      {isRequestingReset ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>{lang === 'ml' ? 'പാസ്‌വേഡ് മാറ്റുക' : 'Change Password'}</span>
                      )}
                    </Button>

                    <button
                      type="button"
                      onClick={async () => {
                        await logout();
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-[#F9C3C6] bg-[#FFF5F5] hover:bg-[#FDECEE] text-[#E03A45] px-4 py-2 text-xs font-bold cursor-pointer transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{lang === 'ml' ? 'പുറത്തുകടക്കുക (Sign Out)' : 'Sign Out'}</span>
                    </button>
                  </div>

                  {resetFeedback && (
                    <p className="text-xs font-medium text-[#0F7B3E]">{resetFeedback}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SECTION 3: USAGE SETTINGS (Real Vault Storage & Metrics Breakdown)
             ========================================================================= */}
          {activeSection === 'usage' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Top 4 Metrics Summary Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Metric 1: Storage */}
                <Card className="bg-white p-5">
                  <div className="flex items-center justify-between text-[#8A949E] mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {lang === 'ml' ? 'സ്റ്റോറേജ്' : 'Storage'}
                    </span>
                    <HardDrive className="w-4 h-4 text-[#E03A45]" />
                  </div>
                  <div className="text-xl font-bold text-[#0B0B0C] tabular-nums font-mono-tabular">
                    {displayUsed} <span className="text-xs text-[#8A949E] font-normal">/ {displayQuota}</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#F0F1F4] rounded-full overflow-hidden mt-3">
                    <div
                      className="h-full bg-[#E03A45] rounded-full transition-all duration-500"
                      style={{ width: `${storageCalculation.percentageUsed}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[#5B6168] mt-1.5 block tabular-nums">
                    {storageCalculation.percentageUsed}% {lang === 'ml' ? 'ഉപയോഗിച്ചു' : 'consumed'}
                  </span>
                </Card>

                {/* Metric 2: Documents */}
                <Card className="bg-white p-5">
                  <div className="flex items-center justify-between text-[#8A949E] mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {lang === 'ml' ? 'രേഖകൾ' : 'Documents'}
                    </span>
                    <FileText className="w-4 h-4 text-[#1E4FD8]" />
                  </div>
                  <div className="text-xl font-bold text-[#0B0B0C] tabular-nums font-mono-tabular">
                    {totalDocCount}{' '}
                    <span className="text-xs text-[#8A949E] font-normal">
                      / {typeof entitlement?.maxDocuments === 'number'
                          ? entitlement.maxDocuments
                          : (!entitlement || entitlement.planId === 'founding-free' ? 3 : (lang === 'ml' ? 'അപരിമിതം' : 'Unlimited'))}
                    </span>
                  </div>
                  {(!entitlement || entitlement.planId === 'founding-free' || typeof entitlement?.maxDocuments === 'number') ? (
                    <>
                      <div className="h-1.5 w-full bg-[#F0F1F4] rounded-full overflow-hidden mt-3">
                        <div
                          className={`h-full rounded-full ${totalDocCount >= (entitlement?.maxDocuments ?? 3) ? 'bg-[#E03A45]' : 'bg-[#1E4FD8]'}`}
                          style={{
                            width: `${Math.min(
                              100,
                              (totalDocCount / (entitlement?.maxDocuments ?? 3)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="text-[11px] text-[#5B6168] mt-1.5 block">
                        {Math.max(
                          0,
                          (entitlement?.maxDocuments ?? 3) - totalDocCount
                        )}{' '}
                        {lang === 'ml' ? 'ബാക്കി' : 'remaining slots'}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-[#0F7B3E] mt-3 block font-medium">
                      ✓ {lang === 'ml' ? 'അൺലിമിറ്റഡ് രേഖകൾ' : 'Unlimited document allowance'}
                    </span>
                  )}
                </Card>

                {/* Metric 3: Members */}
                <Card className="bg-white p-5">
                  <div className="flex items-center justify-between text-[#8A949E] mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {lang === 'ml' ? 'കുടുംബാംഗങ്ങൾ' : 'Members'}
                    </span>
                    <Users className="w-4 h-4 text-[#0F7B3E]" />
                  </div>
                  <div className="text-xl font-bold text-[#0B0B0C] tabular-nums font-mono-tabular">
                    {memberSeatsCalculation.currentMembers}{' '}
                    <span className="text-xs text-[#8A949E] font-normal">
                      / {memberSeatsCalculation.maximumSeats} {lang === 'ml' ? 'സീറ്റുകൾ' : 'Seats'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#F0F1F4] rounded-full overflow-hidden mt-3">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        memberSeatsCalculation.isLimitExceeded ? 'bg-[#E03A45]' : 'bg-[#0F7B3E]'
                      }`}
                      style={{ width: `${memberSeatsCalculation.usagePercentage}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[#5B6168] mt-1.5 block">
                    {memberSeatsCalculation.remainingSeats}{' '}
                    {lang === 'ml' ? 'സീറ്റുകൾ ബാക്കി' : 'free seats remaining'}
                  </span>
                </Card>

                {/* Metric 4: Shared Packs */}
                <Card className="bg-white p-5">
                  <div className="flex items-center justify-between text-[#8A949E] mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {lang === 'ml' ? 'ഷെയർ പായ്ക്ക്' : 'Share Packs'}
                    </span>
                    <Folder className="w-4 h-4 text-[#A85A00]" />
                  </div>
                  <div className="text-xl font-bold text-[#0B0B0C] tabular-nums font-mono-tabular">
                    {sharePacks.length} <span className="text-xs text-[#8A949E] font-normal">/ 20</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#F0F1F4] rounded-full overflow-hidden mt-3">
                    <div
                      className="h-full bg-[#A85A00] rounded-full"
                      style={{ width: `${Math.min(100, (sharePacks.length / 20) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[#5B6168] mt-1.5 block">
                    {lang === 'ml' ? 'താൽക്കാലിക ഷെയർ ലിങ്കുകൾ' : 'Active view-only links'}
                  </span>
                </Card>
              </div>

              {/* Document Categories Distribution Card */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-5 sm:p-6 lg:p-7 shadow-xs">
                <h3 className="text-base font-bold text-[#0B0B0C] mb-1 font-malayalam">
                  {lang === 'ml' ? 'വിഭാഗങ്ങൾ തിരിച്ചുള്ള രേഖകൾ' : 'Document Category Breakdown'}
                </h3>
                <p className="text-xs text-[#5B6168] mb-5 font-malayalam">
                  {lang === 'ml'
                    ? 'ഓരോ വിഭാഗത്തിലും സൂക്ഷിച്ചിട്ടുള്ള കുടുംബ രേഖകളുടെ വിവരങ്ങൾ.'
                    : 'Distribution of stored files across identity, property, vehicle, health, and NRI portfolios.'}
                </p>

                <div className="space-y-3.5">
                  {[
                    {
                      key: 'IDENTITY',
                      labelEn: 'Identity (Aadhaar, Passport, Voter ID)',
                      labelMl: 'തിരിച്ചറിയൽ രേഖകൾ (ആധാർ, പാസ്‌പോർട്ട്, വോട്ടർ ഐഡി)',
                      count: categoryCounts.IDENTITY,
                      color: '#E03A45',
                    },
                    {
                      key: 'PROPERTY',
                      labelEn: 'Property & Land (Deed, Tax, Pattayam)',
                      labelMl: 'വസ്തു & ഭൂനികുതി രേഖകൾ (ആധാരം, കരമടച്ച രസീത്)',
                      count: categoryCounts.PROPERTY,
                      color: '#1E4FD8',
                    },
                    {
                      key: 'VEHICLE',
                      labelEn: 'Vehicle & Transport (RC, Insurance, Pollution)',
                      labelMl: 'വാഹന രേഖകൾ (RC ബുക്ക്, ഇൻഷുറൻസ്, പുക സർട്ടിഫിക്കറ്റ്)',
                      count: categoryCounts.VEHICLE,
                      color: '#0F7B3E',
                    },
                    {
                      key: 'HEALTH',
                      labelEn: 'Medical & Health Insurance',
                      labelMl: 'ചികിത്സ & ആരോഗ്യ ഇൻഷുറൻസ് കാർഡുകൾ',
                      count: categoryCounts.HEALTH,
                      color: '#EFC94C',
                    },
                    {
                      key: 'GULF',
                      labelEn: 'Gulf & NRI (Iqama, Visa, Overseas ID)',
                      labelMl: 'ഗൾഫ് & NRI രേഖകൾ (ഇഖാമ, വിസ, എമിറേറ്റ്സ് ഐഡി)',
                      count: categoryCounts.GULF,
                      color: '#8A2BE2',
                    },
                  ].map((cat) => {
                    const percent =
                      totalDocCount > 0 ? Math.round((cat.count / totalDocCount) * 100) : 0;
                    return (
                      <div key={cat.key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#0B0B0C]">
                          <span className="font-malayalam">{lang === 'ml' ? cat.labelMl : cat.labelEn}</span>
                          <span className="font-mono-tabular text-[#5B6168]">
                            {cat.count} {lang === 'ml' ? 'രേഖകൾ' : 'docs'} ({percent}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-[#F4F5F7] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${percent}%`, backgroundColor: cat.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SECTION 4: PAYMENTS SETTINGS (Dynamic Billing & Invoicing Dashboard)
             ========================================================================= */}
          {activeSection === 'payments' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Card 1: Current Billing Details */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-5 sm:p-6 lg:p-7 shadow-xs">
                <div className="border-b border-[#F0F1F4] pb-4 mb-5 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-bold text-[#0B0B0C] font-malayalam">
                      {lang === 'ml' ? 'സബ്സ്ക്രിപ്ഷൻ ബില്ലിംഗ്' : 'Current Billing Plan'}
                    </h3>
                    <p className="text-xs text-[#5B6168] mt-0.5 font-malayalam">
                      {lang === 'ml'
                        ? 'വാർഷിക സബ്സ്ക്രിപ്ഷനും പേയ്‌മെന്റ് സ്റ്റാറ്റസും.'
                        : 'Your active billing cycle, invoice recipient, and payment status.'}
                    </p>
                  </div>

                  {/* 7 Authoritative Status Badges (Requirement 2) */}
                  {billingOverview?.unifiedStatus === 'PENDING PAYMENT' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFBEB] text-[#B45309] text-xs font-bold border border-amber-200">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{lang === 'ml' ? 'പരിശോധനയിലാണ്' : 'PAYMENT PENDING VERIFICATION'}</span>
                    </span>
                  ) : billingOverview?.unifiedStatus === 'PAYMENT REJECTED' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDECEE] text-[#E03A45] text-xs font-bold border border-[#F9C3C6]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{lang === 'ml' ? 'നിരസിച്ചു' : 'PAYMENT REJECTED'}</span>
                    </span>
                  ) : billingOverview?.unifiedStatus === 'CANCELLATION SCHEDULED' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF7ED] text-[#C2410C] text-xs font-bold border border-[#FED7AA]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{lang === 'ml' ? 'റദ്ദാക്കാൻ നിശ്ചയിച്ചിരിക്കുന്നു' : 'CANCELLATION SCHEDULED'}</span>
                    </span>
                  ) : billingOverview?.unifiedStatus === 'CANCELLED' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4F5F7] text-[#5B6168] text-xs font-bold border border-[#E6E8EC]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{lang === 'ml' ? 'റദ്ദാക്കി' : 'SUBSCRIPTION CANCELLED'}</span>
                    </span>
                  ) : billingOverview?.unifiedStatus === 'EXPIRED' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDECEE] text-[#E03A45] text-xs font-bold border border-[#F9C3C6]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{lang === 'ml' ? 'കാലഹരണപ്പെട്ടു' : 'SUBSCRIPTION EXPIRED'}</span>
                    </span>
                  ) : billingOverview?.unifiedStatus === 'ACTIVE' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E4F7EC] text-[#0F7B3E] text-xs font-bold border border-[#BDE8D0]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{lang === 'ml' ? 'ആക്ടീവ് സബ്‌സ്‌ക്രിപ്ഷൻ' : 'SUBSCRIPTION ACTIVE'}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F0F1F4] text-[#5B6168] text-xs font-bold">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{billingOverview?.entitlements?.isTrialing ? 'FREE TRIAL ACTIVE' : 'FREE FOUNDING TIER'}</span>
                    </span>
                  )}
                </div>

                {/* Cancellation Scheduled Alert Banner */}
                {billingOverview?.cancellation?.isScheduled && (
                  <div className="mb-5 p-3.5 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] text-xs text-[#9A3412] flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#C2410C] shrink-0" />
                      <span>
                        <strong>Cancellation Scheduled:</strong> Your subscription remains fully active until{' '}
                        {billingOverview.cancellation.effectiveUntil
                          ? new Date(billingOverview.cancellation.effectiveUntil).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'end of billing term'}{' '}
                        ({billingOverview.cancellation.daysRemaining || 0} days remaining). Your documents will remain safe.
                      </span>
                    </div>
                  </div>
                )}

                {/* Pending Verification Notice Banner */}
                {billingOverview?.unifiedStatus === 'PENDING PAYMENT' && (
                  <div className="mb-5 p-3.5 rounded-xl bg-[#FFFBEB] border border-amber-200 text-xs text-[#92400E] flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#B45309] shrink-0" />
                      <span>
                        <strong>Payment Under Verification:</strong> Your payment of ₹
                        {billingOverview.activeRequest?.payableAmount?.toLocaleString('en-IN')} (UTR:{' '}
                        {billingOverview.activeRequest?.utrNumber || 'Submitted'}) has been received and is currently being verified by our administration team.
                      </span>
                    </div>
                  </div>
                )}

                {/* 4 Dynamic Detail Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  {/* Item 1: Current Plan */}
                  <div className="p-4 rounded-xl bg-[#F8F9FA] border border-[#E6E8EC]">
                    <span className="text-[11px] font-bold text-[#8A949E] uppercase tracking-wider block mb-1">
                      {lang === 'ml' ? 'പ്ലാൻ' : 'Current Plan'}
                    </span>
                    <span className="text-sm font-bold text-[#0B0B0C] block">
                      {billingOverview?.subscription?.planName || entitlement?.planName || 'Founding Household'}
                    </span>
                    <p className="text-[11px] text-[#5B6168] mt-0.5">
                      {billingOverview?.statusBadge?.labelEn ||
                        (entitlement?.status === 'active' ? 'Paid Active Plan' : '3-Day Free Trial')}
                    </p>
                  </div>

                  {/* Item 2: Expiry / Renewal Date */}
                  <div className="p-4 rounded-xl bg-[#F8F9FA] border border-[#E6E8EC]">
                    <span className="text-[11px] font-bold text-[#8A949E] uppercase tracking-wider block mb-1">
                      {lang === 'ml' ? 'അടുത്ത ബില്ലിംഗ് തീയതി' : 'Expiry / Renewal Date'}
                    </span>
                    <span className="text-sm font-bold text-[#0B0B0C] tabular-nums font-mono-tabular">
                      {billingOverview?.expiryOrRenewalDate
                        ? new Date(billingOverview.expiryOrRenewalDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'N/A'}
                    </span>
                    <p className="text-[11px] text-[#5B6168] mt-0.5">
                      {billingOverview?.cancellation?.isScheduled
                        ? `Cancels at term end (${billingOverview.cancellation.daysRemaining || 0}d left)`
                        : billingOverview?.unifiedStatus === 'ACTIVE'
                        ? 'Coverage active'
                        : billingOverview?.unifiedStatus === 'PENDING PAYMENT'
                        ? 'Activates upon admin verification'
                        : 'Renew to maintain full access'}
                    </p>
                  </div>

                  {/* Item 3: UTR Reference & Payment Amount (Real Backend Record) */}
                  <div className="p-4 rounded-xl bg-[#F8F9FA] border border-[#E6E8EC]">
                    <span className="text-[11px] font-bold text-[#8A949E] uppercase tracking-wider block mb-1">
                      {billingOverview?.latestApprovedPayment
                        ? lang === 'ml'
                          ? 'സ്ഥിരീകരിച്ച യു.ടി.ആർ'
                          : 'Approved UTR'
                        : lang === 'ml'
                        ? 'യു.ടി.ആർ നമ്പർ'
                        : 'Submitted UTR'}
                    </span>
                    <span className="text-xs font-mono font-bold text-[#0B0B0C] block truncate">
                      {billingOverview?.latestApprovedPayment?.utrNumber ||
                        billingOverview?.activeRequest?.utrNumber ||
                        'None'}
                    </span>
                    <p className="text-[11px] text-[#5B6168] mt-0.5">
                      {billingOverview?.latestApprovedPayment
                        ? `₹${billingOverview.latestApprovedPayment.amount.toLocaleString('en-IN')} paid • Admin Verified`
                        : billingOverview?.activeRequest?.payableAmount
                        ? `₹${billingOverview.activeRequest.payableAmount.toLocaleString('en-IN')} pending verification`
                        : 'No payment required (Free Tier)'}
                    </p>
                  </div>

                  {/* Item 4: Payment Channel */}
                  <div className="p-4 rounded-xl bg-[#F8F9FA] border border-[#E6E8EC]">
                    <span className="text-[11px] font-bold text-[#8A949E] uppercase tracking-wider block mb-1">
                      {lang === 'ml' ? 'പേയ്‌മെന്റ് രീതി' : 'Payment Channel'}
                    </span>
                    <span className="text-xs font-bold text-[#0B0B0C] block">
                      Manual UPI QR Code
                    </span>
                    <p className="text-[11px] text-[#0F7B3E] mt-0.5 font-semibold">
                      {billingOverview?.latestApprovedPayment ? 'Verified by Admin' : 'Admin Verification'}
                    </p>
                  </div>
                </div>

                {/* Rejection Details & Resubmit CTA */}
                {billingOverview?.activeRequest?.status === 'REJECTED' && billingOverview.activeRequest.rejectionReason && (
                  <div className="mt-4 p-3.5 rounded-xl bg-[#FDECEE] border border-[#F9C3C6] text-xs text-[#E03A45] flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <strong>Admin Rejection Reason:</strong> {billingOverview.activeRequest.rejectionReason}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsManagePlanModalOpen(true)}
                      className="px-3 py-1 rounded-lg bg-[#E03A45] text-white font-bold text-xs hover:bg-[#C42F3A] cursor-pointer shrink-0"
                    >
                      Resubmit Payment
                    </button>
                  </div>
                )}
              </div>

              {/* Card 2: Invoices & Billing History (Fully Dynamic) */}
              <div className="rounded-[22px] border border-[#E6E8EC] bg-white p-5 sm:p-6 lg:p-7 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#0B0B0C] font-malayalam">
                      {lang === 'ml' ? 'ബില്ലിംഗ് ചരിത്രവും രസീതുകളും' : 'Invoices & Billing History'}
                    </h3>
                    <p className="text-xs text-[#5B6168] mt-0.5 font-malayalam">
                      {lang === 'ml'
                        ? 'മുൻകാല പേയ്‌മെന്റുകളുടെ രസീതുകൾ ഡൗൺലോഡ് ചെയ്യാം.'
                        : 'Official payment confirmations and receipts for your records.'}
                    </p>
                  </div>
                </div>

                {isLoadingBillingHistory ? (
                  <div className="py-12 flex flex-col items-center justify-center text-[#8A949E]">
                    <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                    <span className="text-xs">Loading billing history...</span>
                  </div>
                ) : billingHistory.length === 0 ? (
                  /* Empty state when no payment records exist */
                  <div className="py-12 px-4 rounded-2xl bg-[#F8F9FA] border border-[#E6E8EC] text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-[#E6E8EC] text-[#8A949E] flex items-center justify-center mb-3 shadow-2xs">
                      <FileText className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-[#0B0B0C] mb-1">
                      {lang === 'ml' ? 'ബില്ലിംഗ് ചരിത്രം ലഭ്യമല്ല' : 'No Billing History Yet'}
                    </h4>
                    <p className="text-xs text-[#5B6168] max-w-md leading-relaxed mb-4">
                      {lang === 'ml'
                        ? 'നിങ്ങൾ ഇപ്പോൾ സൗജന്യ ഫൗണ്ടിംഗ് ഹൗസ്ഹോൾഡ് പ്ലാനിലാണ്. യു.പി.ഐ വഴി അപ്‌ഗ്രേഡ് ചെയ്യുമ്പോൾ പേയ്‌മെന്റ് രസീതുകൾ ഇവിടെ കാണാം.'
                        : 'You are currently on the Free Founding Household tier. When you upgrade via UPI QR transfer, your verified payment receipts and transaction records will appear here.'}
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setIsManagePlanModalOpen(true)}
                      className="cursor-pointer"
                    >
                      {lang === 'ml' ? 'പ്ലാനുകൾ കാണുക' : 'Explore Plans'}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#E6E8EC] text-[#8A949E] uppercase font-bold text-[10.5px] tracking-wider">
                            <th className="pb-3 pl-1 font-mono-tabular">Invoice #</th>
                            <th className="pb-3">Date</th>
                            <th className="pb-3">Description</th>
                            <th className="pb-3 text-right">Amount</th>
                            <th className="pb-3 text-center">Status</th>
                            <th className="pb-3 text-right pr-1">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F1F4] text-[#0B0B0C]">
                          {billingHistory.map((item) => (
                            <tr key={item.id} className="hover:bg-[#F9FAFB] transition-colors">
                              <td className="py-3.5 pl-1 font-mono-tabular font-bold text-[#0B0B0C]">
                                {item.invoiceNumber}
                              </td>
                              <td className="py-3.5 text-[#5B6168] font-mono-tabular">
                                {new Date(item.date).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </td>
                              <td className="py-3.5 font-medium">
                                {item.description}
                              </td>
                              <td className="py-3.5 text-right font-bold tabular-nums font-mono-tabular">
                                ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-3.5 text-center">
                                {item.status === 'PAID' ? (
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#E4F7EC] text-[#0F7B3E]">
                                    PAID
                                  </span>
                                ) : item.status === 'PENDING' ? (
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#FFFBEB] text-[#B45309]">
                                    PENDING
                                  </span>
                                ) : item.status === 'REJECTED' ? (
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#FDECEE] text-[#E03A45]">
                                    REJECTED
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#F4F5F7] text-[#5B6168]">
                                    CANCELLED
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 text-right pr-1">
                                {item.hasReceipt ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReceipt(item.id)}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E03A45] hover:text-[#C42F3A] cursor-pointer"
                                  >
                                    <FileDown className="w-3.5 h-3.5" />
                                    <span>{lang === 'ml' ? 'രസീത് കാണുക' : 'Receipt'}</span>
                                  </button>
                                ) : (
                                  <span className="text-[#8A949E] text-xs">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    {billingHistoryTotalPages > 1 && (
                      <div className="mt-4 pt-3 border-t border-[#F0F1F4] flex items-center justify-between text-xs text-[#5B6168]">
                        <span>
                          Showing page {billingHistoryPage} of {billingHistoryTotalPages} ({billingHistoryTotal} total)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={billingHistoryPage <= 1}
                            onClick={() => fetchBillingHistory(billingHistoryPage - 1)}
                            className="px-2.5 py-1 rounded-lg border border-[#E6E8EC] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 font-medium"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            disabled={billingHistoryPage >= billingHistoryTotalPages}
                            onClick={() => fetchBillingHistory(billingHistoryPage + 1)}
                            className="px-2.5 py-1 rounded-lg border border-[#E6E8EC] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 font-medium"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Configuration-Driven Dynamic Billing Notice (Requirement 8) */}
                {billingOverview?.notice && (
                  <div
                    className={`mt-6 p-4 rounded-2xl border text-xs flex items-start gap-3 ${
                      billingOverview.notice.isMaintenance
                        ? 'bg-[#FFFBEB] border-amber-200 text-[#92400E]'
                        : 'bg-[#F8F9FA] border-[#E6E8EC] text-[#5B6168]'
                    }`}
                  >
                    <ShieldCheck
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        billingOverview.notice.isMaintenance ? 'text-[#B45309]' : 'text-[#0F7B3E]'
                      }`}
                    />
                    <p className="leading-relaxed font-malayalam">
                      {lang === 'ml' ? billingOverview.notice.messageMl : billingOverview.notice.messageEn}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* =========================================================================
          MODAL: MANAGE PLAN (Upgrade / Tier Change with Detailed Plan Limitations)
         ========================================================================= */}
      <PlanComparisonModal
        isOpen={isManagePlanModalOpen}
        onClose={() => setIsManagePlanModalOpen(false)}
        lang={lang}
        currentEntitlement={entitlement}
        isLoadingEntitlement={isLoadingEntitlement}
        onSelectPlan={(planId) => handleSelectPlan(planId)}
        isProcessingCheckout={false}
        checkoutError={checkoutError}
      />

      {/* =========================================================================
          MODAL: CONFIRM CANCELLATION DIALOG (Accessibility & Safety requirement)
         ========================================================================= */}
      {isCancelConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setIsCancelConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl border border-[#E6E8EC] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#FFF5F5] text-[#E03A45] flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0B0B0C]">Cancel Family Subscription?</h3>
              <p className="text-xs text-[#5B6168] mt-1 leading-relaxed">
                Your subscription remains active until the end of the current billing cycle. Downgrading to Founding Free will
                adjust storage limit to 3 GB and seat count to 5 family members.
                Existing documents and family members will remain safely preserved.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsCancelConfirmOpen(false)}
                className="flex-1 cursor-pointer"
              >
                Keep My Plan
              </Button>
              <button
                type="button"
                disabled={isCancellingSubscription}
                onClick={handleConfirmCancelSubscription}
                className="flex-1 py-2 rounded-full bg-[#E03A45] hover:bg-[#C42F3A] text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isCancellingSubscription ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Confirm Cancel</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Notice Banner */}
      {cancelSuccessMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-[#0B0B0C] text-white text-xs font-semibold shadow-2xl flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-[#0F7B3E]" />
          <span>{cancelSuccessMsg}</span>
        </div>
      )}

      {/* Checkout Success Notice Banner */}
      {checkoutSuccessMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-[#0F7B3E] text-white text-xs font-semibold shadow-2xl flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{checkoutSuccessMsg}</span>
        </div>
      )}

      {/* =========================================================================
          MODAL: VIEW & PRINT OFFICIAL PAYMENT RECEIPT (Dynamic Real Data)
         ========================================================================= */}
      {isReceiptModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setIsReceiptModalOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-[28px] bg-white p-6 sm:p-8 shadow-2xl border border-[#E6E8EC] space-y-6 my-8 text-[#0B0B0C]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E6E8EC] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#FDECEE] text-[#E03A45] flex items-center justify-center">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0B0B0C]">Kudumba Vault Payment Receipt</h3>
                  <p className="text-[11px] text-[#5B6168]">Official Subscription Confirmation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="w-9 h-9 rounded-full bg-[#F4F5F7] hover:bg-[#E6E8EC] text-[#0B0B0C] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingReceipt ? (
              <div className="py-12 flex flex-col items-center justify-center text-[#8A949E]">
                <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                <span className="text-xs">Loading official receipt...</span>
              </div>
            ) : receiptError ? (
              <div className="p-4 rounded-xl bg-red-50 text-red-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{receiptError}</span>
              </div>
            ) : selectedReceipt ? (
              /* Printable Receipt Body */
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-start border-b border-[#F0F1F4] pb-3 font-mono-tabular">
                  <div>
                    <p className="font-bold text-[#0B0B0C]">Billed To:</p>
                    <p className="text-[#5B6168] mt-0.5">{selectedReceipt.customerName}</p>
                    <p className="text-[#5B6168]">{selectedReceipt.householdName}</p>
                    <p className="text-[#5B6168]">{selectedReceipt.customerEmail}</p>
                    {selectedReceipt.billingAddress && (
                      <p className="text-[#8A949E] text-[11px] mt-1">
                        {[
                          selectedReceipt.billingAddress.houseBuilding,
                          selectedReceipt.billingAddress.streetLocality,
                          selectedReceipt.billingAddress.city,
                          selectedReceipt.billingAddress.state,
                          selectedReceipt.billingAddress.postalCode,
                          selectedReceipt.billingAddress.country,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#0B0B0C]">Receipt ID: {selectedReceipt.receiptNumber}</p>
                    <p className="text-[#5B6168] mt-0.5">
                      Date:{' '}
                      {new Date(selectedReceipt.receiptDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    <span className="inline-block px-2 py-0.5 rounded bg-[#E4F7EC] text-[#0F7B3E] font-bold text-[10px] mt-1">
                      STATUS: {selectedReceipt.status}
                    </span>
                  </div>
                </div>

                <div className="py-2">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#E6E8EC] text-[#8A949E] uppercase text-[10px]">
                        <th className="pb-2">Description</th>
                        <th className="pb-2 text-right">Period</th>
                        <th className="pb-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="font-medium">
                      <tr>
                        <td className="py-2.5">
                          {selectedReceipt.planName} ({selectedReceipt.billingDuration} duration)
                        </td>
                        <td className="py-2.5 text-right text-[#5B6168]">
                          {selectedReceipt.durationMonths} Month(s)
                        </td>
                        <td className="py-2.5 text-right font-bold">
                          ₹{selectedReceipt.amountPaid.toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="p-3 rounded-xl bg-[#F8F9FA] border border-[#E6E8EC] space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#8A949E]">Transaction Reference (UTR):</span>
                    <span className="font-mono font-bold text-[#0B0B0C]">{selectedReceipt.utrNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8A949E]">Payment Method:</span>
                    <span className="font-medium text-[#0B0B0C]">{selectedReceipt.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8A949E]">Verified By:</span>
                    <span className="font-medium text-[#0F7B3E]">{selectedReceipt.verifiedBy}</span>
                  </div>
                </div>

                <div className="border-t border-[#E6E8EC] pt-3 flex justify-between font-bold text-sm">
                  <span>Total Paid (INR):</span>
                  <span>₹{selectedReceipt.amountPaid.toFixed(2)}</span>
                </div>

                {/* Statutory Distinction: Payment Receipt vs Tax Invoice */}
                <p className="text-[10px] text-[#8A949E] leading-relaxed italic pt-1">
                  {selectedReceipt.disclaimer}
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E6E8EC]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.print()}
                disabled={!selectedReceipt}
                className="cursor-pointer flex items-center gap-2"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsReceiptModalOpen(false)}
                className="cursor-pointer"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
