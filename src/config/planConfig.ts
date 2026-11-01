export interface PlanConfiguration {
  id: string;
  nameEn: string;
  nameMl: string;
  priceInr: number;
  cadence: 'FREE' | 'MONTHLY' | 'ANNUAL';
  storageQuotaBytes: number;
  maxFileSizeBytes: number;
  maxFamilyMembers: number;
  maxDocuments?: number;
  allowedMimeTypes: string[];
  featuresEn: string[];
  featuresMl: string[];
  isBillable: boolean;
}

export const GIB_IN_BYTES = 1024 * 1024 * 1024;
export const MIB_IN_BYTES = 1024 * 1024;

export const DEFAULT_TRIAL_DAYS = 3;
export const DEFAULT_GRACE_PERIOD_HOURS = 48;

export const AUTHORITATIVE_PLANS: Record<string, PlanConfiguration> = {
  'founding-free': {
    id: 'founding-free',
    nameEn: 'Founding Household (Free Trial / V1 Launch)',
    nameMl: 'ഫൗണ്ടിംഗ് ഫാമിലി പ്ലാൻ (V1 സൗജന്യം)',
    priceInr: 0,
    cadence: 'FREE',
    storageQuotaBytes: 3 * GIB_IN_BYTES, // 3 GiB default quota
    maxFileSizeBytes: 25 * MIB_IN_BYTES, // 25 MB file limit
    maxFamilyMembers: 5,
    maxDocuments: 3, // Founding Free tier allows at most 3 eligible documents
    isBillable: false,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    featuresEn: [
      'Up to 5 household family members',
      '3 GB secure cloud document storage',
      '18+ Kerala & Gulf document types',
      'Email & SMS expiry alerts',
      'Workers Book + Kerala Ledgers',
      'Aadhaar automatic 8-digit masking',
    ],
    featuresMl: [
      '5 കുടുംബാംഗങ്ങൾ വരെ ചേർക്കാം',
      '3 GB അതിസുരക്ഷിത ക്ലൗഡ് സ്റ്റോറേജ്',
      '18+ കേരള-ഗൾഫ് രേഖാ വിഭാഗങ്ങൾ',
      'ഇമെയിൽ/SMS മുന്നറിയിപ്പ്',
      'ജോലിക്കാരുടെ ബുക്ക് + കണക്കുകൾ',
      'ആധാർ 8-അക്ക ഓട്ടോ-മാസ്കിംഗ് സുരക്ഷ',
    ],
  },
  'nri-plus': {
    id: 'nri-plus',
    nameEn: 'NRI Family Plus',
    nameMl: 'എൻ.ആർ.ഐ ഫാമിലി പ്ലസ്',
    priceInr: 99,
    cadence: 'MONTHLY',
    storageQuotaBytes: 15 * GIB_IN_BYTES, // 15 GiB
    maxFileSizeBytes: 50 * MIB_IN_BYTES, // 50 MB
    maxFamilyMembers: 12,
    isBillable: true,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    featuresEn: [
      'Up to 12 household family members',
      '15 GB high-res document vault',
      'Remote WhatsApp upload links for parents',
      'GCC + India SMS alerts',
      'Watermarked expiring Share Packs',
    ],
    featuresMl: [
      '12 കുടുംബാംഗങ്ങൾ വരെ',
      '15 GB വിപുലമായ സ്റ്റോറേജ്',
      'രേഖകൾ ആവശ്യപ്പെടാനുള്ള വാട്സാപ്പ് ലിങ്ക്',
      'ഇന്ത്യ + ഗൾഫ് SMS അലേർട്ട്',
      'വാട്ടർമാർക്ക് ചെയ്ത ഷെയർ പാക്കുകൾ',
    ],
  },
  'partner-pro': {
    id: 'partner-pro',
    nameEn: 'Partners & Societies',
    nameMl: 'പാർട്ണർ പ്ലാൻ',
    priceInr: 199,
    cadence: 'MONTHLY',
    storageQuotaBytes: 100 * GIB_IN_BYTES, // 100 GiB
    maxFileSizeBytes: 100 * MIB_IN_BYTES,
    maxFamilyMembers: 50,
    isBillable: true,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    featuresEn: [
      'Multi-tenant client portal',
      '100 GB vault storage',
      'Bulk CSV client & policy import',
      'Automated compliance reminders',
      'GST tax invoices',
    ],
    featuresMl: [
      'ക്ലയന്റ് കുടുംബങ്ങൾക്കായി പ്രത്യേക പോർട്ടൽ',
      '100 GB സ്റ്റോറേജ്',
      'ബൾക്ക് ഡാറ്റാ ഇംപോർട്ട്',
      'നികുതി ഓർമ്മപ്പെടുത്തൽ',
      'ജി.എസ്.ടി ഇൻവോയ്സ്',
    ],
  },
};

export function getPlanConfig(planId?: string): PlanConfiguration {
  return (planId && AUTHORITATIVE_PLANS[planId])
    ? AUTHORITATIVE_PLANS[planId]
    : AUTHORITATIVE_PLANS['founding-free'];
}
