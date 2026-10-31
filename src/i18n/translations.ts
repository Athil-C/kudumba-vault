export type Language = 'ml' | 'en';

export type PageId =
  | 'home'
  | 'features'
  | 'how-it-works'
  | 'pricing'
  | 'security'
  | 'for-nris'
  | 'for-partners'
  | 'faq'
  | 'contact'
  | 'privacy'
  | 'terms';

export interface SeededDocType {
  code: string;
  category: string;
  nameEn: string;
  nameMl: string;
  region: string;
  portalName: string;
  portalUrl: string;
  defaultRemindDays: number[];
}

export const SEEDED_DOCUMENT_TYPES: SeededDocType[] = [
  { code: 'AADHAAR', category: 'Identity', nameEn: 'Aadhaar Card (Auto-Masked)', nameMl: 'ആധാർ കാർഡ് (സുരക്ഷിത മാസ്കിംഗ്)', region: 'KL-IN', portalName: 'myAadhaar Portal', portalUrl: 'https://myaadhaar.uidai.gov.in', defaultRemindDays: [60, 30] },
  { code: 'PAN', category: 'Identity', nameEn: 'PAN Card', nameMl: 'പാൻ കാർഡ് (PAN)', region: 'KL-IN', portalName: 'Income Tax e-Filing', portalUrl: 'https://www.incometax.gov.in', defaultRemindDays: [60] },
  { code: 'VOTER_ID', category: 'Identity', nameEn: 'Voter ID (EPIC)', nameMl: 'വോട്ടർ ഐഡി', region: 'KL-IN', portalName: 'ECI Voters Portal', portalUrl: 'https://voters.eci.gov.in', defaultRemindDays: [60] },
  { code: 'RATION_CARD', category: 'Identity', nameEn: 'Kerala Ration Card', nameMl: 'റേഷൻ കാർഡ് (കേരളം)', region: 'KL-IN', portalName: 'e-POS Civil Supplies Kerala', portalUrl: 'https://ecitizen.civilsupplieskerala.gov.in', defaultRemindDays: [60, 30] },
  { code: 'DRIVING_LICENCE', category: 'Identity', nameEn: 'Driving Licence', nameMl: 'ഡ്രൈവിംഗ് ലൈസൻസ്', region: 'KL-IN', portalName: 'Parivahan Sarathi', portalUrl: 'https://parivahan.gov.in', defaultRemindDays: [60, 30, 7, 1] },
  { code: 'PASSPORT', category: 'Identity', nameEn: 'Indian Passport', nameMl: 'ഇന്ത്യൻ പാസ്‌പോർട്ട്', region: 'KL-IN', portalName: 'Passport Seva', portalUrl: 'https://www.passportindia.gov.in', defaultRemindDays: [180, 60, 30, 7] },
  { code: 'IQAMA_EMIRATES_ID', category: 'Gulf documents', nameEn: 'Iqama / Emirates ID / Civil ID', nameMl: 'ഇഖാമ / എമിറേറ്റ്സ് ഐഡി', region: 'GCC', portalName: 'Absher / ICP UAE', portalUrl: 'https://icp.gov.ae', defaultRemindDays: [60, 30, 7, 1] },
  { code: 'VEHICLE_RC', category: 'Vehicle', nameEn: 'Vehicle RC (Registration)', nameMl: 'വാഹന ആർ.സി (RC Book)', region: 'KL-IN', portalName: 'Parivahan Vahan', portalUrl: 'https://vahan.parivahan.gov.in', defaultRemindDays: [60, 30, 7] },
  { code: 'VEHICLE_INSURANCE', category: 'Vehicle', nameEn: 'Motor Insurance Policy', nameMl: 'വാഹന ഇൻഷുറൻസ് പോളിസി', region: 'KL-IN', portalName: 'mParivahan / Insurer', portalUrl: 'https://parivahan.gov.in', defaultRemindDays: [60, 30, 7, 1] },
  { code: 'PUC_CERTIFICATE', category: 'Vehicle', nameEn: 'Pollution Under Control (PUC)', nameMl: 'പുക പരിശോധന സർട്ടിഫിക്കറ്റ് (PUC)', region: 'KL-IN', portalName: 'PUCC Parivahan', portalUrl: 'https://puc.parivahan.gov.in', defaultRemindDays: [30, 7, 1] },
  { code: 'LAND_TAX', category: 'Property', nameEn: 'Kerala Land Tax Receipt (കരമടച്ച രസിത്)', nameMl: 'ഭൂനികുതി രസിത് (കരമടച്ച രസിത്)', region: 'KL-IN', portalName: 'ReLIS Revenue Kerala', portalUrl: 'https://revenue.kerala.gov.in', defaultRemindDays: [60, 30, 7, 1] },
  { code: 'BUILDING_TAX', category: 'Property', nameEn: 'LSGD Building Property Tax', nameMl: 'കെട്ടിട നികുതി രസിത് (K-SMART / Sanchaya)', region: 'KL-IN', portalName: 'K-SMART / Sanchaya Kerala', portalUrl: 'https://ksmart.lsgkerala.gov.in', defaultRemindDays: [60, 30, 7, 1] },
  { code: 'POSSESSION_CERT', category: 'Property', nameEn: 'Possession Certificate', nameMl: 'കൈവശാവകാശ സർട്ടിഫിക്കറ്റ്', region: 'KL-IN', portalName: 'e-District Kerala', portalUrl: 'https://edistrict.kerala.gov.in', defaultRemindDays: [60, 30] },
  { code: 'KSEB_BILL', category: 'Property', nameEn: 'KSEB Electricity Bill & Consumer No.', nameMl: 'കെ.എസ്.ഇ.ബി (KSEB) വൈദ്യുതി ബിൽ', region: 'KL-IN', portalName: 'KSEB QuickPay', portalUrl: 'https://wss.kseb.in', defaultRemindDays: [7, 1] },
  { code: 'GOLD_LOAN', category: 'Loans/Gold', nameEn: 'Gold Loan Pawn Ticket (സ്വർണ്ണ വായ്പ)', nameMl: 'സ്വർണ്ണ വായ്പ രസിത് (Gold Loan)', region: 'KL-IN', portalName: 'Bank / KSFE Branch', portalUrl: 'https://ksfe.com', defaultRemindDays: [60, 30, 7, 1] },
  { code: 'HEALTH_LIC_POLICY', category: 'Insurance', nameEn: 'LIC / Family Health Insurance', nameMl: 'എൽ.ഐ.സി / ഹെൽത്ത് ഇൻഷുറൻസ്', region: 'KL-IN', portalName: 'LIC India / TPA', portalUrl: 'https://licindia.in', defaultRemindDays: [60, 30, 7, 1] },
  { code: 'WARRANTY_CARD', category: 'Warranty', nameEn: 'Appliance / Inverter Warranty Card', nameMl: 'ഗൃഹോപകരണ വാറന്റി കാർഡ്', region: 'KL-IN', portalName: 'Manufacturer Service', portalUrl: '#', defaultRemindDays: [60, 30, 7] },
  { code: 'MEDICAL_REPORT', category: 'Medical', nameEn: 'Medical Discharge & Lab Summary', nameMl: 'മെഡിക്കൽ റിപ്പോർട്ട് & പ്രിസ്ക്രിപ്ഷൻ', region: 'KL-IN', portalName: 'Hospital Patient Portal', portalUrl: '#', defaultRemindDays: [60, 30] },
];

