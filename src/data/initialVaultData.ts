import {
  HouseholdMemberItem,
  VaultDocItem,
  WorkerRecordItem,
  SharePackItem,
  TradeDefinition,
} from '../types/vault';

export const STORAGE_KEYS = {
  DOCS: 'kudumba_vault_docs_v4',
  MEMBERS: 'kudumba_vault_members_v4',
  WORKERS: 'kudumba_vault_workers_v4',
  SHARE: 'kudumba_vault_share_v4',
  SETTINGS: 'kudumba_vault_settings_v4',
} as const;

export const TRADE_DEFINITIONS: TradeDefinition[] = [
  {
    id: 'ELECTRICIAN',
    en: 'Electrician',
    ml: 'ഇലക്ട്രീഷ്യൻ',
    iconName: 'Zap',
  },
  {
    id: 'PLUMBER',
    en: 'Plumber',
    ml: 'പ്ലംബർ',
    iconName: 'Droplet',
  },
  {
    id: 'AC_TECH',
    en: 'AC & Inverter',
    ml: 'എസി & ഇൻവെർട്ടർ',
    iconName: 'Snowflake',
  },
  {
    id: 'COCONUT',
    en: 'Coconut & Garden',
    ml: 'തെങ്ങ് & തോട്ടം',
    iconName: 'Trees',
  },
  {
    id: 'CARPENTER',
    en: 'Carpenter',
    ml: 'ആശാരി',
    iconName: 'Hammer',
  },
  {
    id: 'DRIVER',
    en: 'Driver',
    ml: 'ഡ്രൈവർ',
    iconName: 'Car',
  },
  {
    id: 'OTHER',
    en: 'Other',
    ml: 'മറ്റുള്ളവ',
    iconName: 'Wrench',
  },
];

export const KERALA_LOCALITIES: string[] = [
  'Edappally, Kochi',
  'Kakkanad, Kochi',
  'Tripunithura, Kochi',
  'Aluva, Ernakulam',
  'Kalamassery, Kochi',
  'Vyttila, Kochi',
  'Panampilly Nagar, Kochi',
  'Thrissur Town',
  'Calicut / Kozhikode',
  'Trivandrum / Kazhakkoottam',
  'Kottayam',
  'Dubai, UAE',
];

export const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91 (India)' },
  { code: '+971', label: '🇦🇪 +971 (UAE)' },
  { code: '+966', label: '🇸🇦 +966 (Saudi)' },
  { code: '+974', label: '🇶🇦 +974 (Qatar)' },
  { code: '+965', label: '🇰🇼 +965 (Kuwait)' },
  { code: '+968', label: '🇴🇲 +968 (Oman)' },
  { code: '+973', label: '🇧🇭 +973 (Bahrain)' },
];

/**
 * Production defaults for fresh first-time visitors (0 sample/demo data).
 */
export const INITIAL_MEMBERS: HouseholdMemberItem[] = [];

export const INITIAL_DOCS: VaultDocItem[] = [];

export const INITIAL_WORKERS: WorkerRecordItem[] = [];

export const INITIAL_SHARE_PACKS: SharePackItem[] = [];

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
