import { VaultDocumentItem } from '../types/vault';

/**
 * Escapes special XML/SVG characters in text strings.
 */
function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an official, high-resolution SVG document card for any Kudumba Vault document.
 * Provides authentic government/commercial card layouts with emblems, bilingual typography,
 * barcode/QR simulation, and digital security seals.
 */
export function getDefaultDocScanSvg(doc: VaultDocumentItem): string {
  const code = (doc.docTypeCode || '').toUpperCase();
  const category = (doc.categoryId || doc.category || '').toUpperCase();
  const title = (doc.titleEn || 'Official Document').toUpperCase();
  const owner = doc.ownerEn || 'Authorized Holder';
  const ownerMl = doc.ownerMl || '';
  const num = doc.docNumber || 'DOC-VERIFIED-001';
  const expiry = doc.expiryDate || 'PERMANENT';
  const authority = doc.authorityEn || 'Official Issuing Authority';

  // 1. AADHAAR CARD
  if (code === 'AADHAAR' || title.includes('AADHAAR')) {
    const formattedNum = num.replace(/\s+/g, '').replace(/(.{4})/g, '$1  ').trim();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630">
      <defs>
        <linearGradient id="aadhaarBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="#FDF8F0"/>
        </linearGradient>
        <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.15"/>
        </filter>
      </defs>
      
      <!-- Card Container -->
      <rect x="15" y="15" width="970" height="600" rx="24" fill="url(#aadhaarBg)" stroke="#E5E7EB" stroke-width="3" filter="url(#cardShadow)"/>
      
      <!-- Top Saffron Bar -->
      <path d="M 15 39 Q 15 15 39 15 L 961 15 Q 985 15 985 39 L 985 45 L 15 45 Z" fill="#FF9933"/>
      <!-- Bottom Green Bar -->
      <path d="M 15 585 L 985 585 L 985 591 Q 985 615 961 615 L 39 615 Q 15 615 15 591 Z" fill="#138808"/>
      
      <!-- Authority Header -->
      <text x="500" y="82" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="bold" text-anchor="middle" fill="#B91C1C" letter-spacing="1.5">UNIQUE IDENTIFICATION AUTHORITY OF INDIA</text>
      <text x="500" y="108" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="15" text-anchor="middle" fill="#4B5563">Government of India / ഭാരത സർക്കാർ</text>
      <line x1="60" y1="124" x2="940" y2="124" stroke="#E5E7EB" stroke-width="1.5"/>

      <!-- Photo Box -->
      <rect x="70" y="145" width="180" height="225" rx="14" fill="#F3F4F6" stroke="#CBD5E1" stroke-width="2"/>
      <circle cx="160" cy="225" r="45" fill="#E2E8F0"/>
      <path d="M 120 340 A 45 45 0 0 1 200 340 Z" fill="#CBD5E1"/>
      <circle cx="160" cy="220" r="28" fill="#94A3B8"/>
      <rect x="75" y="340" width="170" height="24" rx="6" fill="#E2E8F0"/>
      <text x="160" y="356" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle" fill="#64748B">VERIFIED PHOTO</text>

      <!-- Details -->
      <text x="290" y="185" font-family="sans-serif" font-size="24" font-weight="bold" fill="#0F172A">${escapeXml(owner)}</text>
      <text x="290" y="218" font-family="'Manjari', 'Gayathri', sans-serif" font-size="18" font-weight="600" fill="#334155">${escapeXml(ownerMl)}</text>
      <text x="290" y="260" font-family="sans-serif" font-size="15" fill="#475569">DOB / ജനന തീയതി: <tspan font-weight="600" fill="#1E293B">14/08/1992</tspan></text>
      <text x="290" y="292" font-family="sans-serif" font-size="15" fill="#475569">Gender / ലിംഗം: <tspan font-weight="600" fill="#1E293B">Female / സ്ത്രീ</tspan></text>
      <text x="290" y="324" font-family="sans-serif" font-size="14" fill="#64748B">Address: Kudumba House, Edappally, Kochi, Kerala - 682024</text>
      
      <!-- QR Code Matrix Simulation -->
      <g transform="translate(800, 150)">
        <rect width="130" height="130" rx="8" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.5"/>
        <rect x="15" y="15" width="30" height="30" fill="#1E293B"/>
        <rect x="85" y="15" width="30" height="30" fill="#1E293B"/>
        <rect x="15" y="85" width="30" height="30" fill="#1E293B"/>
        <rect x="22" y="22" width="16" height="16" fill="#FFFFFF"/>
        <rect x="92" y="22" width="16" height="16" fill="#FFFFFF"/>
        <rect x="22" y="92" width="16" height="16" fill="#FFFFFF"/>
        <rect x="55" y="25" width="15" height="15" fill="#1E293B"/>
        <rect x="55" y="55" width="20" height="20" fill="#1E293B"/>
        <rect x="85" y="75" width="25" height="15" fill="#1E293B"/>
        <rect x="55" y="90" width="15" height="20" fill="#1E293B"/>
        <text x="65" y="148" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle" fill="#64748B">SECURE QR</text>
      </g>

      <!-- Center Divider -->
      <line x1="70" y1="395" x2="930" y2="395" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="8 4"/>

      <!-- Aadhaar Number -->
      <rect x="200" y="420" width="600" height="70" rx="16" fill="#FEF2F2" stroke="#FCA5A5" stroke-width="1.5"/>
      <text x="500" y="468" font-family="'Courier New', Courier, monospace" font-size="36" font-weight="bold" text-anchor="middle" fill="#B91C1C" letter-spacing="4">${escapeXml(formattedNum)}</text>

      <!-- Bottom Taglines -->
      <text x="500" y="525" font-family="sans-serif" font-size="16" font-weight="600" text-anchor="middle" fill="#334155">മേൽവിലാസവും തിരിച്ചറിയലും തെളിയിക്കുന്നതിനുള്ള രേഖ</text>
      <text x="500" y="555" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle" fill="#1E293B">ആധാർ - സാധാരണക്കാരന്റെ അധികാരം</text>
    </svg>`;
  }

  // 2. UAE RESIDENT ID / IQAMA
  if (code === 'IQAMA' || code === 'EMIRATES_ID' || title.includes('EMIRATES') || title.includes('IQAMA')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630">
      <defs>
        <linearGradient id="uaeBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F8FAFC"/>
          <stop offset="100%" stop-color="#EEF2F6"/>
        </linearGradient>
      </defs>
      <rect x="15" y="15" width="970" height="600" rx="24" fill="url(#uaeBg)" stroke="#CBD5E1" stroke-width="3"/>
      <!-- Top UAE Flag Strip -->
      <rect x="15" y="15" width="30" height="600" fill="#EF4444"/>
      <rect x="45" y="15" width="940" height="25" fill="#10B981"/>
      <rect x="45" y="40" width="940" height="25" fill="#FFFFFF"/>
      <rect x="45" y="65" width="940" height="25" fill="#000000"/>

      <text x="520" y="130" font-family="sans-serif" font-size="22" font-weight="bold" text-anchor="middle" fill="#0F172A" letter-spacing="1.5">UNITED ARAB EMIRATES RESIDENT IDENTITY CARD</text>
      <text x="520" y="156" font-family="sans-serif" font-size="15" text-anchor="middle" fill="#64748B">الهيئة الاتحادية للهوية والجنسية والجمارك وأمن المنافذ</text>
      <line x1="75" y1="175" x2="955" y2="175" stroke="#E2E8F0" stroke-width="2"/>

      <!-- Smart Card Chip -->
      <g transform="translate(100, 205)">
        <rect width="110" height="85" rx="10" fill="#FCD34D" stroke="#D97706" stroke-width="2"/>
        <line x1="55" y1="0" x2="55" y2="85" stroke="#B45309" stroke-width="1.5"/>
        <line x1="0" y1="42" x2="110" y2="42" stroke="#B45309" stroke-width="1.5"/>
        <rect x="35" y="25" width="40" height="35" rx="6" fill="#FDE68A" stroke="#B45309" stroke-width="1.5"/>
      </g>

      <!-- Details -->
      <text x="250" y="235" font-family="sans-serif" font-size="14" fill="#64748B">Card Holder / الاسم:</text>
      <text x="250" y="265" font-family="sans-serif" font-size="24" font-weight="bold" fill="#0F172A">${escapeXml(owner)}</text>

      <text x="250" y="320" font-family="sans-serif" font-size="14" fill="#64748B">ID Number / رقم الهوية:</text>
      <text x="250" y="355" font-family="'Courier New', Courier, monospace" font-size="30" font-weight="bold" fill="#0284C7" letter-spacing="2">${escapeXml(num)}</text>

      <text x="250" y="405" font-family="sans-serif" font-size="14" fill="#64748B">Issuing Authority: <tspan font-weight="600" fill="#1E293B">${escapeXml(authority)}</tspan></text>
      <text x="250" y="435" font-family="sans-serif" font-size="14" fill="#64748B">Expiry Date / تاريخ الانتهاء: <tspan font-weight="bold" fill="#DC2626">${escapeXml(expiry)}</tspan></text>

      <!-- Holder Photo Box -->
      <rect x="760" y="200" width="180" height="225" rx="14" fill="#E2E8F0" stroke="#94A3B8" stroke-width="2"/>
      <circle cx="850" cy="285" r="45" fill="#CBD5E1"/>
      <circle cx="850" cy="275" r="28" fill="#64748B"/>
      <text x="850" y="405" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="#475569">RESIDENT PHOTO</text>

      <!-- Bottom Barcode Strip -->
      <rect x="75" y="480" width="870" height="90" rx="14" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
      <text x="510" y="525" font-family="'Courier New', Courier, monospace" font-size="18" text-anchor="middle" fill="#1E293B">IDARE78419884920184&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
      <text x="510" y="555" font-family="'Courier New', Courier, monospace" font-size="18" text-anchor="middle" fill="#1E293B">8805194M2505195ARE&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;4</text>
    </svg>`;
  }

  // 3. VEHICLE INSURANCE & RC
  if (category === 'VEHICLE' || code === 'RC' || title.includes('CAR') || title.includes('INSURANCE')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630">
      <defs>
        <linearGradient id="vehBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="#F0FDF4"/>
        </linearGradient>
      </defs>
      <rect x="15" y="15" width="970" height="600" rx="20" fill="url(#vehBg)" stroke="#86EFAC" stroke-width="3"/>
      
      <!-- Header Banner -->
      <rect x="15" y="15" width="970" height="85" rx="20" fill="#15803D"/>
      <text x="500" y="55" font-family="sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="#FFFFFF" letter-spacing="1">CERTIFICATE OF MOTOR INSURANCE &amp; PUC</text>
      <text x="500" y="82" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#DCFCE7">Comprehensive Family Vehicle Policy • Motor Vehicles Act, 1988</text>

      <!-- Vehicle Highlight Box -->
      <rect x="60" y="130" width="880" height="95" rx="14" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2"/>
      <text x="90" y="165" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748B">VEHICLE REGISTRATION NUMBER</text>
      <text x="90" y="205" font-family="'Courier New', Courier, monospace" font-size="34" font-weight="bold" fill="#0F172A" letter-spacing="3">KL-07-CX-4412</text>
      
      <text x="550" y="165" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748B">POLICY / PUC NUMBER</text>
      <text x="550" y="202" font-family="'Courier New', Courier, monospace" font-size="22" font-weight="bold" fill="#15803D">${escapeXml(num)}</text>

      <!-- Detailed Info Grid -->
      <g transform="translate(60, 260)">
        <text x="0" y="0" font-family="sans-serif" font-size="14" fill="#64748B">Registered Owner / Holder:</text>
        <text x="0" y="28" font-family="sans-serif" font-size="22" font-weight="bold" fill="#0F172A">${escapeXml(owner)}</text>
        <text x="0" y="56" font-family="sans-serif" font-size="15" fill="#475569">${escapeXml(ownerMl)}</text>

        <text x="0" y="110" font-family="sans-serif" font-size="14" fill="#64748B">Issuing Insurer / Authority:</text>
        <text x="0" y="135" font-family="sans-serif" font-size="18" font-weight="600" fill="#15803D">${escapeXml(authority)}</text>

        <text x="490" y="0" font-family="sans-serif" font-size="14" fill="#64748B">Expiry / Renewal Due Date:</text>
        <text x="490" y="32" font-family="sans-serif" font-size="24" font-weight="bold" fill="#DC2626">${escapeXml(expiry)}</text>

        <text x="490" y="110" font-family="sans-serif" font-size="14" fill="#64748B">Coverage Type:</text>
        <text x="490" y="135" font-family="sans-serif" font-size="18" font-weight="600" fill="#0F172A">Bumper-to-Bumper Comprehensive + Roadside Assist</text>
      </g>

      <!-- Digital Stamp -->
      <g transform="translate(740, 430)">
        <circle cx="90" cy="70" r="60" fill="none" stroke="#15803D" stroke-width="3" stroke-dasharray="6 3"/>
        <text x="90" y="60" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle" fill="#15803D">VERIFIED</text>
        <text x="90" y="78" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#15803D">KUDUMBA VAULT</text>
        <text x="90" y="94" font-family="sans-serif" font-size="9" text-anchor="middle" fill="#15803D">OFFLINE SECURE</text>
      </g>

      <line x1="60" y1="570" x2="940" y2="570" stroke="#CBD5E1" stroke-width="1.5"/>
      <text x="60" y="592" font-family="sans-serif" font-size="11" fill="#64748B">Original Household Vault Digital Record • Valid across all check-posts and transport authorities</text>
    </svg>`;
  }

  // 4. KERALA LAND TAX RECEIPT / PROPERTY
  if (category === 'PROPERTY' || code === 'LAND_TAX' || title.includes('LAND') || title.includes('TAX')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630">
      <defs>
        <linearGradient id="propBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="#FEFCE8"/>
        </linearGradient>
      </defs>
      <rect x="15" y="15" width="970" height="600" rx="20" fill="url(#propBg)" stroke="#CA8A04" stroke-width="3"/>
      
      <!-- Top Kerala Government Emblem Banner -->
      <rect x="15" y="15" width="970" height="90" rx="20" fill="#854D0E"/>
      <text x="500" y="55" font-family="sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="#FFFFFF">ഭൂനികുതി ഒടുക്കൽ രസീത് (ReLIS) - റവന്യൂ വകുപ്പ്</text>
      <text x="500" y="82" font-family="sans-serif" font-size="15" text-anchor="middle" fill="#FEF08A">Government of Kerala Revenue Department • Land Tax e-Receipt</text>

      <!-- Receipt Number Strip -->
      <rect x="60" y="130" width="880" height="65" rx="10" fill="#FEF9C3" stroke="#FACC15" stroke-width="1.5"/>
      <text x="80" y="170" font-family="sans-serif" font-size="16" fill="#854D0E">ഇ-രസീത് നമ്പർ / Receipt No: <tspan font-family="'Courier New', Courier, monospace" font-size="22" font-weight="bold" fill="#0F172A">${escapeXml(num)}</tspan></text>
      <text x="700" y="170" font-family="sans-serif" font-size="16" fill="#854D0E">തീയതി: <tspan font-weight="bold" fill="#0F172A">2025-04-02</tspan></text>

      <!-- Land & Holder Details -->
      <g transform="translate(60, 230)">
        <text x="0" y="0" font-family="sans-serif" font-size="14" fill="#713F12">ഭൂവുടമസ്ഥന്റെ പേര് / Title Holder:</text>
        <text x="0" y="30" font-family="sans-serif" font-size="24" font-weight="bold" fill="#0F172A">${escapeXml(owner)}</text>
        <text x="0" y="60" font-family="'Manjari', 'Gayathri', sans-serif" font-size="18" font-weight="600" fill="#854D0E">${escapeXml(ownerMl)}</text>

        <text x="0" y="115" font-family="sans-serif" font-size="14" fill="#713F12">താലൂക്ക് &amp; വില്ലേജ് / Jurisdiction:</text>
        <text x="0" y="142" font-family="sans-serif" font-size="18" font-weight="bold" fill="#0F172A">കണയന്നൂർ താലൂക്ക്, ഇടപ്പള്ളി സൗത്ത് വില്ലേജ് (Kanayannur / Edappally)</text>

        <text x="0" y="195" font-family="sans-serif" font-size="14" fill="#713F12">തണ്ടപ്പേര് &amp; സർവ്വേ നമ്പർ / Survey No:</text>
        <text x="0" y="222" font-family="sans-serif" font-size="18" font-weight="bold" fill="#0F172A">തണ്ടപ്പേര്: 14892   |   റീ-സർവ്വേ ബ്ലോക്ക്: 12   |   സർവ്വേ: 418/2-A</text>

        <text x="600" y="0" font-family="sans-serif" font-size="14" fill="#713F12">സാധുത കാലയളവ് / Validity:</text>
        <text x="600" y="32" font-family="sans-serif" font-size="22" font-weight="bold" fill="#15803D">FY 2025 – 2026 (${escapeXml(expiry)})</text>

        <text x="600" y="115" font-family="sans-serif" font-size="14" fill="#713F12">അധികാരി / Authority:</text>
        <text x="600" y="142" font-family="sans-serif" font-size="17" font-weight="600" fill="#0F172A">${escapeXml(authority)}</text>
      </g>

      <line x1="60" y1="565" x2="940" y2="565" stroke="#E2E8F0" stroke-width="1.5"/>
      <text x="500" y="590" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#713F12">ഈ രസീത് ഡിജിറ്റലായി സാക്ഷ്യപ്പെടുത്തിയതും റവന്യൂ രേഖകൾക്ക് സാധുവായതുമാണ്.</text>
    </svg>`;
  }

  // 5. HEALTH INSURANCE / STAR HEALTH
  if (category === 'MEDICAL' || code === 'HEALTH' || title.includes('HEALTH') || title.includes('STAR')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630">
      <defs>
        <linearGradient id="medBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="#EFF6FF"/>
        </linearGradient>
      </defs>
      <rect x="15" y="15" width="970" height="600" rx="20" fill="url(#medBg)" stroke="#93C5FD" stroke-width="3"/>
      
      <!-- Blue Header -->
      <rect x="15" y="15" width="970" height="85" rx="20" fill="#1D4ED8"/>
      <text x="500" y="55" font-family="sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="#FFFFFF">FAMILY FLOATER HEALTH INSURANCE (CASHLESS TPA CARD)</text>
      <text x="500" y="80" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#DBEAFE">Allied Health Care Services • 24x7 Emergency Hospital Network</text>

      <g transform="translate(60, 140)">
        <rect width="880" height="80" rx="12" fill="#DBEAFE" stroke="#60A5FA" stroke-width="1.5"/>
        <text x="30" y="32" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1E40AF">TPA HEALTH ID / POLICY NUMBER</text>
        <text x="30" y="65" font-family="'Courier New', Courier, monospace" font-size="28" font-weight="bold" fill="#1E3A8A">${escapeXml(num)}</text>
        
        <text x="560" y="32" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1E40AF">SUM INSURED</text>
        <text x="560" y="65" font-family="sans-serif" font-size="26" font-weight="bold" fill="#15803D">₹10,00,000 (10 Lakhs)</text>
      </g>

      <g transform="translate(60, 260)">
        <text x="0" y="0" font-family="sans-serif" font-size="14" fill="#64748B">Primary Policy Holder:</text>
        <text x="0" y="30" font-family="sans-serif" font-size="24" font-weight="bold" fill="#0F172A">${escapeXml(owner)}</text>
        <text x="0" y="60" font-family="sans-serif" font-size="16" fill="#1E40AF">${escapeXml(ownerMl)}</text>

        <text x="0" y="115" font-family="sans-serif" font-size="14" fill="#64748B">Issuing TPA / Authority:</text>
        <text x="0" y="142" font-family="sans-serif" font-size="18" font-weight="600" fill="#1E3A8A">${escapeXml(authority)}</text>

        <text x="560" y="0" font-family="sans-serif" font-size="14" fill="#64748B">Valid Upto:</text>
        <text x="560" y="32" font-family="sans-serif" font-size="24" font-weight="bold" fill="#DC2626">${escapeXml(expiry)}</text>

        <text x="560" y="115" font-family="sans-serif" font-size="14" fill="#64748B">Network Benefits:</text>
        <text x="560" y="142" font-family="sans-serif" font-size="17" font-weight="600" fill="#15803D">10,000+ Cashless Hospitals in India</text>
      </g>

      <!-- Bottom Barcode -->
      <rect x="60" y="470" width="880" height="90" rx="12" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
      <text x="500" y="525" font-family="'Courier New', Courier, monospace" font-size="20" font-weight="bold" text-anchor="middle" fill="#0F172A">||| |||| || ||||| |||||| |||| |||||| ||||| ||||||| ||||</text>
      <text x="500" y="548" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#64748B">Present this card along with Photo ID at hospital emergency / insurance desk</text>
    </svg>`;
  }

  // 6. GENERAL OFFICIAL CERTIFICATE (FALLBACK FOR ANY OTHER DOCUMENT)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630">
    <defs>
      <linearGradient id="genBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="#F8FAFC"/>
      </linearGradient>
    </defs>
    <rect x="15" y="15" width="970" height="600" rx="20" fill="url(#genBg)" stroke="#CBD5E1" stroke-width="3"/>
    
    <!-- Top Header -->
    <rect x="15" y="15" width="970" height="85" rx="20" fill="#1E293B"/>
    <text x="500" y="52" font-family="sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="#FFFFFF">${escapeXml(title)}</text>
    <text x="500" y="78" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#94A3B8">Kudumba Vault Verified Household Document Record</text>

    <g transform="translate(60, 140)">
      <rect width="880" height="75" rx="12" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1.5"/>
      <text x="30" y="30" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748B">DOCUMENT / REGISTRATION NUMBER</text>
      <text x="30" y="60" font-family="'Courier New', Courier, monospace" font-size="24" font-weight="bold" fill="#0F172A">${escapeXml(num)}</text>
      
      <text x="550" y="30" font-family="sans-serif" font-size="13" font-weight="bold" fill="#64748B">STATUS</text>
      <text x="550" y="60" font-family="sans-serif" font-size="20" font-weight="bold" fill="#15803D">${escapeXml(doc.status || 'VALID')}</text>
    </g>

    <g transform="translate(60, 255)">
      <text x="0" y="0" font-family="sans-serif" font-size="14" fill="#64748B">Document Holder / Owner:</text>
      <text x="0" y="30" font-family="sans-serif" font-size="24" font-weight="bold" fill="#0F172A">${escapeXml(owner)}</text>
      <text x="0" y="58" font-family="sans-serif" font-size="16" fill="#334155">${escapeXml(ownerMl)}</text>

      <text x="0" y="115" font-family="sans-serif" font-size="14" fill="#64748B">Issuing Authority:</text>
      <text x="0" y="142" font-family="sans-serif" font-size="18" font-weight="600" fill="#0F172A">${escapeXml(authority)}</text>

      <text x="550" y="0" font-family="sans-serif" font-size="14" fill="#64748B">Expiry / Validity Date:</text>
      <text x="550" y="32" font-family="sans-serif" font-size="22" font-weight="bold" fill="#0F172A">${escapeXml(expiry)}</text>
    </g>

    <line x1="60" y1="460" x2="940" y2="460" stroke="#E2E8F0" stroke-width="1.5"/>
    <text x="500" y="520" font-family="'Courier New', Courier, monospace" font-size="20" font-weight="bold" text-anchor="middle" fill="#64748B">|||| | |||||| ||| ||||||| ||||| |||| ||||||</text>
    <text x="500" y="560" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#64748B">Digital Household Vault Archive • End-to-end Local Storage</text>
  </svg>`;
}

/**
 * Returns a ready-to-use Data URL for the document scan.
 */
export function getDefaultDocScanDataUrl(doc: VaultDocumentItem): string {
  const svg = getDefaultDocScanSvg(doc);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * Returns the effective image data URL for a document.
 * If the user has uploaded an image (doc.fileDataUrl or doc.attachmentDataUrl), returns it.
 * Otherwise, returns the official generated document card scan.
 */
export function getEffectiveDocImageDataUrl(doc: VaultDocumentItem): string {
  return doc.fileDataUrl || doc.attachmentDataUrl || getDefaultDocScanDataUrl(doc);
}
