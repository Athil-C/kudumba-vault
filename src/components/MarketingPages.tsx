import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Globe,
  Building2,
  HelpCircle,
  Mail,
  Lock,
  FileText,
  ExternalLink,
  Check,
} from 'lucide-react';
import { Language, PageId, SEEDED_DOCUMENT_TYPES } from '../i18n/translations';
import { API_BASE } from '../services/apiClient';

interface SecondaryPageProps {
  page: PageId;
  lang: Language;
  onNavigate: (page: PageId) => void;
  onOpenWaitlist: () => void;
}

export const SecondaryMarketingPages: React.FC<SecondaryPageProps> = ({
  page,
  lang,
  onNavigate,
  onOpenWaitlist,
}) => {
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      contactName.trim().length < 2 ||
      contactPhone.trim().length < 6 ||
      contactMessage.trim().length < 5
    ) {
      setContactError(
        lang === 'ml'
          ? 'ദയവായി പേര്, ഫോൺ/ഇമെയിൽ, സന്ദേശം എന്നിവ പൂർണ്ണമായി നൽകുക.'
          : 'Please complete your name, phone/email, and message before sending.'
      );
      return;
    }
    setContactError('');
    try {
      await fetch(`${API_BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          phoneOrEmail: contactPhone,
          message: contactMessage,
          lang,
        }),
      });
      setContactSent(true);
    } catch {
      setContactSent(true);
    }
  };

  if (page === 'features') {
    const categories = [
      'ALL',
      ...Array.from(new Set(SEEDED_DOCUMENT_TYPES.map((d) => d.category))),
    ];
    const filteredSeeded =
      categoryFilter === 'ALL'
        ? SEEDED_DOCUMENT_TYPES
        : SEEDED_DOCUMENT_TYPES.filter((d) => d.category === categoryFilter);

    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 space-y-12">
        <div className="max-w-3xl">
          <p className="text-sm font-bold text-[#EA4C46]">
            {lang === 'ml' ? 'സമ്പൂർണ്ണ സവിശേഷതകൾ' : 'Complete Household Capabilities'}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
            {lang === 'ml'
              ? 'കേരളത്തിലെ ഒരു കുടുംബത്തിന് വേണ്ട എല്ലാ രേഖകളും ഓർമ്മപ്പെടുത്തലുകളും ഒരിടത്ത്'
              : 'Every document, renewal reminder, and local worker contact in one calm vault'}
          </h1>
          <p className="mt-4 text-base text-[#64748B]">
            {lang === 'ml'
              ? '9 വിഭാഗങ്ങളിലായി 18-ലധികം കേരള-ഗൾഫ് രേഖകൾ മുൻകൂട്ടി സജ്ജീകരിച്ചിരിക്കുന്നു. കൂടാതെ കുറി ട്രാക്കർ, വീട് നിർമ്മാണ കണക്ക്, വീട്ടുജോലിക്കാരുടെ ശമ്പള പട്ടിക എന്നിവയും.'
              : 'Pre-seeded with 9 household categories, 18+ Kerala and GCC document types with official renewal links, plus Kuri, Construction, and Helper Salary ledgers.'}
          </p>
        </div>

        {/* Filterable 18 Seeded Document Types Directory */}
        <section className="rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#0F172A]">
                {lang === 'ml'
                  ? 'മുൻകൂട്ടി ചേർത്ത 18+ പ്രധാന രേഖകളും ഔദ്യോഗിക പോർട്ടൽ ലിങ്കുകളും'
                  : '18 Seeded Kerala & Gulf Document Types with Official Renewal Portals'}
              </h2>
              <p className="mt-1 text-sm text-[#64748B]">
                {lang === 'ml'
                  ? 'കോഡ് മാറ്റാതെ തന്നെ പുതിയ സംസ്ഥാനങ്ങളും രേഖകളും ചേർക്കാവുന്ന ഡാറ്റാ അധിഷ്ഠിത ഘടന.'
                  : 'Data-driven catalog: filter by household category to inspect default reminder schedules.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`min-h-[42px] rounded-full px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-[#EA4C46] text-white'
                      : 'bg-white border border-[#E5E7EB] text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSeeded.map((doc) => (
              <div
                key={doc.code}
                className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-4"
              >
                <div>
                  <p className="text-xs font-medium text-[#64748B]">
                    <span>{doc.category}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono-tabular">{doc.region}</span>
                  </p>
                  <h3 className="mt-1 text-base font-bold text-[#0F172A]">
                    {lang === 'ml' ? doc.nameMl : doc.nameEn}
                  </h3>
                  <p className="mt-2 text-xs text-[#64748B] font-mono-tabular">
                    {lang === 'ml' ? 'മുന്നറിയിപ്പ് ദിനങ്ങൾ: ' : 'Alerts before expiry: '}
                    {doc.defaultRemindDays.map((d) => `${d}d`).join(', ')}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-[#E5E7EB] flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#EA4C46]">{doc.portalName}</span>
                  {doc.portalUrl !== '#' && (
                    <a
                      href={doc.portalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#0F172A] hover:text-[#EA4C46]"
                    >
                      <span>{lang === 'ml' ? 'പോർട്ടൽ' : 'Portal'}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (page === 'how-it-works') {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 space-y-10">
        <div>
          <p className="text-sm font-bold text-[#EA4C46]">
            {lang === 'ml' ? 'പ്രവർത്തനരീതി' : 'How Kudumba Vault Works'}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-[#0F172A] sm:text-4xl">
            {lang === 'ml'
              ? 'മുതിർന്നവർക്കും പ്രവാസികൾക്കും ഒരുപോലെ എളുപ്പമുള്ള ഡിസൈൻ'
              : 'Designed for effortless use by parents in Kerala and children abroad'}
          </h1>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              step: '01.',
              titleEn: 'Create Household & Add Family Profiles',
              titleMl: 'കുടുംബ അക്കൗണ്ട് തുടങ്ങി അംഗങ്ങളെ ചേർക്കുക',
              descEn:
                'Sign in with your phone OTP. Create profiles for Father, Mother, Spouse, and NRI members. Assign Owner, Editor, or Viewer roles.',
              descMl:
                'ഫോൺ OTP വഴി ലോഗിൻ ചെയ്യുക. അച്ഛൻ, അമ്മ, ജീവിതപങ്കാളി, പ്രവാസി മക്കൾ എന്നിവർക്കായി പ്രൊഫൈലുകൾ നിർമ്മിക്കാം.',
            },
            {
              step: '02.',
              titleEn: '3-Tap Upload or NRI Remote Request',
              titleMl: '3 ടാപ്പിൽ രേഖകൾ ചേർക്കാം അല്ലെങ്കിൽ പ്രവാസികൾക്ക് അഭ്യർത്ഥിക്കാം',
              descEn:
                'Snap a photo of a Land Tax receipt or Insurance policy, pick the document type, and choose the expiry date. Compressed automatically on the phone.',
              descMl:
                'ഫോട്ടോ എടുക്കുക, രേഖയുടെ തരം തിരഞ്ഞെടുക്കുക, കാലാവധി നൽകുക. കുറഞ്ഞ ഇന്റർനെറ്റ് വേഗതയിലും വേഗത്തിൽ അപ്‌ലോഡ് ആകും.',
            },
            {
              step: '03.',
              titleEn: '60 / 30 / 7 / 1 Day Multi-Channel Alerts',
              titleMl: '60 / 30 / 7 / 1 ദിവസങ്ങളിൽ കൃത്യമായ ഓർമ്മപ്പെടുത്തൽ',
              descEn:
                'Our scheduled reminder engine checks expiring records daily and notifies your household via Email and SMS before any penalty applies.',
              descMl:
                'കാലാവധി കഴിയുന്നതിന് മുമ്പും കഴിഞ്ഞാൽ ആഴ്ചതോറും ഇമെയിൽ, SMS വഴി മുന്നറിയിപ്പ് ലഭിക്കുന്നു. പുതുക്കിയാൽ ചരിത്രം സൂക്ഷിക്കാം.',
            },
          ].map((item) => (
            <div key={item.step} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6">
              <span className="font-mono-tabular text-sm font-bold text-[#EA4C46]">{item.step}</span>
              <h2 className="mt-2 text-lg font-bold text-[#0F172A]">
                {lang === 'ml' ? item.titleMl : item.titleEn}
              </h2>
              <p className="mt-2 text-sm text-[#64748B]">
                {lang === 'ml' ? item.descMl : item.descEn}
              </p>
            </div>
          ))}
        </div>

        {/* Status Indicator Standard Showcase */}
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8">
          <h2 className="text-xl font-bold text-[#0F172A]">
            {lang === 'ml'
              ? 'നിറം + ഐക്കൺ + വ്യക്തമായ എഴുത്ത് (വെയിലത്തും വ്യക്തമായി കാണാം)'
              : 'Accessible Status System: Color + Icon + Text (Never Color Alone)'}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-[#DC2626]">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>
                  {lang === 'ml' ? 'അടിയന്തരം (7 ദിവസത്തിനുള്ളിൽ)' : 'Critical (≤ 7 Days or Expired)'}
                </span>
              </div>
              <p className="mt-1 text-xs">
                {lang === 'ml'
                  ? 'ഉടൻ പുതുക്കേണ്ട വാഹന ഇൻഷുറൻസ്, പാസ്‌പോർട്ട്, ഇഖാമ.'
                  : 'Triggers 7-day, 1-day, and weekly overdue reminders until marked as renewed.'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4 text-[#EFC94C]">
              <div className="flex items-center gap-2 font-bold">
                <Clock className="h-5 w-5 shrink-0" />
                <span>
                  {lang === 'ml' ? 'ശ്രദ്ധിക്കുക (8–60 ദിവസത്തിനുള്ളിൽ)' : 'Upcoming (8–60 Days Left)'}
                </span>
              </div>
              <p className="mt-1 text-xs">
                {lang === 'ml'
                  ? '60, 30 ദിവസങ്ങൾക്ക് മുമ്പുള്ള മുൻകൂർ അറിയിപ്പ്.'
                  : 'Early heads-up for Passport, Visa, Land Tax, and Gold Loan renewals.'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#BBF7D0] bg-[#DCFCE7] p-4 text-[#16A34A]">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>
                  {lang === 'ml' ? 'സുരക്ഷിതം (60+ ദിവസം ബാക്കി)' : 'Healthy (> 60 Days or Permanent)'}
                </span>
              </div>
              <p className="mt-1 text-xs">
                {lang === 'ml'
                  ? 'പുതുക്കിയ രേഖകളും സ്ഥിരം തിരിച്ചറിയൽ കാർഡുകളും.'
                  : 'Active policies and permanent identity documents safely archived.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (page === 'pricing') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 space-y-10">
        <div className="max-w-3xl">
          <p className="text-sm font-bold text-[#EA4C46]">
            {lang === 'ml' ? 'ലളിതമായ നിരക്കുകൾ' : 'Transparent Household Plans'}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-[#0F172A] sm:text-4xl">
            {lang === 'ml'
              ? 'ആദ്യകാല കുടുംബങ്ങൾക്ക് V1 പൂർണ്ണമായും സൗജന്യം'
              : 'Free for Founding Households in V1 — Built for Every Kerala Family'}
          </h1>
          <p className="mt-3 text-base text-[#64748B]">
            {lang === 'ml'
              ? 'ഇപ്പോൾ ചേരുന്ന കുടുംബങ്ങൾക്ക് ഡോക്യുമെന്റ് വോൾട്ട്, ജോലിക്കാരുടെ ഡയറക്ടറി, കുറി ട്രാക്കർ എന്നിവ സൗജന്യമായി ഉപയോഗിക്കാം.'
              : 'Our V1 Founding Household release includes full access to the Vault, Expiry Reminders, Workers Book, and Kerala Ledger modules with zero credit card required.'}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {[
            {
              nameEn: 'Founding Household (V1 Active)',
              nameMl: 'ഫൗണ്ടിംഗ് ഫാമിലി പ്ലാൻ (V1 സൗജന്യം)',
              price: '₹0',
              cadenceEn: 'Free during V1 launch',
              cadenceMl: 'V1 ലോഞ്ച് ഓഫർ — സൗജന്യം',
              highlight: true,
              featuresEn: [
                'Up to 5 household family members',
                '18+ Kerala & Gulf document types',
                'Email & SMS expiry alerts (60, 30, 7, 1 days)',
                'Workers Book + Kuri, Construction & Helper ledgers',
                'Automatic Aadhaar 8-digit masking',
              ],
              featuresMl: [
                '5 കുടുംബാംഗങ്ങൾ വരെ ചേർക്കാം',
                '18+ കേരള-ഗൾഫ് രേഖാ വിഭാഗങ്ങൾ',
                '60, 30, 7, 1 ദിവസങ്ങളിൽ ഇമെയിൽ/SMS മുന്നറിയിപ്പ്',
                'ജോലിക്കാരുടെ ബുക്ക് + കുറി, വീട്ടുജോലി കണക്കുകൾ',
                'ആധാർ 8-അക്ക ഓട്ടോ-മാസ്കിംഗ് സുരക്ഷ',
              ],
            },
            {
              nameEn: 'NRI Family Plus (Upcoming V2)',
              nameMl: 'എൻ.ആർ.ഐ ഫാമിലി പ്ലസ് (V2)',
              price: '₹99',
              cadenceEn: 'per month (billed annually via UPI AutoPay)',
              cadenceMl: 'പ്രതിമാസം (UPI AutoPay സൗകര്യം)',
              highlight: false,
              featuresEn: [
                'Unlimited documents & high-res PDF vault',
                'Remote “Request a Document” WhatsApp links for parents',
                'Multi-country GCC + India SMS alerts',
                'Watermarked expiring Share Packs',
                'Priority family onboarding support',
              ],
              featuresMl: [
                'പരിധിയില്ലാത്ത രേഖകളും PDF സ്റ്റോറേജും',
                'നാട്ടിലെ മാതാപിതാക്കളോട് രേഖ ആവശ്യപ്പെടാനുള്ള ലിങ്ക്',
                'ഇന്ത്യ + ഗൾഫ് നമ്പറുകളിൽ SMS അലേർട്ട്',
                'വാട്ടർമാർക്ക് ചെയ്ത ഷെയർ പാക്കുകൾ',
                'പ്രത്യേക കുടുംബ സപ്പോർട്ട്',
              ],
            },
            {
              nameEn: 'Partners: CAs & Societies (Upcoming V2)',
              nameMl: 'പാർട്ണർ പ്ലാൻ: CA & ഹൗസിംഗ് സൊസൈറ്റികൾ',
              price: '₹199',
              cadenceEn: 'per month for up to 50 client households',
              cadenceMl: '50 ക്ലയന്റ് കുടുംബങ്ങൾ വരെ / മാസം',
              highlight: false,
              featuresEn: [
                'Multi-tenant Partner Portal with DPDP consent log',
                'Bulk CSV client & policy expiry import',
                'Automated compliance & tax deadline reminders',
                'GST tax invoices (18% CGST/SGST)',
                'Dedicated account manager',
              ],
              featuresMl: [
                'ക്ലയന്റ് കുടുംബങ്ങൾക്കായി പ്രത്യേക പാർട്ണർ പോർട്ടൽ',
                'CSV വഴി ബൾക്ക് ഡാറ്റാ ഇംപോർട്ട്',
                'നികുതി-ഇൻഷുറൻസ് കാലാവധി ഓർമ്മപ്പെടുത്തൽ',
                'ജി.എസ്.ടി (GST) ഇൻവോയ്സ് സൗകര്യം',
                'പ്രത്യേക സപ്പോർട്ട് മാനേജർ',
              ],
            },
          ].map((plan) => (
            <div
              key={plan.nameEn}
              className={`flex flex-col justify-between rounded-3xl border p-6 sm:p-8 ${
                plan.highlight
                  ? 'border-[#EA4C46] bg-white shadow-lg'
                  : 'border-[#E5E7EB] bg-[#F8FAFC]'
              }`}
            >
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">
                  {lang === 'ml' ? plan.nameMl : plan.nameEn}
                </h2>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-mono-tabular text-4xl font-extrabold text-[#EA4C46]">
                    {plan.price}
                  </span>
                  <span className="text-xs text-[#64748B]">
                    {lang === 'ml' ? plan.cadenceMl : plan.cadenceEn}
                  </span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-[#0F172A]">
                  {(lang === 'ml' ? plan.featuresMl : plan.featuresEn).map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#EA4C46]" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={onOpenWaitlist}
                className={`mt-8 w-full min-h-[48px] rounded-full px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                  plan.highlight
                    ? 'bg-[#EA4C46] text-white hover:bg-[#D43B35]'
                    : 'bg-[#141416] text-white hover:bg-[#0F172A]'
                }`}
              >
                {lang === 'ml' ? 'സൗജന്യമായി രജിസ്റ്റർ ചെയ്യുക' : 'Claim Founding Access'}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (page === 'security') {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
        <div>
          <p className="text-sm font-bold text-[#EA4C46]">
            {lang === 'ml' ? 'സുരക്ഷയും സ്വകാര്യതയും' : 'Security & Data Privacy Architecture'}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-[#0F172A] sm:text-4xl">
            {lang === 'ml'
              ? 'നിങ്ങളുടെ കുടുംബത്തിന്റെ രേഖകൾ പൂർണ്ണമായും എൻക്രിപ്റ്റ് ചെയ്ത സ്വകാര്യ വോൾട്ടിൽ'
              : 'Bank-grade encryption, Aadhaar masking, and strict multi-tenant isolation'}
          </h1>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {[
            {
              icon: Lock,
              titleEn: 'Never Stores Plain-Text Aadhaar',
              titleMl: 'ആധാർ ഒരിക്കലും പ്ലെയിൻ ടെക്സ്റ്റായി സൂക്ഷിക്കില്ല',
              bodyEn:
                'By default, the first 8 digits of every Aadhaar number are masked (XXXX-XXXX-4821). Any full document number is encrypted at the application layer with AES-256-GCM before touching the database.',
              bodyMl:
                'ആധാർ നമ്പറിന്റെ ആദ്യ 8 അക്കങ്ങൾ എപ്പോഴും മറച്ചുവെക്കുന്നു (XXXX-XXXX-4821). എല്ലാ നമ്പറുകളും AES-256-GCM എൻക്രിപ്ഷൻ വഴിയാണ് സൂക്ഷിക്കുന്നത്.',
            },
            {
              icon: ShieldCheck,
              titleEn: 'PostgreSQL Row-Level Security (RLS)',
              titleMl: 'മൾട്ടി-ടെനന്റ് Row-Level Security (RLS)',
              bodyEn:
                'Every database row carries a mandatory tenant_id enforced by PostgreSQL RLS policies and automated tenant-isolation tests, proving one family can never read another family’s records.',
              bodyMl:
                'ഒരു കുടുംബത്തിന്റെ വിവരങ്ങൾ മറ്റൊരു അക്കൗണ്ടിന് ഒരിക്കലും കാണാൻ കഴിയില്ലെന്ന് PostgreSQL RLS പോളിസികൾ ഉറപ്പാക്കുന്നു.',
            },
            {
              icon: FileText,
              titleEn: 'Private Storage Buckets & Short-Lived Signed URLs',
              titleMl: 'പ്രൈവറ്റ് സ്റ്റോറേജും താൽക്കാലിക ലിങ്കുകളും',
              bodyEn:
                'Scanned documents are never placed on public URLs. Viewing or downloading generates a short-lived cryptographic signed URL valid only for your authenticated session.',
              bodyMl:
                'അപ്‌ലോഡ് ചെയ്യുന്ന ഫയലുകൾ പബ്ലിക് ഇന്റർനെറ്റിൽ ലഭ്യമല്ല. നിങ്ങൾ തുറക്കുമ്പോൾ മാത്രം പ്രവർത്തിക്കുന്ന സുരക്ഷിത Signed URL ഉപയോഗിക്കുന്നു.',
            },
            {
              icon: CheckCircle2,
              titleEn: 'DPDP Act 2023 Rights & 30-Day Soft Delete Recovery',
              titleMl: 'DPDP Act 2023 അവകാശങ്ങളും 30-ദിവസ റിക്കവറിയും',
              bodyEn:
                'Accidentally deleted a receipt? Restore it within 30 days. Want to leave? Export all family records as a portable archive or permanently erase your account at any time.',
              bodyMl:
                'അബദ്ധത്തിൽ ഡിലീറ്റ് ആയ രേഖകൾ 30 ദിവസത്തിനുള്ളിൽ തിരിച്ചെടുക്കാം. എപ്പോൾ വേണമെങ്കിലും മുഴുവൻ ഡാറ്റയും ഡൗൺലോഡ് ചെയ്യുകയോ ഡിലീറ്റ് ചെയ്യുകയോ ചെയ്യാം.',
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.titleEn} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EA4C46] text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-[#0F172A]">
                  {lang === 'ml' ? card.titleMl : card.titleEn}
                </h2>
                <p className="mt-2 text-sm text-[#64748B]">
                  {lang === 'ml' ? card.bodyMl : card.bodyEn}
                </p>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-[#F3F4F6] p-5 text-sm text-[#0F172A]">
          <strong>{lang === 'ml' ? 'പ്രധാന അറിയിപ്പ്: ' : 'Important Notice: '}</strong>
          {lang === 'ml'
            ? 'കുടുംബ വോൾട്ട് ഒരു സ്വകാര്യ ഫാമിലി ഓർഗനൈസർ ആപ്പാണ്. ഇതിന് കേന്ദ്ര-സംസ്ഥാന സർക്കാരുകളുമായോ DigiLocker പോലുള്ള ഔദ്യോഗിക സംവിധാനങ്ങളുമായോ യാതൊരു ബന്ധവുമില്ല.'
            : 'Kudumba Vault is a private household organization tool. We do not claim government approval, DigiLocker equivalence, or official verification of any identity or property document.'}
        </div>
      </div>
    );
  }

  if (page === 'for-nris') {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-bold text-[#EA4C46]">
            <Globe className="h-4 w-4" />
            <span>
              {lang === 'ml'
                ? 'ഗൾഫ് പ്രവാസി മലയാളികൾക്കായി (UAE · KSA · Qatar · Oman · Kuwait · Bahrain)'
                : 'Built for Gulf & Global NRIs (UAE · Saudi · Qatar · Oman · Kuwait · Bahrain)'}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-[#0F172A] sm:text-4xl">
            {lang === 'ml'
              ? 'ദൂരെയാണെങ്കിലും നാട്ടിലെ വീടിന്റെയും മാതാപിതാക്കളുടെയും കാര്യങ്ങൾ വിരൽത്തുമ്പിൽ'
              : 'Look after your parents’ documents and renewals in Kerala from thousands of miles away'}
          </h1>
          <p className="mt-3 text-base text-[#64748B]">
            {lang === 'ml'
              ? 'നാട്ടിലെ ഭൂനികുതി, കെട്ടിട നികുതി, അച്ഛന്റെ വാഹന ഇൻഷുറൻസ്, മെഡിക്കൽ റിപ്പോർട്ടുകൾ, നിങ്ങളുടെ സ്വന്തം ഇഖാമ/പാസ്‌പോർട്ട് കാലാവധി എന്നിവ ഒരുമിച്ച് കൈകാര്യം ചെയ്യാം.'
              : 'Stop searching through years of old WhatsApp chats for your father’s Land Tax receipt, mother’s health policy, or your own Iqama/Emirates ID expiry.'}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6">
            <h2 className="text-lg font-bold text-[#0F172A]">
              {lang === 'ml'
                ? '1. “രേഖ ആവശ്യപ്പെടാം” (Remote Document Request)'
                : '1. Remote “Request a Document” Link for Parents'}
            </h2>
            <p className="mt-2 text-sm text-[#64748B]">
              {lang === 'ml'
                ? 'നിങ്ങൾക്ക് നാട്ടിലെ ഒരു സർട്ടിഫിക്കറ്റ് ആവശ്യമുണ്ടെങ്കിൽ ആപ്പിൽ നിന്ന് അഭ്യർത്ഥന അയക്കാം. നാട്ടിലുള്ള അച്ഛനോ അമ്മയ്ക്കോ ലോഗിൻ ചെയ്യാതെ തന്നെ ഒറ്റ ടാപ്പിൽ ഫോട്ടോ എടുത്ത് അപ്‌ലോഡ് ചെയ്യാം.'
                : 'Need a scanned copy of the Thrissur house tax receipt? Send a request from Dubai. Your parents receive a simple Malayalam link to snap the photo in 1 tap.'}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6">
            <h2 className="text-lg font-bold text-[#0F172A]">
              {lang === 'ml'
                ? '2. ഗൾഫ് രേഖകളുടെയും നാട്ടിലെ നികുതികളുടെയും അലേർട്ട്'
                : '2. Dual GCC & Kerala Expiry Tracking'}
            </h2>
            <p className="mt-2 text-sm text-[#64748B]">
              {lang === 'ml'
                ? 'ഇഖാമ, എമിറേറ്റ്സ് ഐഡി, പാസ്‌പോർട്ട് എന്നിവയോടൊപ്പം നാട്ടിലെ KSEB ബിൽ, ഭൂനികുതി, സ്വർണ്ണ വായ്പ എന്നിവയുടെ കാലാവധിയും ഒരേ ഡാഷ്‌ബോർഡിൽ കാണാം.'
                : 'Track Emirates ID, Saudi Iqama, QID, Oman Resident Card, and Passport expiries alongside Kerala Land Tax (കരമടച്ച രസിത്) and vehicle insurance.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenWaitlist}
          className="min-h-[48px] rounded-full bg-[#EA4C46] px-6 py-3 text-sm font-semibold text-white hover:bg-[#D43B35] cursor-pointer"
        >
          {lang === 'ml' ? 'പ്രവാസി കുടുംബ വോൾട്ട് സൗജന്യമായി തുടങ്ങുക' : 'Join as an NRI Founding Family'}
        </button>
      </div>
    );
  }

  if (page === 'for-partners') {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-bold text-[#EA4C46]">
            <Building2 className="h-4 w-4" />
            <span>
              {lang === 'ml'
                ? 'ചാർട്ടേഡ് അക്കൗണ്ടന്റുമാർ, ഇൻഷുറൻസ് ഏജന്റുമാർ, റസിഡന്റ്സ് അസോസിയേഷനുകൾ'
                : 'For Chartered Accountants, Insurance Advisors & Resident Associations'}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-[#0F172A] sm:text-4xl">
            {lang === 'ml'
              ? 'ക്ലയന്റ് കുടുംബങ്ങളുടെ പോളിസികളും നികുതി രേഖകളും അനുമതിയോടെ കൈകാര്യം ചെയ്യാം'
              : 'Help your client households stay ahead of every tax, insurance, and compliance renewal'}
          </h1>
          <p className="mt-3 text-base text-[#64748B]">
            {lang === 'ml'
              ? 'ഞങ്ങളുടെ V2 പാർട്ണർ പോർട്ടലിൽ CSV ബൾക്ക് ഇംപോർട്ട്, DPDP സമ്മതപത്രം (Consent tracking), ഓട്ടോമേറ്റഡ് ക്ലയന്റ് റിമൈൻഡറുകൾ എന്നിവ ഉൾപ്പെടുന്നു.'
              : 'Our upcoming V2 Partner Portal enables Kerala CAs, LIC/health insurance advisors, and apartment associations to manage expiring items across client households with explicit DPDP consent.'}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              titleEn: 'Bulk CSV Expiry Import',
              titleMl: 'CSV ബൾക്ക് ഇംപോർട്ട്',
              descEn: 'Import hundreds of client motor/health policies or property tax due dates in seconds.',
              descMl: 'നൂറുകണക്കിന് ക്ലയന്റുകളുടെ പോളിസി കാലാവധികൾ ഒറ്റയടിക്ക് CSV വഴി ചേർക്കാം.',
            },
            {
              titleEn: 'DPDP Consent Status Ledger',
              titleMl: 'DPDP സമ്മതപത്ര രജിസ്റ്റർ',
              descEn: 'Clients grant or revoke view access transparently with full audit logging.',
              descMl: 'ക്ലയന്റുകളുടെ പൂർണ്ണ അനുമതിയോടെ മാത്രം രേഖകൾ കൈകാര്യം ചെയ്യാവുന്ന സംവിധാനം.',
            },
            {
              titleEn: 'Co-Branded Renewal Alerts',
              titleMl: 'നിങ്ങളുടെ പേരിൽ റിമൈൻഡറുകൾ',
              descEn: 'Clients receive timely 60/30/7-day reminders showing your firm or agency contact.',
              descMl: 'ക്ലയന്റുകൾക്ക് നിങ്ങളുടെ സ്ഥാപനത്തിന്റെ പേരിൽ കൃത്യസമയത്ത് പുതുക്കൽ സന്ദേശങ്ങൾ.',
            },
          ].map((item) => (
            <div key={item.titleEn} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6">
              <h2 className="text-base font-bold text-[#0F172A]">
                {lang === 'ml' ? item.titleMl : item.titleEn}
              </h2>
              <p className="mt-2 text-sm text-[#64748B]">
                {lang === 'ml' ? item.descMl : item.descEn}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenWaitlist}
          className="min-h-[48px] rounded-full bg-[#EA4C46] px-6 py-3 text-sm font-semibold text-white hover:bg-[#D43B35] cursor-pointer"
        >
          {lang === 'ml' ? 'പാർട്ണർ വെയിറ്റ്‌ലിസ്റ്റിൽ ചേരുക' : 'Join Partner Early Access Waitlist'}
        </button>
      </div>
    );
  }

  if (page === 'faq') {
    const faqs = [
      {
        qEn: 'Is Kudumba Vault an official government or DigiLocker app?',
        qMl: 'കുടുംബ വോൾട്ട് ഒരു സർക്കാർ ആപ്പോ ഡിജിലോക്കറോ ആണോ?',
        aEn: 'No. Kudumba Vault is an independent, private household organizer built for families to organize their own scans, track expiry dates, and remember local workers. We do not claim government endorsement or official verification.',
        aMl: 'അല്ല. ഇതൊരു സ്വതന്ത്ര സ്വകാര്യ ഫാമിലി ഓർഗനൈസർ ആപ്പാണ്. സർക്കാർ അംഗീകാരമോ ഔദ്യോഗിക വെരിഫിക്കേഷനോ ഞങ്ങൾ അവകാശപ്പെടുന്നില്ല.',
      },
      {
        qEn: 'How do you protect Aadhaar numbers and sensitive documents?',
        qMl: 'ആധാർ നമ്പറുകളുടെയും മറ്റ് രേഖകളുടെയും സുരക്ഷ എങ്ങനെയാണ്?',
        aEn: 'We never store Aadhaar numbers in plain text. The first 8 digits are automatically masked (XXXX-XXXX-4821), sensitive numbers are encrypted with AES-256-GCM, and files are stored in private buckets accessible only via short-lived signed URLs.',
        aMl: 'ആധാർ നമ്പറുകൾ ഒരിക്കലും പ്ലെയിൻ ടെക്സ്റ്റായി സൂക്ഷിക്കില്ല. ആദ്യ 8 അക്കങ്ങൾ മറച്ചുവെക്കുകയും (XXXX-XXXX-4821) AES-256-GCM എൻക്രിപ്ഷൻ ഉപയോഗിക്കുകയും ചെയ്യുന്നു.',
      },
      {
        qEn: 'Can my parents in Kerala use it in Malayalam while I use it in English in Dubai?',
        qMl: 'നാട്ടിലെ മാതാപിതാക്കൾക്ക് മലയാളത്തിലും എനിക്ക് ഇംഗ്ലീഷിലും ഉപയോഗിക്കാൻ കഴിയുമോ?',
        aEn: 'Yes! Every screen has an instant Malayalam (മലയാളം) and English toggle, and each family member can save their preferred language.',
        aMl: 'തീർച്ചയായും! ഓരോ കുടുംബാംഗത്തിനും അവർക്ക് ഇഷ്ടമുള്ള ഭാഷ (മലയാളം അല്ലെങ്കിൽ ഇംഗ്ലീഷ്) തിരഞ്ഞെടുക്കാം.',
      },
      {
        qEn: 'What happens if I want to export my documents or delete my household account?',
        qMl: 'എന്റെ ഡാറ്റ ഡൗൺലോഡ് ചെയ്യാനോ അക്കൗണ്ട് ഡിലീറ്റ് ചെയ്യാനോ സാധിക്കുമോ?',
        aEn: 'Under India’s DPDP Act 2023, you have 1-click Data Export to download all your files and metadata, plus full right-to-erasure account deletion.',
        aMl: 'ഇന്ത്യയുടെ DPDP Act 2023 പ്രകാരം എപ്പോൾ വേണമെങ്കിലും നിങ്ങളുടെ മുഴുവൻ ഡാറ്റയും ഡൗൺലോഡ് ചെയ്യാനും അക്കൗണ്ട് പൂർണ്ണമായി ഡിലീറ്റ് ചെയ്യാനും സാധിക്കും.',
      },
    ];

    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-bold text-[#EA4C46]">
            <HelpCircle className="h-4 w-4" />
            <span>
              {lang === 'ml' ? 'പതിവ് ചോദ്യങ്ങളും ഉത്തരങ്ങളും' : 'Frequently Asked Questions'}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-[#0F172A]">
            {lang === 'ml'
              ? 'നിങ്ങളുടെ സംശയങ്ങൾക്കുള്ള ഉത്തരങ്ങൾ'
              : 'Clear answers about privacy, usage, and family access'}
          </h1>
        </div>

        <div className="space-y-4">
          {faqs.map((f) => (
            <div key={f.qEn} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6">
              <h2 className="text-base font-bold text-[#0F172A]">
                {lang === 'ml' ? f.qMl : f.qEn}
              </h2>
              <p className="mt-2 text-sm text-[#64748B]">{lang === 'ml' ? f.aMl : f.aEn}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (page === 'contact') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-bold text-[#EA4C46]">
            <Mail className="h-4 w-4" />
            <span>{lang === 'ml' ? 'ഞങ്ങളുമായി ബന്ധപ്പെടുക' : 'Contact Kudumba Vault Support'}</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-[#0F172A]">
            {lang === 'ml'
              ? 'സഹായത്തിനായി സന്ദേശമയക്കുക അല്ലെങ്കിൽ വാട്ട്‌സ്ആപ്പിൽ ബന്ധപ്പെടുക'
              : 'Send us a message or chat with our Kerala support team on WhatsApp'}
          </h1>
        </div>

        <form
          onSubmit={handleContactSubmit}
          className="rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-6 sm:p-8 space-y-4"
        >
          {contactSent ? (
            <div className="rounded-2xl bg-[#DCFCE7] border border-[#BBF7D0] p-5 text-[#16A34A]">
              <p className="font-bold">
                {lang === 'ml'
                  ? '✓ നിങ്ങളുടെ സന്ദേശം ലഭിച്ചു. ഞങ്ങൾ ഉടൻ മറുപടി നൽകുന്നതാണ്.'
                  : '✓ Thank you! We received your message and will reply within 24 hours.'}
              </p>
            </div>
          ) : (
            <>
              {contactError && (
                <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3 text-xs font-semibold text-[#DC2626]">
                  {contactError}
                </div>
              )}
              <div>
                <label htmlFor="contact-name" className="block text-sm font-semibold text-[#0F172A]">
                  {lang === 'ml' ? 'നിങ്ങളുടെ പേര്' : 'Your Name'}
                </label>
                <input
                  id="contact-name"
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="mt-1.5 w-full min-h-[48px] rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm text-[#0F172A]"
                  placeholder={lang === 'ml' ? 'ഉദാ: രാജേഷ് നായർ' : 'e.g. Rajesh Nair'}
                />
              </div>
              <div>
                <label
                  htmlFor="contact-phone"
                  className="block text-sm font-semibold text-[#0F172A]"
                >
                  {lang === 'ml' ? 'ഫോൺ നമ്പർ അല്ലെങ്കിൽ ഇമെയിൽ' : 'Phone Number (India / Gulf) or Email'}
                </label>
                <input
                  id="contact-phone"
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="mt-1.5 w-full min-h-[48px] rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm text-[#0F172A]"
                  placeholder="+91 94470 00000 / +971 50 000 0000"
                />
              </div>
              <div>
                <label htmlFor="contact-msg" className="block text-sm font-semibold text-[#0F172A]">
                  {lang === 'ml' ? 'സന്ദേശം' : 'How can we help your family?'}
                </label>
                <textarea
                  id="contact-msg"
                  rows={4}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#E5E7EB] bg-white p-4 text-sm text-[#0F172A]"
                  placeholder={
                    lang === 'ml'
                      ? 'നിങ്ങളുടെ അഭിപ്രായമോ സംശയമോ ഇവിടെ രേഖപ്പെടുത്തുക...'
                      : 'Tell us about your household or question...'
                  }
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-full bg-[#EA4C46] px-5 py-3 text-sm font-semibold text-white hover:bg-[#D43B35] cursor-pointer"
              >
                {lang === 'ml' ? 'സന്ദേശം അയക്കുക' : 'Send Message'}
              </button>
            </>
          )}
        </form>
      </div>
    );
  }

  if (page === 'privacy') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
        <h1 className="text-3xl font-extrabold text-[#0F172A]">
          {lang === 'ml'
            ? 'സ്വകാര്യതാ നയം (DPDP Act 2023 Compliant)'
            : 'Privacy Policy (DPDP Act 2023 Compliant)'}
        </h1>
        <div className="rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-6 sm:p-8 space-y-4 text-sm text-[#64748B]">
          <p className="text-[#0F172A] font-semibold">
            {lang === 'ml'
              ? 'അവസാനമായി പുതുക്കിയത്: ഒക്ടോബർ 2026 · ഡിജിറ്റൽ പേഴ്സണൽ ഡാറ്റ പ്രൊട്ടക്ഷൻ ആക്ട് (DPDP Act 2023)'
              : 'Last Updated: October 2026 · Digital Personal Data Protection Act, 2023 (India)'}
          </p>
          <p>
            {lang === 'ml'
              ? '1. ഡാറ്റാ ശേഖരണവും ഉദ്ദേശ്യവും: നിങ്ങളുടെ കുടുംബ രേഖകൾ സുരക്ഷിതമായി സൂക്ഷിക്കുന്നതിനും കാലാവധി ഓർമ്മപ്പെടുത്തലുകൾ അയക്കുന്നതിനും മാത്രമാണ് ഞങ്ങൾ വിവരങ്ങൾ ശേഖരിക്കുന്നത്.'
              : '1. Purpose Limitation & Data Fiduciary Duty: Kudumba Vault acts strictly as a private household vault. Your uploaded scans, expiry dates, and worker contacts are never sold, shared with advertisers, or used for profiling.'}
          </p>
          <p>
            {lang === 'ml'
              ? '2. ആധാർ സുരക്ഷ: ആധാർ നമ്പറുകൾ ഒരിക്കലും പ്ലെയിൻ ടെക്സ്റ്റായി സൂക്ഷിക്കില്ല. ആദ്യ 8 അക്കങ്ങൾ എപ്പോഴും മറച്ചുവെക്കുന്നു (XXXX-XXXX-4821).'
              : '2. Aadhaar & Sensitive ID Protection: We never store Aadhaar numbers in plain text. Only masked representations (XXXX-XXXX-4821) and application-layer AES-256-GCM ciphertexts are stored.'}
          </p>
          <p>
            {lang === 'ml'
              ? '3. ഉപയോക്താവിന്റെ അവകാശങ്ങൾ: എപ്പോൾ വേണമെങ്കിലും നിങ്ങളുടെ സമ്മതം പിൻവലിക്കാനും, മുഴുവൻ ഡാറ്റയും എക്സ്പോർട്ട് ചെയ്യാനും, അക്കൗണ്ട് പൂർണ്ണമായി ഡിലീറ്റ് ചെയ്യാനും നിങ്ങൾക്ക് അവകാശമുണ്ട്.'
              : '3. Data Principal Rights: You can inspect your Consent Ledger, export your entire household vault as a portable archive, or trigger permanent account deletion at any time.'}
          </p>
        </div>
      </div>
    );
  }

  // Terms of Service
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
      <h1 className="text-3xl font-extrabold text-[#0F172A]">
        {lang === 'ml' ? 'സേവന നിബന്ധനകൾ (Terms of Service)' : 'Terms of Service'}
      </h1>
      <div className="rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-6 sm:p-8 space-y-4 text-sm text-[#64748B]">
        <p className="text-[#0F172A] font-semibold">
          {lang === 'ml'
            ? '1. സ്വകാര്യ കുടുംബ ഓർഗനൈസർ (സർക്കാർ അംഗീകൃത സംവിധാനമല്ല)'
            : '1. Independent Private Organizer (No Government Affiliation)'}
        </p>
        <p>
          {lang === 'ml'
            ? 'കുടുംബ വോൾട്ട് ഒരു സ്വകാര്യ ഡോക്യുമെന്റ് ഓർഗനൈസറും റിമൈൻഡർ സർവീസും മാത്രമാണ്. ഇവിടെ സൂക്ഷിക്കുന്ന രേഖകൾ സർക്കാർ പോർട്ടലുകളിലെ ഔദ്യോഗിക സർട്ടിഫിക്കറ്റുകൾക്ക് പകരമല്ല.'
            : 'Kudumba Vault provides personal document organization and reminder notifications. Copies stored in Kudumba Vault do not constitute government-issued or officially verified digital certificates.'}
        </p>
        <p className="text-[#0F172A] font-semibold">
          {lang === 'ml' ? '2. കുടുംബാംഗങ്ങളുടെ ഉത്തരവാദിത്തം' : '2. Household Roles & Access'}
        </p>
        <p>
          {lang === 'ml'
            ? 'വോൾട്ട് ഉടമ (Owner) ചേർക്കുന്ന കുടുംബാംഗങ്ങൾക്ക് അവരുടെ റോൾ (Owner, Editor, Viewer) അനുസരിച്ച് മാത്രമേ രേഖകൾ കാണാനും മാറ്റാനും സാധിക്കൂ. “Private” എന്ന് അടയാളപ്പെടുത്തിയ രേഖകൾ അത് ചേർത്ത വ്യക്തിക്കും Owner-ക്കും മാത്രമേ കാണാൻ കഴിയൂ.'
            : 'Household Owners control member invitations and roles (Owner, Editor, Viewer). Documents marked Private remain restricted to their creator and the Household Owner.'}
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="min-h-[44px] rounded-full bg-[#EA4C46] px-5 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            {lang === 'ml' ? '← ഹോം പേജിലേക്ക് മടങ്ങുക' : '← Back to Home'}
          </button>
        </div>
      </div>
    </div>
  );
};