export const TRANSLATIONS = {
  ml: {
    brandName: 'കുടുംബ വോൾട്ട്',
    brandSub: 'Kudumba Vault',
    productSentence: 'നിങ്ങളുടെ കുടുംബത്തിന് ആവശ്യമുള്ളതെല്ലാം 10 സെക്കൻഡിനുള്ളിൽ കണ്ടെത്താം, കാലാവധി കഴിയുന്നതിന് മുമ്പ് മുന്നറിയിപ്പും.',
    heroSub: 'കേരളത്തിലെ വീടുകൾക്കും ഗൾഫിലുള്ള പ്രവാസി കുടുംബാംഗങ്ങൾക്കുമായി നിർമ്മിച്ച സ്വകാര്യ ഡോക്യുമെന്റ് വോൾട്ടും, കാലാവധി ഓർമ്മപ്പെടുത്തലും, ജോലിക്കാരുടെ ഡയറക്ടറിയും.',
    ctaPrimary: 'സൗജന്യമായി കുടുംബ വോൾട്ട് തുടങ്ങുക',
    ctaSecondary: 'ലൈവ് ഡെമോ കാണുക',
    noGovDisclaimer: 'സ്വതന്ത്ര സ്വകാര്യ കുടുംബ ആപ്പ് — ഇതൊരു സർക്കാർ അംഗീകൃത സംവിധാനമോ ഔദ്യോഗിക സർക്കാർ പോർട്ടലോ അല്ല.',
    nav: {
      home: 'ഹോം',
      features: 'സവിശേഷതകൾ',
      howItWorks: 'പ്രവർത്തനരീതി',
      pricing: 'നിരക്കുകൾ',
      security: 'സുരക്ഷ',
      forNris: 'പ്രവാസികൾക്ക്',
      forPartners: 'പാർട്ണർമാർക്ക്',
      faq: 'സംശയങ്ങൾ',
      contact: 'ബന്ധപ്പെടുക',
      privacy: 'സ്വകാര്യതാ നയം',
      terms: 'നിബന്ധനകൾ',
    },
    stepsTitle: '3 ലളിതമായ ഘട്ടങ്ങളിലൂടെ കുടുംബ രേഖകൾ സുരക്ഷിതമാക്കാം',
    steps: [
      {
        num: '01.',
        title: 'ഫോട്ടോ എടുക്കുക അല്ലെങ്കിൽ അപ്‌ലോഡ് ചെയ്യുക',
        desc: 'ഭൂനികുതി രസിത്, പാസ്‌പോർട്ട്, ഇഖാമ, വാഹന ഇൻഷുറൻസ്, സ്വർണ്ണ വായ്പ രസിത് എന്നിവ 3 ടാപ്പിൽ ചേർക്കാം. ഫോണിൽ തന്നെ ഓട്ടോ-ംപ്രസ്സ് ചെയ്യും.',
      },
      {
        num: '02.',
        title: 'കാലാവധി കഴിയുന്നതിന് മുമ്പ് കൃത്യമായ മുന്നറിയിപ്പ്',
        desc: 'കാലാവധി അവസാനിക്കുന്നതിന് 60, 30, 7, 1 ദിവസങ്ങൾക്ക് മുമ്പ് ഇമെയിൽ, SMS വഴി വീട്ടുകാർക്കും പ്രവാസികൾക്കും അലേർട്ട് ലഭിക്കുന്നു.',
      },
      {
        num: '03.',
        title: '10 സെക്കൻഡിൽ തിരയാം, സുരക്ഷിതമായി പങ്കിടാം',
        desc: 'ആധാറിലെ ആദ്യ 8 അക്കങ്ങൾ തനിയെ മറച്ചുവെക്കും (XXXX-XXXX-4821). വീട്ടിലെ ഇലക്ട്രീഷ്യൻ, പ്ലംബർ, കുറി, വീട്ടുജോലിക്കാരുടെ ശമ്പളം എന്നിവയും ഒരിടത്ത്.',
      },
    ],
    categoriesTitle: 'കേരളത്തിലെ ഒരു വീട്ടിലേക്ക് വേണ്ട 9 വിഭാഗങ്ങളും 18+ രേഖകളും',
    keralaExtrasTitle: 'രേഖകൾക്ക് പുറമെ നിങ്ങളുടെ വീടിനായി 4 പ്രത്യേക സൗകര്യങ്ങൾ',
    keralaExtras: [
      {
        title: 'പ്രവാസികൾക്കായി “രേഖ ആവശ്യപ്പെടാം” (NRI Request)',
        desc: 'ദുബായിലോ റിയാദിലോ ഇരുന്നുകൊണ്ട് നാട്ടിലെ അച്ഛനോട് ഭൂനികുതി രസിതോ സർട്ടിഫിക്കറ്റോ അപ്‌ലോഡ് ചെയ്യാൻ ഒറ്റ ക്ലിക്കിൽ അഭ്യർത്ഥിക്കാം.',
      },
      {
        title: 'കുറി / ചിട്ടി ട്രാക്കർ (KSFE & Local Kuri)',
        desc: 'പ്രതിമാസ തവണകൾ, ലേല തീയതികൾ, അടച്ച മാസങ്ങളുടെ കണക്ക് എന്നിവ തെറ്റാതെ സൂക്ഷിക്കാം.',
      },
      {
        title: 'വീട് നിർമ്മാണ & പെർമിറ്റ് ട്രാക്കർ',
        desc: 'പഞ്ചായത്ത് ബിൽഡിംഗ് പെർമിറ്റ് കാലാവധി, കോൺട്രാക്ടർ ബില്ലുകൾ, ഓരോ ഘട്ടത്തിലെയും ചിലവുകൾ രേഖപ്പെടുത്താം.',
      },
      {
        title: 'വീട്ടുജോലിക്കാരുടെ ശമ്പള & ലീവ് കണക്ക്',
        desc: 'ഹോം നഴ്‌സ്, വീട്ടുജോലിക്കാർ എന്നിവരുടെ മാസ ശമ്പളം, അഡ്വാൻസ്, അവധി ദിനങ്ങൾ എന്നിവ തർക്കമില്ലാതെ സൂക്ഷിക്കാം.',
      },
    ],
    trustStrip: [
      { title: 'ആധാർ 8-അക്ക മാസ്കിംഗ്', desc: 'ആധാർ നമ്പർ ഒരിക്കലും പ്ലെയിൻ ടെക്സ്റ്റായി സൂക്ഷിക്കില്ല; XXXX-XXXX-4821 എന്ന് മാത്രം കാണിക്കുന്നു.' },
      { title: 'AES-256 എൻക്രിപ്ഷൻ', desc: 'രേഖകളുടെ നമ്പറുകൾ അപ്ലിക്കേഷൻ തലത്തിൽ എൻക്രിപ്റ്റ് ചെയ്താണ് സൂക്ഷിക്കുന്നത്.' },
      { title: 'DPDP Act 2023 പാലിക്കുന്നു', desc: 'എപ്പോൾ വേണമെങ്കിലും നിങ്ങളുടെ മുഴുവൻ ഡാറ്റയും ഡൗൺലോഡ് ചെയ്യാനും അക്കൗണ്ട് ഡിലീറ്റ് ചെയ്യാനും അവകാശമുണ്ട്.' },
    ],
  },
  en: {
    brandName: 'Kudumba Vault',
    brandSub: 'കുടുംബ വോൾട്ട്',
    productSentence: 'Everything your family needs to find in 10 seconds, with alerts before anything expires.',
    heroSub: 'A calm, private household document vault, automated expiry alert engine, and trusted workers book crafted for Kerala families and Gulf-based NRI members.',
    ctaPrimary: 'Start Free Household Vault',
    ctaSecondary: 'Try Interactive Demo',
    noGovDisclaimer: 'Independent private household organizer — not affiliated with, endorsed by, or connected to any government authority.',
    nav: {
      home: 'Home',
      features: 'Features',
      howItWorks: 'How It Works',
      pricing: 'Pricing',
      security: 'Security',
      forNris: 'For NRIs',
      forPartners: 'For Partners',
      faq: 'FAQ',
      contact: 'Contact',
      privacy: 'Privacy Policy',
      terms: 'Terms',
    },
    stepsTitle: 'Protect your household records in 3 calm steps',
    steps: [
      {
        num: '01.',
        title: 'Snap or upload in 3 taps',
        desc: 'Capture Land Tax receipts, Passports, Iqama/Emirates ID, Motor Insurance, or Gold Loan tickets. Auto-compressed right on your phone for slow mobile networks.',
      },
      {
        num: '02.',
        title: 'Get alerts before anything expires',
        desc: 'Automated reminders at 60, 30, 7, and 1 days before expiry—and weekly after—sent to resident parents and NRI children via Email and SMS.',
      },
      {
        num: '03.',
        title: 'Find in 10 seconds & track household essentials',
        desc: 'Aadhaar numbers are auto-masked (XXXX-XXXX-4821). Plus keep your local Electrician/Plumber contacts, KSFE Kuri dates, and helper salary ledger in one place.',
      },
    ],
    categoriesTitle: '9 Household Categories & 18+ Pre-Seeded Kerala & Gulf Document Types',
    keralaExtrasTitle: '4 Dedicated Kerala & NRI Household Modules Included in V1',
    keralaExtras: [
      {
        title: 'NRI “Request a Document” Flow',
        desc: 'From Dubai, Riyadh, or Doha, send a 1-tap WhatsApp/SMS upload request to parents in Kerala when you urgently need a Land Tax receipt or certificate.',
      },
      {
        title: 'Kuri & Chit Fund Tracker (KSFE / Samithi)',
        desc: 'Track monthly Kuri installments, auction dates, prize status, and paid months with automatic due-date alerts.',
      },
      {
        title: 'House Construction & Permit Tracker',
        desc: 'Keep Panchayat/Municipality building permit expiry dates, stage-wise contractor bills, and warranty receipts organized.',
      },
      {
        title: 'Domestic Helper Salary & Leave Ledger',
        desc: 'Log monthly salary payments, festival advances, and leave days for home nurses, maids, and drivers with clear timestamps.',
      },
    ],
    trustStrip: [
      { title: 'Aadhaar 8-Digit Auto-Masking', desc: 'Never stores Aadhaar in plain text; displays XXXX-XXXX-4821 by default with audit-logged reveal.' },
      { title: 'AES-256-GCM Envelope Encryption', desc: 'Sensitive numbers are encrypted at the application layer and files stay in private signed buckets.' },
      { title: 'DPDP Act 2023 Compliant', desc: 'Full 1-click data export, granular consent ledger, 30-day soft delete recovery, and account erasure.' },
    ],
  },
};
