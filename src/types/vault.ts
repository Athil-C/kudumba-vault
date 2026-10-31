export type Language = 'ml' | 'en';
export type DocStatusType = 'EXPIRED' | 'DUE_SOON' | 'VALID';
export type DocStatus = DocStatusType;
export type VaultCategory =
  | 'ALL'
  | 'IDENTITY'
  | 'GULF'
  | 'VEHICLE'
  | 'PROPERTY'
  | 'HEALTH'
  | 'MEDICAL';
export type AppNavTab = 'home' | 'vault' | 'people' | 'workers' | 'share' | 'settings';
export type RateUnitType = 'per visit' | 'per day' | 'per job';
export type RateUnit = RateUnitType;

export interface TradeDefinition {
  id: string;
  key?: string;
  en: string;
  ml: string;
  labelEn?: string;
  labelMl?: string;
  iconName: 'Zap' | 'Droplet' | 'Snowflake' | 'Trees' | 'Hammer' | 'Car' | 'Wrench';
}

export interface HouseholdMemberItem {
  id: string;
  nameMl: string;
  nameEn: string;
  locMl?: string;
  locEn?: string;
  location?: string;
  relationMl: string;
  relationEn: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  homePhone?: string;
  residencyStatus?: string;
  householdName?: string;
  role?: 'OWNER' | 'EDITOR';
  status?: 'ACTIVE' | 'INVITED' | 'REMOVED';
  initials: string;
  colorHex?: string;
  avatarBg?: string;
  avatarDataUrl?: string;
}

export interface RenewalHistoryEntry {
  id?: string;
  date: string;
  noteMl?: string;
  noteEn?: string;
  actionMl?: string;
  actionEn?: string;
  by?: string;
}

export interface VaultDocItem {
  id: string;
  titleMl: string;
  titleEn: string;
  categoryMl?: string;
  categoryEn?: string;
  subMl?: string;
  subEn?: string;
  categoryId?: string;
  category?: VaultCategory;
  docTypeCode?: string;
  memberId?: string;
  ownerMl: string;
  ownerEn: string;
  docNumber: string;
  expiryDate: string;
  daysRemaining?: number;
  daysTextEn?: string;
  daysTextMl?: string;
  status: DocStatusType;
  authorityMl: string;
  authorityEn: string;
  attachmentDataUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  fileDataUrl?: string;
  fileName?: string;
  fileSize?: number; // Exact document binary size in bytes
  renewalHistory: RenewalHistoryEntry[];
  ownerId?: string;
  ownerEmail?: string;
}

export type VaultDocumentItem = VaultDocItem;

export interface StorageUsageStats {
  usedBytes: number;
  quotaBytes: number;
  percentageUsed: number;
  documentCount: number;
  planName: string;
  quotaGiB: number;
  usedGiB: number;
  categoryBreakdown: Record<string, { count: number; bytes: number }>;
}

export interface WorkerHistoryEntry {
  id: string;
  date: string;
  workMl: string;
  workEn: string;
  amount: number;
  paid: boolean;
  photoDataUrl?: string;
  reminderCreated?: boolean;
}

export interface WorkerRecordItem {
  id: string;
  nameMl: string;
  nameEn: string;
  areaMl: string;
  areaEn: string;
  tradeMl?: string;
  tradeEn?: string;
  roleMl?: string;
  roleEn?: string;
  tradeId?: string;
  iconName?: string;
  countryCode: string;
  phone: string;
  altPhone?: string;
  whatsapp: string;
  rateAmount?: number;
  rateUnit?: RateUnitType;
  lastVisit?: string;
  lastServiceDate?: string;
  notesMl: string;
  notesEn: string;
  rating: number;
  favourite: boolean;
  cardDataUrl?: string;
  photoDataUrl?: string;
  history: WorkerHistoryEntry[];
}

export interface SharePackItem {
  id: string;
  titleMl: string;
  titleEn: string;
  descMl?: string;
  descEn?: string;
  recipientMl?: string;
  recipientEn?: string;
  tag?: string;
  expiryLabelEn?: string;
  expiryLabelMl?: string;
  recipientType?: string;
  docIds: string[];
  createdAt: string;
  active?: boolean;
}

/**
 * Formats an ISO date string (e.g. "2025-03-14") into a localized human-readable date
 * ("14 Mar 2025" in English or "14 മാർച്ച് 2025" in Malayalam).
 */
export function formatHumanDate(isoDate: string | undefined, lang: 'ml' | 'en' = 'en'): string {
  if (!isoDate) return '';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  try {
    return parsed.toLocaleDateString(lang === 'ml' ? 'ml-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Formats a number using Indian digit grouping (e.g. 125000 -> "₹1,25,000").
 */
export function formatINR(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '₹0';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/**
 * Reads and client-side compresses an image file into a Base64 Data URL for permanent storage.
 */
export function readFileAsDataUrl(file: File, maxDim: number = 1200): Promise<{
  dataUrl: string;
  name: string;
  sizeLabel: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      if (!file.type.startsWith('image/')) {
        const kb = Math.max(1, Math.round(file.size / 1024));
        resolve({
          dataUrl: rawDataUrl,
          name: file.name,
          sizeLabel: kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`,
        });
        return;
      }

      // Client-side image compression via offscreen canvas
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedUrl = canvas.toDataURL('image/jpeg', 0.82);
          const approxKb = Math.max(
            1,
            Math.round((compressedUrl.length * 0.75) / 1024)
          );
          resolve({
            dataUrl: compressedUrl,
            name: file.name,
            sizeLabel: `${approxKb} KB`,
          });
        } else {
          resolve({
            dataUrl: rawDataUrl,
            name: file.name,
            sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          });
        }
      };
      img.onerror = () => {
        resolve({
          dataUrl: rawDataUrl,
          name: file.name,
          sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        });
      };
      img.src = rawDataUrl;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
