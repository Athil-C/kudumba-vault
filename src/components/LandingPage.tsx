import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './modals/AuthModal';
import { Globe, ShieldCheck, Zap, Users } from 'lucide-react';

interface LandingPageProps {
  onEnterApp: () => void;
  lang?: 'ml' | 'en';
  initialAuthMode?: 'login' | 'register';
  autoOpenAuth?: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterApp,
  lang: initialLang = 'en',
  initialAuthMode = 'login',
  autoOpenAuth = false,
}) => {
  const [lang, setLang] = useState<'ml' | 'en'>(initialLang);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(autoOpenAuth);
  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialAuthMode);

  // Expandable plan details state: morePlan1, morePlan2, morePlan3
  const [expandedPlans, setExpandedPlans] = useState<{ [key: string]: boolean }>({
    morePlan1: false,
    morePlan2: false,
    morePlan3: false,
  });

  // FAQ Accordion: item 0 open by default
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Toast Notification
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // Footer Newsletter Email
  const [footerEmail, setFooterEmail] = useState('');

  const { isAuthenticated } = useAuth();

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  };

  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => {
      setToastVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  const copy = {
    en: {
      navFeatures: 'Features',
      navWhy: 'Why Vault',
      navStories: 'Stories',
      navPricing: 'Pricing',
      navFaq: 'FAQ',
      heroBadge: 'Household Document Vault Made Easy',
      heroSubtitle:
        'Store Aadhaar, Passports, Emirates IDs, Land Tax receipts, Vehicle RC, Health Policies & Trusted Workers — everything your Kerala & NRI family needs in one powerful workspace.',
      heroPrimaryCta: 'Enter Kudumba Vault →',
      heroSecondaryCta: 'See How It Works',
      navCta: 'Enter Kudumba Vault →',
      communityHeading: 'Trusted by amazing Kerala & NRI communities',
      featHeading: 'Manage Every Family Document From One Powerful Workspace',
      mobileHeading: 'All Your Documents In Your Pocket',
      testiHeading: 'Hear from the families',
      finalCtaHeading: 'Ready to Secure Your Family Vault?',
    },
    ml: {
      navFeatures: 'ഫീച്ചറുകൾ',
      navWhy: 'എന്തുകൊണ്ട് വോൾട്ട്',
      navStories: 'കഥകൾ',
      navPricing: 'പ്ലാനുകൾ',
      navFaq: 'ചോദ്യങ്ങൾ',
      heroBadge: 'കുടുംബ ഡോക്യുമെന്റ് വോൾട്ട് — എളുപ്പത്തിലും സുരക്ഷിതമായും',
      heroSubtitle:
        'ആധാർ, പാസ്പോർട്ട്, എമിറേറ്റ്സ് ഐഡി, ഭൂനികുതി രസീതുകൾ, വാഹന ആർസി, ഇൻഷുറൻസ് പോളിസികൾ — കേരളത്തിലെയും പ്രവാസി കുടുംബങ്ങൾക്കും ആവശ്യമായതെല്ലാം ഒരൊറ്റ വോൾട്ടിൽ.',
      heroPrimaryCta: 'കുടുംബ വോൾട്ടിലേക്ക് പ്രവേശിക്കുക →',
      heroSecondaryCta: 'എങ്ങനെ പ്രവർത്തിക്കുന്നു',
      navCta: 'കുടുംബ വോൾട്ട് →',
      communityHeading: 'കേരളത്തിലെയും പ്രവാസി കൂട്ടായ്മകളുടെയും വിശ്വസ്ത പങ്കാളി',
      featHeading: 'എല്ലാ കുടുംബ രേഖകളും ഒരൊറ്റ സുരക്ഷിത വോൾട്ടിൽ',
      mobileHeading: 'നിങ്ങളുടെ എല്ലാ രേഖകളും ഇനി വിരൽത്തുമ്പിൽ',
      testiHeading: 'കുടുംബങ്ങളുടെ അനുഭവങ്ങൾ',
      finalCtaHeading: 'നിങ്ങളുടെ കുടുംബ വോൾട്ട് സുരക്ഷിതമാക്കാൻ തയ്യാറാണോ?',
    },
  };

  const t = copy[lang];

  const toggleLanguage = () => {
    if (lang === 'en') {
      setLang('ml');
      showToast('മലയാളം ഇന്റർഫേസ് സജീവമാക്കി');
    } else {
      setLang('en');
      showToast('Switched to English');
    }
  };

  const togglePlanDetails = (planKey: string) => {
    setExpandedPlans((prev) => ({
      ...prev,
      [planKey]: !prev[planKey],
    }));
  };

  const toggleFaq = (idx: number) => {
    setOpenFaqIndex((prev) => (prev === idx ? null : idx));
  };

  const openLoginModal = (mode: 'login' | 'register' = 'login') => {
    if (isAuthenticated) {
      onEnterApp();
      return;
    }
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  };

  const openModal = (targetOrHeading?: string) => {
    if (isAuthenticated) {
      onEnterApp();
      return;
    }
    if (
      targetOrHeading &&
      (targetOrHeading.toLowerCase().includes('free') ||
        targetOrHeading.toLowerCase().includes('register') ||
        targetOrHeading.toLowerCase().includes('signup') ||
        targetOrHeading.toLowerCase().includes('start'))
    ) {
      openLoginModal('register');
    } else {
      openLoginModal('login');
    }
  };

  const handleFooterSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!footerEmail.trim()) return;
    showToast(`Subscribed ${footerEmail.trim()}!`);
    setFooterEmail('');
  };

  return (
    <div className="selection:bg-sun selection:text-ink antialiased bg-white text-ink min-h-screen">
      {/* ============================================================================
           SHARED 3D CAPSULE MASCOT (Clean, High-Contrast SVG Definition)
           ============================================================================ */}
      <svg width="0" height="0" className="hidden" aria-hidden="true">
        <defs>
          <filter id="cleanShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#0D0E12" floodOpacity="0.25" />
          </filter>

          <radialGradient id="helmetRed" cx="35%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#FF858B" />
            <stop offset="48%" stopColor="#FF4C54" />
            <stop offset="100%" stopColor="#B91C24" />
          </radialGradient>

          <linearGradient id="capsuleYellow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE875" />
            <stop offset="55%" stopColor="#F7D02C" />
            <stop offset="100%" stopColor="#D9A406" />
          </linearGradient>

          <linearGradient id="capsuleCream" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="65%" stopColor="#FDF5E2" />
            <stop offset="100%" stopColor="#E5D2AF" />
          </linearGradient>

          <g id="kudumbaMascot">
            {/* Soft Ground Shadow */}
            <ellipse cx="164" cy="316" rx="60" ry="10" fill="rgba(13,14,18,0.2)" />

            {/* Legs & Sneakers */}
            <path d="M138 242 L126 290" stroke="#181920" strokeWidth="22" strokeLinecap="round" />
            <rect x="96" y="284" width="48" height="24" rx="12" fill="url(#capsuleCream)" />
            <line x1="112" y1="292" x2="126" y2="292" stroke="#0D0E12" strokeWidth="3" strokeLinecap="round" />

            <path d="M188 242 L200 290" stroke="#181920" strokeWidth="22" strokeLinecap="round" />
            <rect x="182" y="284" width="48" height="24" rx="12" fill="url(#capsuleCream)" />
            <line x1="198" y1="292" x2="212" y2="292" stroke="#0D0E12" strokeWidth="3" strokeLinecap="round" />

            {/* Right Arm Holding Document */}
            <path d="M94 186 C62 204, 48 182, 42 158" stroke="#181920" strokeWidth="20" strokeLinecap="round" fill="none" />
            <g transform="translate(10, 88) rotate(-12)">
              <rect x="0" y="0" width="64" height="80" rx="9" fill="#FFFFFF" />
              <line x1="12" y1="20" x2="36" y2="20" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
              <line x1="12" y1="34" x2="50" y2="34" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
              <line x1="12" y1="48" x2="50" y2="48" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
              <line x1="12" y1="62" x2="42" y2="62" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
            </g>
            <circle cx="40" cy="158" r="19" fill="url(#capsuleCream)" />

            {/* Left Waving Arm */}
            <path d="M232 184 C262 194, 274 168, 270 136" stroke="#181920" strokeWidth="20" strokeLinecap="round" fill="none" />
            <circle cx="270" cy="130" r="19" fill="url(#capsuleCream)" />

            {/* Antenna */}
            <path d="M168 54 Q172 34 163 24" stroke="#181920" strokeWidth="7" strokeLinecap="round" fill="none" />
            <circle cx="161" cy="19" r="12" fill="url(#helmetRed)" />
            <circle cx="157" cy="15" r="3.5" fill="#FFFFFF" opacity="0.85" />

            {/* Side Ears */}
            <ellipse cx="86" cy="154" rx="10" ry="18" fill="#F59E0B" />
            <ellipse cx="242" cy="154" rx="10" ry="18" fill="url(#capsuleCream)" />

            {/* Split Capsule Body */}
            <path d="M164 54 C122 54, 88 88, 88 130 L88 180 C88 222, 122 256, 164 256 Z" fill="url(#capsuleYellow)" />
            <path d="M164 54 C206 54, 240 88, 240 130 L240 180 C240 222, 206 256, 164 256 Z" fill="url(#capsuleCream)" />

            {/* Glossy Red Helmet Dome */}
            <path d="M88 142 C88 86, 118 54, 164 54 C210 54, 240 86, 240 142 C215 122, 113 122, 88 142 Z" fill="url(#helmetRed)" />
            <ellipse cx="144" cy="76" rx="40" ry="12" fill="#FFFFFF" opacity="0.3" transform="rotate(-8 144 76)" />

            {/* White Face Visor */}
            <rect x="108" y="102" width="112" height="72" rx="34" fill="#FFFFFF" />

            {/* Eyes & Smile */}
            <ellipse cx="144" cy="136" rx="6.5" ry="10" fill="#0D0E12" />
            <circle cx="142" cy="132" r="2.5" fill="#FFFFFF" />
            <ellipse cx="184" cy="136" rx="6.5" ry="10" fill="#0D0E12" />
            <circle cx="182" cy="132" r="2.5" fill="#FFFFFF" />
            <path d="M155 147 Q164 155 173 147" stroke="#0D0E12" strokeWidth="4" strokeLinecap="round" fill="none" />

            {/* Lanyard & House Badge */}
            <path d="M145 174 L158 202 L173 174" stroke="#181920" strokeWidth="3.5" strokeLinejoin="round" fill="none" />
            <g transform="translate(136, 194) rotate(3)">
              <rect x="0" y="0" width="44" height="48" rx="8" fill="#FFFFFF" />
              <path d="M22 12 L9 23 H13 V37 H31 V23 H35 L22 12 Z" fill="#FF4C54" />
              <circle cx="22" cy="26" r="3" fill="#FFFFFF" />
              <path d="M20.5 28 L19.5 35 H24.5 L23.5 28 Z" fill="#FFFFFF" />
            </g>
          </g>
        </defs>
      </svg>

      {/* ============================================================================
           1. MODERN HERO BANNER WITH INTEGRATED NAVBAR (MATCHING REFERENCE UI)
           ============================================================================ */}
      <div className="p-3 sm:p-5 lg:p-6 bg-[#FAF9F6]">
        <div className="relative rounded-[32px] sm:rounded-[44px] overflow-hidden bg-gradient-to-br from-[#E6283D] via-[#F23B50] to-[#D81B34] text-white px-5 sm:px-10 pt-6 pb-16 sm:pb-24 shadow-2xl">
          {/* Subtle Organic Curved Background Wave Ribbons */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none opacity-25"
            preserveAspectRatio="none"
            viewBox="0 0 1440 700"
          >
            <path
              d="M0 250 C320 500 620 180 1020 380 C1260 500 1440 320 1440 320 L1440 700 L0 700 Z"
              fill="url(#waveGrad1)"
            />
            <path
              d="M1440 120 C1180 280 880 120 580 320 C280 520 0 360 0 360 L0 0 L1440 0 Z"
              fill="url(#waveGrad2)"
            />
            <defs>
              <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>

          {/* Top Integrated Navigation Bar */}
          <header className="relative z-10 max-w-6xl mx-auto flex items-center justify-between gap-4 py-2">
            {/* Logo */}
            <a href="#" className="flex items-center gap-3 shrink-0">
              <div className="flex items-center justify-center">
                <img
                  src="/assets/kudumba-logo.png"
                  alt="Kudumba Vault"
                  className="h-10 w-10 sm:h-11 sm:w-11 object-contain drop-shadow-sm"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="font-display font-extrabold text-xl sm:text-2xl tracking-tight leading-none">
                <span className="text-white">KUDUMBA</span>
                <span className="text-sun ml-1">VAULT</span>
              </div>
            </a>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center gap-7 lg:gap-9 text-sm font-semibold text-white/90">
              <a href="#features" className="hover:text-sun transition-colors">
                {t.navFeatures}
              </a>
              <a href="#why-vault" className="hover:text-sun transition-colors">
                {t.navWhy}
              </a>
              <a href="#stories" className="hover:text-sun transition-colors">
                {t.navStories}
              </a>
              <a href="#pricing" className="hover:text-sun transition-colors">
                {t.navPricing}
              </a>
              <a href="#faq" className="hover:text-sun transition-colors">
                {t.navFaq}
              </a>
            </nav>

            {/* Right Actions: Glass Language Pill + Solid White CTA */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold text-white transition-all cursor-pointer backdrop-blur-md shadow-xs"
              >
                <Globe className="w-3.5 h-3.5 text-white/90" />
                <span>{lang === 'ml' ? 'മലയാളം ✓' : 'EN / മലയാളം'}</span>
              </button>
              <button
                type="button"
                onClick={() => openModal('Enter Kudumba Vault')}
                className="px-4 sm:px-5 py-2.5 rounded-full bg-white text-ink hover:bg-sun font-extrabold text-xs sm:text-sm transition-all shadow-md hover:shadow-lg cursor-pointer"
              >
                {t.navCta}
              </button>
            </div>
          </header>

          {/* Centered Hero Content */}
          <div className="relative z-10 text-center max-w-4xl mx-auto pt-14 sm:pt-20 pb-4">
            {/* Bold Two-Line Headline with Sun Yellow Badge */}
            <h1 className="font-display font-black tracking-tight leading-[1.08] text-5xl sm:text-6xl md:text-7xl lg:text-[80px] text-white">
              <span className="block drop-shadow-sm">Make Your</span>
              <span className="inline-block mt-3 sm:mt-4 px-7 sm:px-11 py-1.5 sm:py-2.5 rounded-2xl sm:rounded-3xl bg-sun text-ink font-black italic shadow-lg">
                Vault Alive.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mt-6 sm:mt-7 text-sm sm:text-base md:text-[17px] text-white/95 max-w-2xl mx-auto leading-relaxed font-normal">
              {t.heroSubtitle}
            </p>

            {/* Action Buttons Row */}
            <div className="mt-8 sm:mt-9 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => openModal('Enter Kudumba Vault')}
                className="px-8 sm:px-9 py-3.5 sm:py-4 rounded-full bg-white text-ink hover:bg-sun font-black text-sm sm:text-base transition-all shadow-xl hover:shadow-2xl cursor-pointer"
              >
                {t.heroPrimaryCta}
              </button>
              <button
                type="button"
                onClick={() => {
                  const feat = document.getElementById('features');
                  if (feat) feat.scrollIntoView({ behavior: 'smooth' });
                  else openModal('See How It Works');
                }}
                className="px-7 sm:px-8 py-3 sm:py-3.5 rounded-full bg-white/10 hover:bg-white/20 border-2 border-white/35 hover:border-white text-white font-bold text-sm sm:text-base flex items-center gap-2.5 transition-all backdrop-blur-md cursor-pointer"
              >
                <span className="w-5 h-5 rounded-full bg-white text-coral flex items-center justify-center text-[10px] pl-0.5 font-black shrink-0 shadow-xs">
                  ▶
                </span>
                <span>{t.heroSecondaryCta}</span>
              </button>
            </div>

            {/* Trust Badges Row with Gold/Sun Icons */}
            <div className="mt-10 sm:mt-12 flex flex-wrap items-center justify-center gap-x-8 sm:gap-x-12 gap-y-3 text-xs sm:text-sm font-semibold text-white/95">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-sun text-ink flex items-center justify-center shadow-xs shrink-0">
                  <ShieldCheck className="w-4 h-4 text-ink" />
                </div>
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-sun text-ink flex items-center justify-center shadow-xs shrink-0">
                  <Zap className="w-4 h-4 text-ink fill-current" />
                </div>
                <span>Quick 10s setup</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-sun text-ink flex items-center justify-center shadow-xs shrink-0">
                  <Users className="w-4 h-4 text-ink" />
                </div>
                <span>Built for Kerala &amp; NRI families</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================================
           2. SIMPLE 4-COLUMN KEY HIGHLIGHTS BAR
           ============================================================================ */}
      <section id="why-vault" className="max-w-5xl mx-auto px-6 -mt-12 relative z-10">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 sm:p-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-slate-100">
            <div className="pt-3 md:pt-0">
              <div className="font-display font-extrabold text-3xl sm:text-4xl text-ink">10 Sec</div>
              <div className="text-xs sm:text-sm text-ink-muted font-medium mt-1">Emergency Retrieval</div>
            </div>
            <div className="pt-3 md:pt-0">
              <div className="font-display font-extrabold text-3xl sm:text-4xl text-coral">18+ Docs</div>
              <div className="text-xs sm:text-sm text-ink-muted font-medium mt-1">Kerala &amp; NRI Types</div>
            </div>
            <div className="pt-3 md:pt-0">
              <div className="font-display font-extrabold text-3xl sm:text-4xl text-ink">60·30·7d</div>
              <div className="text-xs sm:text-sm text-ink-muted font-medium mt-1">Smart Expiry Alerts</div>
            </div>
            <div className="pt-3 md:pt-0">
              <div className="font-display font-extrabold text-3xl sm:text-4xl text-coral">1,200+</div>
              <div className="text-xs sm:text-sm text-ink-muted font-medium mt-1">Protected Households</div>
            </div>
          </div>
          <p className="text-center text-[11px] text-ink-muted mt-6 pt-4 border-t border-slate-100">
            Use verified figures only. Do not publish unverified usage or customer claims.
          </p>
        </div>
      </section>

      {/* ============================================================================
           3. SIMPLE TRUSTED COMMUNITY STRIP
           ============================================================================ */}
      <section className="max-w-5xl mx-auto px-6 py-16 text-center">
        <h2 className="font-display font-bold text-lg sm:text-xl text-ink">{t.communityHeading}</h2>
        <p className="text-xs text-ink-muted mt-1 max-w-xl mx-auto">
          Display verified partner organizations, community associations, event partners, or customer logos. Obtain permission before displaying third-party logos.
        </p>
        <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="py-4 px-5 rounded-2xl bg-coral-soft border border-rose-100 text-xs font-bold text-ink/75">
            Kochi RWA Network
          </div>
          <div className="py-4 px-5 rounded-2xl bg-coral-soft border border-rose-100 text-xs font-bold text-ink/75">
            Gulf Malayalee Desk
          </div>
          <div className="py-4 px-5 rounded-2xl bg-coral-soft border border-rose-100 text-xs font-bold text-ink/75">
            Malabar NRI Forum
          </div>
          <div className="py-4 px-5 rounded-2xl bg-coral-soft border border-rose-100 text-xs font-bold text-ink/75">
            Kudumba Care Society
          </div>
        </div>
      </section>

      {/* ============================================================================
           4. CLEAN 3x3 FEATURES SECTION (Simple Icon + Title + 1-Sentence Description)
           ============================================================================ */}
      <section id="features" className="bg-coral-soft py-20 sm:py-24 border-y border-rose-100">
        <div className="max-w-6xl mx-auto px-6">
          {/* Clean Centered Header */}
          <div className="max-w-2xl mx-auto text-center">
            <span className="inline-block px-3.5 py-1 rounded-full bg-coral/10 text-coral text-xs font-bold tracking-wider uppercase">
              HOUSEHOLD MANAGEMENT
            </span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-ink mt-3 leading-tight">
              {t.featHeading}
            </h2>
            <p className="text-sm sm:text-base text-ink-muted mt-3 leading-relaxed">
              Manage passports, visas, land tax receipts, vehicle insurance, and health policies with greater organization and control. Keep member profiles, expiry schedules, share packs, and trusted worker logs separate while managing everything from one central platform.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => openModal('Open My Vault')}
                className="text-sm font-bold text-coral hover:underline cursor-pointer"
              >
                Open My Vault →
              </button>
            </div>
          </div>

          {/* Simple, Uncluttered 3x3 Feature Cards */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-7 rounded-2xl border border-rose-100 hover:border-coral transition-colors">
              <div className="w-10 h-10 rounded-xl bg-coral/10 text-coral font-bold flex items-center justify-center text-sm mb-4">
                01
              </div>
              <h3 className="font-display font-bold text-lg text-ink">Manage Multiple Profiles From One Workspace</h3>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Organize important documents for different household members in one place.
              </p>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 hover:border-coral transition-colors">
              <div className="w-10 h-10 rounded-xl bg-sun/25 text-ink font-bold flex items-center justify-center text-sm mb-4">
                02
              </div>
              <h3 className="font-display font-bold text-lg text-ink">Build Your Family Vault Your Way</h3>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Keep family profiles and essential records organized according to your needs.
              </p>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 hover:border-coral transition-colors">
              <div className="w-10 h-10 rounded-xl bg-coral/10 text-coral font-bold flex items-center justify-center text-sm mb-4">
                03
              </div>
              <h3 className="font-display font-bold text-lg text-ink">Make Every Document Renewal Official</h3>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Keep track of expiry dates and renewal reminders for important documents.
              </p>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 hover:border-coral transition-colors">
              <div className="w-10 h-10 rounded-xl bg-sun/25 text-ink font-bold flex items-center justify-center text-sm mb-4">
                04
              </div>
              <h3 className="font-display font-bold text-lg text-ink">10-Second Emergency Retrieval</h3>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Find important records quickly when you need them.
              </p>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 hover:border-coral transition-colors">
              <div className="w-10 h-10 rounded-xl bg-coral/10 text-coral font-bold flex items-center justify-center text-sm mb-4">
                05
              </div>
              <h3 className="font-display font-bold text-lg text-ink">Empower Kerala &amp; Gulf Members to Stay on Track</h3>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Manage household documents across Kerala and Gulf-based family members.
              </p>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 hover:border-coral transition-colors">
              <div className="w-10 h-10 rounded-xl bg-sun/25 text-ink font-bold flex items-center justify-center text-sm mb-4">
                06
              </div>
              <h3 className="font-display font-bold text-lg text-ink">See What's Expiring at a Glance</h3>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Identify upcoming document expiry dates and plan renewals in advance.
              </p>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 hover:border-coral transition-colors">
              <div className="w-10 h-10 rounded-xl bg-coral/10 text-coral font-bold flex items-center justify-center text-sm mb-4">
                07
              </div>
              <h3 className="font-display font-bold text-lg text-ink">3-Tap Quick Scan, Skip the Hurry</h3>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Upload or scan documents through a simple workflow.
              </p>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 hover:border-coral transition-colors">
              <div className="w-10 h-10 rounded-xl bg-sun/25 text-ink font-bold flex items-center justify-center text-sm mb-4">
                08
              </div>
              <h3 className="font-display font-bold text-lg text-ink">Expiring Share Packs for Verification</h3>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Share selected documents for a limited period when verification is required.
              </p>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 hover:border-coral transition-colors">
              <div className="w-10 h-10 rounded-xl bg-coral/10 text-coral font-bold flex items-center justify-center text-sm mb-4">
                09
              </div>
              <h3 className="font-display font-bold text-lg text-ink">Ready-Made Kerala Workers Directory</h3>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Keep useful trusted-worker details organized and accessible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================================
           5. SIMPLE MOBILE APP BANNER
           ============================================================================ */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="bg-ink text-white rounded-3xl p-8 sm:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
          <div className="space-y-4 max-w-lg">
            <span className="inline-block px-3 py-1 rounded-full bg-sun text-ink text-xs font-bold uppercase">
              Mobile App
            </span>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl">{t.mobileHeading}</h2>
            <p className="text-sm sm:text-base text-white/80">
              Manage your household documents wherever you are.
            </p>
            <ul className="space-y-2 text-sm text-white/90 pt-1">
              <li>✓ Add, view, and organize documents easily</li>
              <li>✓ Get expiry alerts before important dates</li>
              <li>✓ Access your vault on mobile, anytime</li>
              <li>✓ Keep sensitive documents protected</li>
              <li>✓ Built for Kerala and NRI families</li>
            </ul>
          </div>

          <div className="bg-white/10 border border-white/15 rounded-2xl p-6 w-full md:w-72 text-center space-y-4 shrink-0">
            <div className="w-24 h-24 mx-auto rounded-xl bg-white text-ink flex items-center justify-center text-xs font-bold p-2">
              Verified QR Slot
            </div>
            <div className="text-xs text-white/85 font-medium">
              Scan to download Kudumba Vault for Android and iOS.
            </div>
            <button
              type="button"
              onClick={() => openModal('Get the Mobile App')}
              className="w-full py-3 rounded-full bg-coral hover:bg-coral-dark text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Get the Mobile App
            </button>
            <p className="text-[11px] text-white/55 leading-snug">
              Display app-store badges and a QR code only when the corresponding download links are available and verified.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================================
           6. CLEAN 3-COLUMN TESTIMONIALS
           ============================================================================ */}
      <section id="stories" className="bg-coral-soft py-20 border-y border-rose-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-ink">{t.testiHeading}</h2>
            <p className="text-sm sm:text-base text-ink-muted mt-2">
              What Kerala residents and Gulf NRI families say about Kudumba Vault.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-7 rounded-2xl border border-rose-100 flex flex-col justify-between">
              <p className="text-sm sm:text-base text-ink leading-relaxed">
                “The expiry radar and member-wise document management are incredible. While working in Dubai, I renewed my father’s car insurance and land tax in Kochi right on time without any last-minute panic.”
              </p>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-bold text-coral">
                Dubai ↔ Kochi NRI Household
              </div>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 flex flex-col justify-between">
              <p className="text-sm sm:text-base text-ink leading-relaxed">
                “Finally, a platform that understands what Kerala families actually need. The Expiring Share Packs make document sharing easier for verification.”
              </p>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-bold text-coral">
                Kerala Founding Household
              </div>
            </div>

            <div className="bg-white p-7 rounded-2xl border border-rose-100 flex flex-col justify-between">
              <p className="text-sm sm:text-base text-ink leading-relaxed">
                “This transformed how our joint family organizes passports, Emirates IDs, and village office certificates. Even my parents use the Malayalam interface easily on their phones.”
              </p>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-bold text-coral">
                Kerala &amp; GCC Joint Family
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-ink-muted mt-6">
            Important: Publish testimonials, customer names, locations, and ratings only when they are genuine and authorized for use.
          </p>
        </div>
      </section>

      {/* ============================================================================
           7. CLEAN 3-COLUMN PRICING SECTION (With Simple Expand Toggle)
           ============================================================================ */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-block px-3.5 py-1 rounded-full bg-coral/10 text-coral text-xs font-bold uppercase">
            Pricing &amp; Plans
          </span>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-ink mt-3">
            Simple, Transparent Household Plans
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-7 items-start">
          {/* PLAN 1: Free — Founding Household */}
          <div className="bg-white rounded-3xl border border-slate-200 p-8">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">Trial Plan</div>
            <h3 className="font-display font-bold text-xl text-ink mt-1">Free — Founding Household</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-display font-extrabold text-4xl text-ink">Free</span>
              <span className="text-xs text-ink-muted font-semibold">/ 3 days</span>
            </div>

            <ul className="mt-6 space-y-2.5 text-sm text-ink">
              <li>✓ Maximum 5 family members.</li>
              <li>✓ Only 3 GB of secure cloud storage.</li>
              <li>✓ Limited to supported Kerala and Gulf document types.</li>
              <li>✓ Free trial valid for 3 days only.</li>
              <li className="text-ink-muted">✕ No remote WhatsApp upload links.</li>
            </ul>

            {expandedPlans.morePlan1 && (
              <ul className="mt-2.5 space-y-2.5 text-sm text-ink-muted animate-fade-in">
                <li>✕ No SMS alerts.</li>
                <li>✕ No watermarked expiring Share Packs.</li>
                <li>✕ No bulk CSV import.</li>
                <li>✕ No multi-tenant client portal.</li>
                <li>✕ No automated compliance reminders.</li>
                <li>ⓘ Access and features after trial expiry are not specified.</li>
              </ul>
            )}

            <button
              type="button"
              onClick={() => togglePlanDetails('morePlan1')}
              className="mt-4 text-xs font-bold text-coral hover:underline cursor-pointer block"
            >
              {expandedPlans.morePlan1 ? 'Show less −' : 'View all plan details +'}
            </button>

            <button
              type="button"
              onClick={() => openModal('Free — Founding Household')}
              className="mt-6 w-full py-3.5 rounded-full border border-slate-300 hover:border-ink text-ink font-bold text-sm transition-colors cursor-pointer"
            >
              Start Free Trial
            </button>
          </div>

          {/* PLAN 2: Pro — NRI Family Plus (₹99/month) */}
          <div className="bg-white rounded-3xl border-2 border-coral p-8 shadow-xl relative">
            <span className="absolute -top-3.5 right-6 px-3.5 py-1 rounded-full bg-coral text-white text-[11px] font-bold uppercase">
              Popular
            </span>
            <div className="text-xs font-bold uppercase tracking-wider text-coral">NRI Family Plan</div>
            <h3 className="font-display font-bold text-xl text-ink mt-1">Pro — NRI Family Plus</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-display font-extrabold text-4xl text-ink">₹99</span>
              <span className="text-xs text-ink-muted font-semibold">/month</span>
            </div>

            <ul className="mt-6 space-y-2.5 text-sm text-ink">
              <li>✓ Maximum 12 family members.</li>
              <li>✓ Only 15 GB of high-resolution document storage.</li>
              <li>✓ WhatsApp uploads limited to remote upload links.</li>
              <li>✓ SMS alerts limited to GCC and India.</li>
              <li>✓ Share Packs are watermarked and expire.</li>
            </ul>

            {expandedPlans.morePlan2 && (
              <ul className="mt-2.5 space-y-2.5 text-sm text-ink-muted animate-fade-in">
                <li>✕ No multi-tenant client portal.</li>
                <li>✕ No bulk CSV client or policy import.</li>
                <li>✕ No automated compliance reminders.</li>
                <li>✕ No unlimited storage or family members.</li>
                <li>ⓘ Additional premium features beyond the listed scope are not specified.</li>
              </ul>
            )}

            <button
              type="button"
              onClick={() => togglePlanDetails('morePlan2')}
              className="mt-4 text-xs font-bold text-coral hover:underline cursor-pointer block"
            >
              {expandedPlans.morePlan2 ? 'Show less −' : 'View all plan details +'}
            </button>

            <button
              type="button"
              onClick={() => openModal('Pro — NRI Family Plus')}
              className="mt-6 w-full py-3.5 rounded-full bg-coral hover:bg-coral-dark text-white font-bold text-sm transition-colors cursor-pointer"
            >
              Continue with Pro →
            </button>
          </div>

          {/* PLAN 3: Partners & Societies — ₹199/month */}
          <div className="bg-white rounded-3xl border border-slate-200 p-8">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">Communities &amp; RWAs</div>
            <h3 className="font-display font-bold text-xl text-ink mt-1">Partners &amp; Societies</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-display font-extrabold text-4xl text-ink">₹199</span>
              <span className="text-xs text-ink-muted font-semibold">/month</span>
            </div>

            <ul className="mt-6 space-y-2.5 text-sm text-ink">
              <li>✓ Maximum 50 family/client seats.</li>
              <li>✓ Only 100 GB of vault storage.</li>
              <li>✓ Bulk CSV imports restricted to authorized administrators.</li>
              <li className="text-ink-muted">ⓘ Supported compliance regulations are not specified.</li>
              <li className="text-ink-muted">✕ No unlimited storage or seats.</li>
            </ul>

            {expandedPlans.morePlan3 && (
              <ul className="mt-2.5 space-y-2.5 text-sm text-ink-muted animate-fade-in">
                <li>ⓘ Additional-seat pricing is not specified.</li>
                <li>ⓘ Tenant isolation and permissions need to be clearly defined.</li>
                <li>ⓘ Features beyond the listed plan scope are not specified.</li>
              </ul>
            )}

            <button
              type="button"
              onClick={() => togglePlanDetails('morePlan3')}
              className="mt-4 text-xs font-bold text-coral hover:underline cursor-pointer block"
            >
              {expandedPlans.morePlan3 ? 'Show less −' : 'View all plan details +'}
            </button>

            <button
              type="button"
              onClick={() => openModal('Partners & Societies')}
              className="mt-6 w-full py-3.5 rounded-full border border-slate-300 hover:border-ink text-ink font-bold text-sm transition-colors cursor-pointer"
            >
              Contact Sales →
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================================
           8. SIMPLE ACCORDION FAQ (5 Questions)
           ============================================================================ */}
      <section id="faq" className="bg-coral-soft py-20 border-t border-rose-100">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-ink text-center">
            Frequently Asked Questions
          </h2>

          <div className="mt-10 space-y-3">
            {[
              {
                q: 'How do I start organizing my family documents in Kudumba Vault?',
                a: 'Create your account, set up your family vault, and start uploading or scanning important documents.',
              },
              {
                q: 'Is there a free trial available for households?',
                a: 'Check the current Plans & Pricing page for the available free tier or trial terms.',
              },
              {
                q: 'Can I manage documents for multiple family members across Kerala and the Gulf?',
                a: 'Kudumba Vault is designed to help families organize documents across household members. Access depends on the features and permissions available in your account.',
              },
              {
                q: 'Is technical knowledge required for elderly parents?',
                a: 'The interface is designed to make document organization straightforward, with simple navigation and clear actions.',
              },
              {
                q: 'How secure is our family data and Aadhaar numbers?',
                a: 'Kudumba Vault protects sensitive information using its implemented authentication, access controls, secure storage, and encryption measures.',
              },
            ].map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-rose-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleFaq(i)}
                  className="w-full px-6 py-5 text-left font-bold text-sm sm:text-base text-ink flex items-center justify-between gap-4 cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <span className="text-coral font-bold text-lg">{openFaqIndex === i ? '−' : '+'}</span>
                </button>
                {openFaqIndex === i && (
                  <div className="px-6 pb-5 text-sm text-ink-muted leading-relaxed animate-fade-in">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================================
           9. CLEAN FINAL CALL TO ACTION
           ============================================================================ */}
      <section className="coral-wave-bg py-20 text-white text-center px-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <h2 className="font-display font-extrabold text-3xl sm:text-5xl">{t.finalCtaHeading}</h2>
          <p className="text-base sm:text-lg text-white/90">
            Join families using Kudumba Vault to organize their important documents and keep track of renewals.
          </p>
          <div className="pt-3 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => openModal('Enter Kudumba Vault')}
              className="px-8 py-4 rounded-full bg-ink text-white hover:bg-ink/90 font-bold text-sm sm:text-base transition-colors cursor-pointer"
            >
              Enter Kudumba Vault →
            </button>
            <button
              type="button"
              onClick={() => openModal('Talk to Us')}
              className="px-8 py-4 rounded-full bg-white text-ink hover:bg-sun font-bold text-sm sm:text-base transition-colors cursor-pointer"
            >
              Talk to Us
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================================
           10. SIMPLE DARK FOOTER
           ============================================================================ */}
      <footer className="bg-ink text-white py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-white/10">
            <div className="lg:col-span-1 space-y-3">
              <div className="font-display font-extrabold text-xl">
                <span>KUDUMBA</span>
                <span className="text-sun">VAULT</span>
              </div>
              <p className="text-xs text-white/65 leading-relaxed">
                A secure document management platform for families. Keep your important documents organized, safe, and always accessible.
              </p>
            </div>

            <div className="space-y-2 text-xs text-white/75">
              <div className="font-bold text-white uppercase tracking-wider mb-3">Product</div>
              <div>
                <a href="#features" className="hover:text-sun transition-colors">
                  Features
                </a>
              </div>
              <div>
                <a href="#pricing" className="hover:text-sun transition-colors">
                  Pricing
                </a>
              </div>
              <div>
                <a href="#faq" className="hover:text-sun transition-colors">
                  Security
                </a>
              </div>
              <div>
                <a href="#why-vault" className="hover:text-sun transition-colors">
                  Mobile App
                </a>
              </div>
            </div>

            <div className="space-y-2 text-xs text-white/75">
              <div className="font-bold text-white uppercase tracking-wider mb-3">Household</div>
              <div>
                <a href="#why-vault" className="hover:text-sun transition-colors">
                  Family Dashboard
                </a>
              </div>
              <div>
                <a href="#features" className="hover:text-sun transition-colors">
                  Member Profiles
                </a>
              </div>
              <div>
                <a href="#pricing" className="hover:text-sun transition-colors">
                  Pricing &amp; Plans
                </a>
              </div>
              <div>
                <a href="#stories" className="hover:text-sun transition-colors">
                  Family Stories
                </a>
              </div>
              <div>
                <a href="#faq" className="hover:text-sun transition-colors">
                  Security FAQ
                </a>
              </div>
            </div>

            <div className="space-y-2 text-xs text-white/75">
              <div className="font-bold text-white uppercase tracking-wider mb-3">Support</div>
              <div>
                <a href="#faq" className="hover:text-sun transition-colors">
                  Help Center
                </a>
              </div>
              <div>
                <a href="#features" className="hover:text-sun transition-colors">
                  Documentation
                </a>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => openModal('Contact Us')}
                  className="hover:text-sun transition-colors cursor-pointer"
                >
                  Contact Us
                </button>
              </div>
              <div>
                <span className="text-emerald-400">● System Status</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="font-bold text-white uppercase tracking-wider">Stay Updated</div>
              <p className="text-white/65">Get the latest updates and features.</p>
              <form onSubmit={handleFooterSubscribe} className="flex flex-col gap-2">
                <input
                  type="email"
                  required
                  value={footerEmail}
                  onChange={(e) => setFooterEmail(e.target.value)}
                  placeholder="Email address"
                  className="px-3.5 py-2.5 rounded-lg bg-white/10 border border-white/15 text-white placeholder:text-white/45 focus:outline-none focus:border-sun"
                />
                <button
                  type="submit"
                  className="py-2.5 rounded-lg bg-white text-ink font-bold hover:bg-sun transition-colors cursor-pointer"
                >
                  Subscribe
                </button>
              </form>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/50">
            <div>© 2026 Kudumba Vault. All rights reserved.</div>
            <div className="flex items-center gap-6">
              <a href="#faq" className="hover:text-white transition-colors">
                Privacy Policy
              </a>
              <a href="#faq" className="hover:text-white transition-colors">
                Terms of Service
              </a>
              <a href="#faq" className="hover:text-white transition-colors">
                Refund Policy
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Toast Notification */}
      {toastVisible && (
        <div className="fixed bottom-5 right-5 z-50 bg-ink text-white px-5 py-3 rounded-full shadow-2xl border border-white/15 text-xs font-semibold flex items-center gap-2.5 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-sun" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Real Full-Featured Auth Modal for Sign In, Registration, Recovery & OTP */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          if (
            typeof window !== 'undefined' &&
            (window.location.pathname === '/login' ||
              window.location.pathname === '/signin' ||
              window.location.pathname === '/register' ||
              window.location.pathname === '/signup')
          ) {
            window.history.replaceState(null, '', '/welcome');
          }
        }}
        lang={lang}
        initialMode={authMode}
        onSuccess={() => {
          setIsAuthModalOpen(false);
          onEnterApp();
        }}
      />
    </div>
  );
};
