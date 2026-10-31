import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './modals/AuthModal';

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

  // Pro Plan Billing Cycle: 3 months (default), 6 months, 1 year
  const [proCycle, setProCycle] = useState<'3m' | '6m' | '1y'>('3m');

  // Expandable plan specs: card 0, card 1, card 2
  const [expandedPlans, setExpandedPlans] = useState<{ [key: number]: boolean }>({
    0: true,
    1: true,
    2: true,
  });

  // FAQ Accordion: card 0 open by default
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
    }, 3500);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  const toggleLanguage = () => {
    if (lang === 'en') {
      setLang('ml');
      showToast('മലയാളം ഇന്റർഫേസ് സജീവമാക്കി');
    } else {
      setLang('en');
      showToast('Switched to English');
    }
  };

  const togglePlanFeatures = (cardIndex: number) => {
    setExpandedPlans((prev) => ({
      ...prev,
      [cardIndex]: !prev[cardIndex],
    }));
  };

  const toggleFaqItem = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
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
        targetOrHeading.toLowerCase().includes('signup'))
    ) {
      openLoginModal('register');
    } else {
      openLoginModal('login');
    }
  };

  const handleOpenAuth = (mode: 'login' | 'register' = 'login') => {
    openLoginModal(mode);
  };

  const handleFooterSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!footerEmail) return;
    showToast(`Subscribed ${footerEmail}!`);
    setFooterEmail('');
  };

  // Pricing values based on selected cycle
  const getProPriceDetails = () => {
    switch (proCycle) {
      case '6m':
        return { price: '₹1,399', period: '/6 months', savings: 'You save ₹3,000 today' };
      case '1y':
        return { price: '₹2,499', period: '/year', savings: 'You save ₹6,000 today' };
      case '3m':
      default:
        return { price: '₹249', period: '/month', savings: 'You save ₹1,500 today' };
    }
  };

  const proDetails = getProPriceDetails();

  return (
    <div className="selection:bg-festYellow selection:text-black font-sans bg-[#FF4C54] text-[#111111] overflow-x-hidden min-h-screen">
      {/* ============================================================================
           SHARED 3D SVG DEFS: EXACT MASCOT AVATAR & VOXEL TROPHY
           ============================================================================ */}
      <svg className="hidden" width="0" height="0" aria-hidden="true">
        <defs>
          {/* Red Rounded Helmet 3D Shading */}
          <radialGradient id="helmetRed3D" cx="38%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#FF7A82" />
            <stop offset="45%" stopColor="#EE2B3B" />
            <stop offset="100%" stopColor="#A8101E" />
          </radialGradient>
          {/* Left Warm Yellow Capsule Half */}
          <linearGradient id="bodyYellow3D" x1="15%" y1="15%" x2="85%" y2="90%">
            <stop offset="0%" stopColor="#FFE373" />
            <stop offset="55%" stopColor="#F7C23E" />
            <stop offset="100%" stopColor="#D49212" />
          </linearGradient>
          {/* Right Soft Cream-White Capsule Half */}
          <linearGradient id="bodyCream3D" x1="10%" y1="15%" x2="90%" y2="90%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="60%" stopColor="#FFF4E4" />
            <stop offset="100%" stopColor="#E2CEB7" />
          </linearGradient>
          {/* Cute White Face Visor */}
          <linearGradient id="faceVisor3D" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="82%" stopColor="#F9F1E8" />
            <stop offset="100%" stopColor="#E5D6C7" />
          </linearGradient>
          {/* Dark Charcoal Tubular Limbs */}
          <linearGradient id="darkLimb3D" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3F3236" />
            <stop offset="55%" stopColor="#231A1D" />
            <stop offset="100%" stopColor="#110C0E" />
          </linearGradient>
          {/* Soft 3D Character Shadow */}
          <filter id="charDropShadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="16" stdDeviation="12" floodColor="#7A0B14" floodOpacity="0.38" />
          </filter>
          <filter id="cardDropShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000000" floodOpacity="0.16" />
          </filter>

          {/* Reusable Master 3D Mascot Symbol */}
          <g id="kudumbaMascot3D">
            {/* Soft Ground Shadow */}
            <ellipse cx="165" cy="316" rx="68" ry="13" fill="rgba(0,0,0,0.20)" />

            {/* Left Leg & Cream Sneaker */}
            <path d="M136 244 L123 292" stroke="url(#darkLimb3D)" strokeWidth="22" strokeLinecap="round" />
            <g transform="translate(95, 282)">
              <rect x="0" y="5" width="48" height="25" rx="12.5" fill="url(#bodyCream3D)" />
              <path d="M3 22 Q24 26 45 22" stroke="#D5C2AE" strokeWidth="3" fill="none" />
              <line x1="15" y1="13" x2="28" y2="13" stroke="#231A1D" strokeWidth="3.2" strokeLinecap="round" />
            </g>

            {/* Right Leg & Cream Sneaker */}
            <path d="M190 244 L203 292" stroke="url(#darkLimb3D)" strokeWidth="22" strokeLinecap="round" />
            <g transform="translate(182, 282)">
              <rect x="0" y="5" width="48" height="25" rx="12.5" fill="url(#bodyCream3D)" />
              <path d="M3 22 Q24 26 45 22" stroke="#D5C2AE" strokeWidth="3" fill="none" />
              <line x1="18" y1="13" x2="31" y2="13" stroke="#231A1D" strokeWidth="3.2" strokeLinecap="round" />
            </g>

            {/* Right Arm (Viewer's Left) Holding Document Sheet */}
            <path d="M94 185 C62 204, 48 184, 43 160" stroke="url(#darkLimb3D)" strokeWidth="21" strokeLinecap="round" fill="none" />

            {/* White Document Sheet with 5 Gray Lines */}
            <g transform="translate(12, 92) rotate(-14)">
              <rect x="0" y="0" width="60" height="78" rx="7" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" filter="url(#cardDropShadow)" />
              <line x1="12" y1="17" x2="35" y2="17" stroke="#94A3B8" strokeWidth="4.2" strokeLinecap="round" />
              <line x1="12" y1="29" x2="48" y2="29" stroke="#CBD5E1" strokeWidth="3.8" strokeLinecap="round" />
              <line x1="12" y1="41" x2="48" y2="41" stroke="#CBD5E1" strokeWidth="3.8" strokeLinecap="round" />
              <line x1="12" y1="53" x2="45" y2="53" stroke="#CBD5E1" strokeWidth="3.8" strokeLinecap="round" />
              <line x1="12" y1="65" x2="41" y2="65" stroke="#CBD5E1" strokeWidth="3.8" strokeLinecap="round" />
            </g>
            {/* Round Cream Glove Holding Document */}
            <circle cx="40" cy="160" r="20" fill="url(#bodyCream3D)" />

            {/* Left Arm (Viewer's Right) Waving Up */}
            <path d="M232 184 C264 196, 276 168, 272 136" stroke="url(#darkLimb3D)" strokeWidth="21" strokeLinecap="round" fill="none" />
            {/* Round Cream Waving Glove */}
            <circle cx="272" cy="130" r="21" fill="url(#bodyCream3D)" />
            <circle cx="256" cy="133" r="9" fill="url(#bodyCream3D)" />

            {/* Top Red Antenna Stalk & Red Ball */}
            <path d="M168 56 Q173 36 164 26" stroke="#231A1D" strokeWidth="7.5" strokeLinecap="round" fill="none" />
            <circle cx="162" cy="22" r="12.5" fill="url(#helmetRed3D)" />
            <circle cx="158" cy="18" r="3.5" fill="#FFB3B8" opacity="0.85" />

            {/* Side Capsule Ear Bumps */}
            <ellipse cx="86" cy="154" rx="10" ry="18" fill="#F59E0B" />
            <ellipse cx="242" cy="154" rx="10" ry="18" fill="url(#bodyCream3D)" />

            {/* Capsule Body Clip */}
            <clipPath id="capsuleMask">
              <rect x="88" y="54" width="152" height="202" rx="76" />
            </clipPath>

            {/* Split Capsule Body */}
            <g clipPath="url(#capsuleMask)">
              <rect x="88" y="120" width="76" height="140" fill="url(#bodyYellow3D)" />
              <rect x="164" y="120" width="76" height="140" fill="url(#bodyCream3D)" />
              <path d="M80 156 C80 70, 248 70, 248 156 L248 145 C215 122, 115 122, 80 145 Z" fill="url(#helmetRed3D)" />
              <rect x="84" y="48" width="160" height="94" fill="url(#helmetRed3D)" />
              <ellipse cx="144" cy="76" rx="46" ry="16" fill="#FFFFFF" opacity="0.24" transform="rotate(-8 144 76)" />
            </g>

            {/* Cute Rounded White Face Visor */}
            <rect x="108" y="102" width="112" height="72" rx="34" fill="url(#faceVisor3D)" stroke="#991B1B" strokeWidth="2" />

            {/* Glossy Oval Eyes & Smile */}
            <ellipse cx="143" cy="136" rx="6.8" ry="10" fill="#1E1417" />
            <circle cx="141" cy="132" r="2.4" fill="#FFFFFF" />

            <ellipse cx="185" cy="136" rx="6.8" ry="10" fill="#1E1417" />
            <circle cx="183" cy="132" r="2.4" fill="#FFFFFF" />

            <path d="M156 147 Q164 155 172 147" stroke="#1E1417" strokeWidth="4.2" strokeLinecap="round" fill="none" />

            {/* Black Lanyard Strap */}
            <path d="M144 173 L156 205 L172 173" stroke="#231A1D" strokeWidth="3.6" strokeLinejoin="round" fill="none" />

            {/* White Lanyard ID Card with Red/Dark/Green House + White Keyhole */}
            <g transform="translate(134, 195) rotate(3)" filter="url(#cardDropShadow)">
              <rect x="0" y="0" width="47" height="51" rx="8" fill="#FFFFFF" stroke="#F1F5F9" strokeWidth="1.5" />
              <rect x="18" y="4" width="11" height="3" rx="1.5" fill="#94A3B8" />
              <path d="M23.5 13 L10 24.5 H14 V39 H33 V24.5 H37 L23.5 13 Z" fill="#E11D48" />
              <path d="M14 25 L23.5 17 L23.5 39 H14 Z" fill="#1E1B18" />
              <path d="M23.5 26 C23.5 26 33 25 33 39 H23.5 Z" fill="#15803D" opacity="0.9" />
              <circle cx="23.5" cy="27.5" r="3.3" fill="#FFFFFF" />
              <path d="M21.8 29.5 L20.8 37 H26.2 L25.2 29.5 Z" fill="#FFFFFF" />
            </g>
          </g>
        </defs>
      </svg>

      {/* ============================================================================
           SECTION 1: TOP NAVIGATION BAR
           ============================================================================ */}
      <header className="festie-red-topo pt-5 pb-3 relative z-40">
        <div className="max-w-[1280px] mx-auto px-6 sm:px-10 flex items-center justify-between">
          {/* Left: Condensed Uppercase Logo "KUDUMBAVAULT" */}
          <a href="#" className="festie-hero-title text-2xl sm:text-[28px] tracking-normal flex items-center select-none">
            <span className="text-white">KUDUMBA</span>
            <span className="text-festYellow">VAULT</span>
          </a>

          {/* Center: Clean White Links */}
          <nav className="hidden md:flex items-center gap-9 text-[14px] font-medium text-white">
            <a href="#features" className="hover:opacity-80 transition-opacity">
              Features
            </a>
            <a href="#why-vault" className="hover:opacity-80 transition-opacity">
              Why Vault
            </a>
            <a href="#stories" className="hover:opacity-80 transition-opacity">
              Stories
            </a>
            <a href="#pricing" className="hover:opacity-80 transition-opacity">
              Pricing
            </a>
            <a href="#faq" className="hover:opacity-80 transition-opacity">
              FAQ
            </a>
            <button
              type="button"
              onClick={toggleLanguage}
              className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-[12px] font-semibold text-white transition-all cursor-pointer"
            >
              {lang === 'ml' ? 'EN / മലയാളം ✓' : 'മലയാളം / EN'}
            </button>
          </nav>

          {/* Right: Sign In & Solid White Pill Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => openLoginModal('login')}
              className="hidden sm:inline-flex text-white hover:text-white/80 font-bold text-[13px] sm:text-[14px] px-3 py-2 cursor-pointer transition-colors"
            >
              {lang === 'ml' ? 'ലോഗിൻ' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => openLoginModal('login')}
              className="bg-white hover:bg-gray-50 text-[#111111] font-semibold text-[13px] sm:text-[14px] px-5 sm:px-6 py-2.5 rounded-full shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <span>{lang === 'ml' ? 'കുടുംബ വോൾട്ട്' : 'Enter Kudumba Vault'}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================================
           SECTION 2: HERO SECTION
           ============================================================================ */}
      <section className="festie-red-topo relative pt-4 pb-16 sm:pt-8 sm:pb-24 overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 relative z-10 text-center">
          {/* Subtle Top Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/15 border border-white/25 text-white text-xs font-semibold mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-festYellow" />
            <span>
              {lang === 'ml'
                ? 'കുടുംബ ഡോക്യുമെന്റ് വോൾട്ട് — എളുപ്പത്തിലും സുരക്ഷിതമായും'
                : 'Household Document Vault Made Easy'}
            </span>
          </div>

          {/* MASSIVE CONDENSED TWO-LINE HEADLINE: "MAKE YOUR / VAULT ALIVE" */}
          <div className="relative max-w-[1120px] mx-auto">
            <h1 className="festie-hero-title text-[4.8rem] sm:text-[8.2rem] md:text-[10.8rem] lg:text-[12.6rem] select-none">
              <span className="block">
                <span className="text-[#050505]">MAKE</span>
                <span className="text-festYellow ml-2 sm:ml-6">YOUR</span>
              </span>
              <span className="block text-white mt-1 sm:mt-2">VAULT ALIVE</span>
            </h1>

            {/* LEFT FLOATING 3D CAPSULE MASCOT */}
            <div className="hidden lg:block absolute -left-14 xl:-left-20 -bottom-24 w-[240px] xl:w-[275px] mascot-float pointer-events-none z-20">
              <svg viewBox="0 0 320 340" className="w-full h-auto" filter="url(#charDropShadow)">
                <use href="#kudumbaMascot3D" />
              </svg>
            </div>

            {/* RIGHT FLOATING 3D VOXEL TROPHY */}
            <div className="hidden lg:block absolute -right-8 xl:-right-12 -bottom-28 w-[195px] xl:w-[225px] trophy-float pointer-events-none z-20">
              <svg viewBox="0 0 240 240" className="w-full h-auto" filter="url(#charDropShadow)">
                <g transform="translate(10, 10)">
                  {/* Voxel Trophy Pedestal Base */}
                  <polygon points="55,185 165,192 155,206 45,199" fill="#D97706" />
                  <polygon points="45,172 155,179 165,192 55,185" fill="#F59E0B" />
                  <rect x="52" y="172" width="102" height="14" fill="#F59E0B" />
                  <rect x="66" y="158" width="74" height="14" fill="#FBBF24" />
                  {/* Voxel Stem */}
                  <rect x="88" y="128" width="30" height="30" fill="#F59E0B" />
                  <rect x="94" y="128" width="18" height="30" fill="#FBBF24" />
                  {/* Voxel Cup Main Body */}
                  <rect x="52" y="42" width="102" height="74" fill="#F59E0B" />
                  <rect x="64" y="34" width="78" height="12" fill="#FBBF24" />
                  <rect x="64" y="114" width="78" height="14" fill="#D97706" />
                  {/* Voxel Grid Face Shading */}
                  <g fill="#FBBF24" stroke="#D97706" strokeWidth="0.8">
                    <rect x="58" y="44" width="18" height="18" />
                    <rect x="76" y="44" width="18" height="18" />
                    <rect x="94" y="44" width="18" height="18" />
                    <rect x="112" y="44" width="18" height="18" />
                    <rect x="130" y="44" width="18" height="18" />
                    <rect x="58" y="62" width="18" height="18" />
                    <rect x="76" y="62" width="18" height="18" />
                    <rect x="94" y="62" width="18" height="18" />
                    <rect x="112" y="62" width="18" height="18" />
                    <rect x="130" y="62" width="18" height="18" />
                    <rect x="58" y="80" width="18" height="18" />
                    <rect x="76" y="80" width="18" height="18" />
                    <rect x="94" y="80" width="18" height="18" />
                    <rect x="112" y="80" width="18" height="18" />
                    <rect x="130" y="80" width="18" height="18" />
                    <rect x="66" y="98" width="74" height="16" />
                  </g>
                  {/* Left Voxel Handle */}
                  <rect x="26" y="50" width="26" height="14" fill="#D97706" />
                  <rect x="20" y="64" width="16" height="32" fill="#B45309" />
                  <rect x="26" y="96" width="26" height="14" fill="#D97706" />
                  {/* Right Voxel Handle */}
                  <rect x="154" y="50" width="26" height="14" fill="#F59E0B" />
                  <rect x="168" y="64" width="16" height="32" fill="#D97706" />
                  <rect x="154" y="96" width="26" height="14" fill="#B45309" />
                  {/* Pink Pixel "#1" Center Emblem */}
                  <rect x="98" y="56" width="12" height="36" fill="#FF6584" />
                  <rect x="90" y="62" width="8" height="10" fill="#FF6584" />
                  <rect x="88" y="90" width="32" height="10" fill="#FF6584" />
                </g>
              </svg>
            </div>
          </div>

          {/* Mobile Mascot Display */}
          <div className="lg:hidden flex justify-center mt-4">
            <div className="w-40 mascot-float">
              <svg viewBox="0 0 320 340" className="w-full h-auto" filter="url(#charDropShadow)">
                <use href="#kudumbaMascot3D" />
              </svg>
            </div>
          </div>

          {/* Center Paragraph */}
          <p className="max-w-[680px] mx-auto mt-8 sm:mt-10 text-[15px] sm:text-[17.5px] text-white font-medium leading-[1.55]">
            {lang === 'ml'
              ? 'ആധാർ, പാസ്പോർട്ട്, എമിറേറ്റ്സ് ഐഡി, ഭൂനികുതി രസീതുകൾ, വാഹന ആർസി, ഇൻഷുറൻസ് പോളിസികൾ — കേരളത്തിലെയും പ്രവാസി കുടുംബങ്ങൾക്കും ആവശ്യമായതെല്ലാം ഒരൊറ്റ വോൾട്ടിൽ.'
              : 'Trusted by 1,200+ protected households to run family documentation without chaos. Store Aadhaar, Passports, Emirates IDs, Land Tax receipts, Vehicle RC, Health Policies & Trusted Workers — everything on one desk, built for Kerala & NRI families.'}
          </p>

          {/* Dual Centered Pill Buttons */}
          <div className="mt-9 flex items-center justify-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => openModal('Enter Kudumba Vault')}
              className="bg-[#141414] hover:bg-black text-white font-semibold text-[14px] sm:text-[15px] px-8 py-3.5 rounded-full shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer"
            >
              Enter Kudumba Vault
            </button>
            <button
              type="button"
              onClick={() => openModal('Try Share Packs')}
              className="bg-white hover:bg-gray-50 text-[#141414] font-semibold text-[14px] sm:text-[15px] px-8 py-3.5 rounded-full shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer"
            >
              Try Share Packs
            </button>
          </div>

          {/* 3 Micro Checkmarks */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[12px] text-white/90 font-medium">
            <span>✓ No credit card required</span>
            <span>•</span>
            <span>✓ Quick 10s setup</span>
            <span>•</span>
            <span>✓ Built for Kerala &amp; NRI families</span>
          </div>
        </div>
      </section>

      {/* ============================================================================
           SECTION 3: 3D YELLOW MONITOR & METRICS
           ============================================================================ */}
      <section id="why-vault" className="bg-festRed py-20 sm:py-28 relative overflow-hidden">
        <div className="max-w-[1240px] mx-auto px-6 sm:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-6 items-center">
            {/* LEFT COLUMN */}
            <div className="lg:col-span-4 text-white text-left">
              <div className="w-24 h-20 mb-2 relative select-none pointer-events-none opacity-85">
                <div className="w-20 h-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/25 flex flex-col items-center justify-center shadow-inner transform -rotate-6">
                  <div className="w-8 h-2 rounded bg-festRed/70 mb-1" />
                  <div className="text-[8px] font-black tracking-widest text-white/90">VAULT</div>
                </div>
              </div>

              <h2 className="text-[34px] sm:text-[42px] font-extrabold tracking-tight leading-[1.12] text-white">
                Pull the right
                <br />
                strings.
              </h2>
              <p className="mt-2.5 text-[16px] sm:text-[18px] font-medium text-white/90">Don’t break a sweat.</p>
              <p className="mt-4 text-[14px] sm:text-[15px] text-white/85 leading-[1.6] max-w-[330px]">
                Kudumba Vault keeps every moving part in your hands — so you can protect vital records for parents in Kerala
                and family in the Gulf, not chase scattered details.
              </p>

              {/* Bottom Left 3 Overlapping Circular Avatars */}
              <a href="#stories" className="mt-12 inline-flex items-center gap-3.5 group">
                <div className="flex -space-x-2.5">
                  <div className="w-11 h-11 rounded-full bg-white p-0.5 shadow-md">
                    <svg viewBox="0 0 40 40" className="w-full h-full rounded-full bg-gray-200">
                      <circle cx="20" cy="14" r="7" fill="#1F2937" />
                      <path d="M7 38 C7 27, 33 27, 33 38" fill="#111827" />
                    </svg>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-white p-0.5 shadow-md">
                    <svg viewBox="0 0 40 40" className="w-full h-full rounded-full bg-gray-100">
                      <circle cx="20" cy="14" r="7" fill="#374151" />
                      <path d="M7 38 C7 27, 33 27, 33 38" fill="#1F2937" />
                    </svg>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-white p-0.5 shadow-md">
                    <svg viewBox="0 0 40 40" className="w-full h-full rounded-full bg-gray-200">
                      <circle cx="20" cy="14" r="7" fill="#111827" />
                      <path d="M7 38 C7 27, 33 27, 33 38" fill="#030712" />
                    </svg>
                  </div>
                </div>
                <div>
                  <div className="text-[13.5px] font-bold text-white group-hover:underline">Hear from the families</div>
                  <div className="text-[12px] text-white/80">What Kerala &amp; NRI households say</div>
                </div>
              </a>
            </div>

            {/* CENTER COLUMN: 3D Mascot Standing Beside Tilted 3D Yellow Monitor */}
            <div className="lg:col-span-5 relative flex items-center justify-center py-6">
              <div className="w-[140px] sm:w-[165px] -mr-10 sm:-mr-12 z-20 self-end mb-1 mascot-float">
                <svg viewBox="0 0 320 340" className="w-full h-auto" filter="url(#charDropShadow)">
                  <use href="#kudumbaMascot3D" />
                </svg>
              </div>

              {/* 3D Perspective Yellow Monitor */}
              <div className="festie-monitor-scene w-full max-w-[430px] z-10">
                <div className="festie-monitor-box p-3 sm:p-4 relative">
                  {/* Side Vents & Vertical Brand Stamp */}
                  <div className="hidden sm:flex flex-col items-center justify-between absolute -right-4 top-8 bottom-8 w-4 py-4 select-none pointer-events-none">
                    <span className="text-[8px] font-black text-white/80 tracking-widest rotate-90">VAULT</span>
                    <div className="space-y-1">
                      <div className="w-2.5 h-0.5 bg-amber-800/50 rounded" />
                      <div className="w-2.5 h-0.5 bg-amber-800/50 rounded" />
                      <div className="w-2.5 h-0.5 bg-amber-800/50 rounded" />
                      <div className="w-2.5 h-0.5 bg-amber-800/50 rounded" />
                      <div className="w-2.5 h-0.5 bg-amber-800/50 rounded" />
                      <div className="w-2.5 h-0.5 bg-amber-800/50 rounded" />
                    </div>
                  </div>

                  {/* White Dashboard Screen Inside Monitor */}
                  <div className="bg-white rounded-xl overflow-hidden shadow-inner flex min-h-[235px] sm:min-h-[260px] text-gray-800 text-left">
                    {/* Left Mini Sidebar */}
                    <div className="w-14 sm:w-16 bg-gray-50/90 border-r border-gray-100 p-2 flex flex-col justify-between text-[7px] text-gray-500 font-semibold">
                      <div className="space-y-2">
                        <div className="font-black text-[8px] text-festRed tracking-tight">VAULT</div>
                        <div className="px-1.5 py-1 rounded bg-rose-50 text-festRed font-bold">Dashboard</div>
                        <div className="px-1.5 py-0.5">Members</div>
                        <div className="px-1.5 py-0.5">Passports</div>
                        <div className="px-1.5 py-0.5">Land Tax</div>
                        <div className="px-1.5 py-0.5">Policies</div>
                        <div className="px-1.5 py-0.5">Workers</div>
                      </div>
                      <div className="flex items-center gap-1 pt-2 border-t border-gray-200">
                        <span className="w-3 h-3 rounded-full bg-gray-800 inline-block" />
                        <span className="truncate">Kochi</span>
                      </div>
                    </div>

                    {/* Right Main Dashboard Workspace */}
                    <div className="flex-1 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[7px] text-gray-400">Household Workspace</div>
                          <div className="text-[10px] font-extrabold text-gray-900">Kudumba Vault · Nair Family</div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-festRed text-white text-[7px] font-bold">+ Quick Scan</span>
                      </div>

                      {/* 4 Pastel Cards Row */}
                      <div className="grid grid-cols-4 gap-1.5">
                        <div className="bg-rose-100/80 p-2 rounded-lg">
                          <div className="text-[10px] font-extrabold text-gray-900">18+</div>
                          <div className="text-[6.5px] text-gray-600">Doc Types</div>
                        </div>
                        <div className="bg-sky-100/80 p-2 rounded-lg">
                          <div className="text-[10px] font-extrabold text-gray-900">10s</div>
                          <div className="text-[6.5px] text-gray-600">Retrieval</div>
                        </div>
                        <div className="bg-purple-100/80 p-2 rounded-lg">
                          <div className="text-[10px] font-extrabold text-gray-900">5</div>
                          <div className="text-[6.5px] text-gray-600">Profiles</div>
                        </div>
                        <div className="bg-emerald-100/90 p-2 rounded-lg">
                          <div className="text-[10px] font-extrabold text-gray-900">60·30·7d</div>
                          <div className="text-[6.5px] text-gray-600">Expiry Radar</div>
                        </div>
                      </div>

                      {/* Black Pill Strip */}
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-gray-950 text-white text-[7px] font-bold">
                          Aadhaar &amp; Emirates ID
                        </span>
                        <span className="text-[7px] text-gray-500">Land Tax</span>
                        <span className="text-[7px] text-gray-500">Vehicle RC</span>
                        <span className="text-[7px] text-gray-500">Share Packs</span>
                      </div>

                      {/* Bottom Chart + Progress Bars */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100">
                        <div>
                          <div className="text-[7px] font-bold text-gray-600 mb-1">Expiry Radar Curve</div>
                          <svg viewBox="0 0 100 42" className="w-full h-10">
                            <path d="M5 40 C30 40, 55 38, 65 8 C70 2, 74 25, 78 40 Z" fill="rgba(59,130,246,0.14)" />
                            <path d="M5 40 C30 40, 55 38, 65 8 C70 2, 74 25, 78 40" stroke="#3B82F6" strokeWidth="1.8" fill="none" />
                          </svg>
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-[7px] font-bold text-gray-600">Renewal Status</div>
                          <div>
                            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full w-11/12 bg-amber-500" />
                            </div>
                          </div>
                          <div>
                            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full w-4/5 bg-sky-500" />
                            </div>
                          </div>
                          <div>
                            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full w-full bg-emerald-500" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Monitor Bottom Bezel Dots */}
                  <div className="flex justify-end items-center gap-1.5 mt-2 pr-3">
                    <span className="w-2 h-1.5 rounded-full bg-white" />
                    <span className="w-2 h-1.5 rounded-full bg-white" />
                    <span className="w-3 h-1.5 rounded-full bg-white" />
                  </div>
                </div>

                {/* 3D Yellow Monitor Neck & Flat Stand */}
                <div
                  className="mx-auto w-20 h-6 bg-[#EAB308] shadow-inner"
                  style={{ transform: 'perspective(250px) rotateX(20deg)' }}
                />
                <div className="mx-auto w-32 h-3 bg-[#FFD12E] rounded-full shadow-lg -mt-1 border-b-2 border-[#D99B00]" />
              </div>
            </div>

            {/* RIGHT COLUMN: Giant Metric + 2x2 Verified Figures Grid */}
            <div className="lg:col-span-3 text-white lg:pl-6 text-left">
              <div className="pb-6 border-b border-white/25">
                <div className="text-[54px] sm:text-[68px] font-extrabold leading-none tracking-tight">1,200+</div>
                <div className="text-[14px] font-bold text-white/95 mt-2">Protected Households</div>
              </div>

              <div className="grid grid-cols-2 gap-y-7 gap-x-6 pt-7">
                <div>
                  <div className="text-[26px] sm:text-[30px] font-extrabold leading-tight">10 Sec</div>
                  <div className="text-[12px] text-white/85 mt-0.5">Emergency Retrieval</div>
                </div>
                <div>
                  <div className="text-[26px] sm:text-[30px] font-extrabold leading-tight">18+ Docs</div>
                  <div className="text-[12px] text-white/85 mt-0.5">Kerala &amp; NRI Types</div>
                </div>
                <div>
                  <div className="text-[26px] sm:text-[30px] font-extrabold leading-tight">60·30·7d</div>
                  <div className="text-[12px] text-white/85 mt-0.5">Smart Expiry Alerts</div>
                </div>
                <div>
                  <div className="text-[26px] sm:text-[30px] font-extrabold leading-tight">1,200+</div>
                  <div className="text-[12px] text-white/85 mt-0.5">Protected Households</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================================
           SECTION 4: WHITE COMMUNITY LOGOS BANNER & STAGGERED 3-COL BENTO GRID
           ============================================================================ */}
      <section id="features" className="bg-festRed pt-2 pb-16">
        <div className="max-w-[1260px] mx-auto px-4 sm:px-8">
          {/* TOP ROUNDED WHITE BANNER WITH 6 LOGOS */}
          <div className="bg-white rounded-[26px] px-6 sm:px-12 py-8 sm:py-10 shadow-xl mb-16">
            <div className="text-center mb-5">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                Trusted by amazing Kerala &amp; NRI communities
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 items-center justify-items-center">
              {/* 1. kuDumba wordmark */}
              <div className="text-left leading-none">
                <div className="text-[28px] sm:text-[34px] font-black tracking-tight bg-gradient-to-r from-amber-200 via-sky-500 to-rose-500 bg-clip-text text-transparent">
                  kuDumba
                </div>
                <div className="text-[10.5px] font-medium text-gray-500 tracking-wide mt-0.5">
                  Kerala Family Vault 2026
                </div>
              </div>

              {/* 2. PravasiNet */}
              <div className="flex items-center gap-2">
                <div className="grid grid-cols-2 gap-0.5 text-[10px] font-black leading-none text-sky-600 bg-amber-50 p-1.5 rounded border border-amber-200">
                  <span>കു</span>
                  <span className="text-rose-500">ടും</span>
                  <span className="text-emerald-600">ബം</span>
                  <span className="text-amber-500">26</span>
                </div>
                <div className="text-left">
                  <div className="text-[15px] font-black tracking-tight text-gray-900">
                    PRAVASI<span className="text-rose-500">NET</span>
                  </div>
                  <div className="text-[7.5px] text-gray-400 font-semibold">Gulf &amp; Kerala NRI Network</div>
                </div>
              </div>

              {/* 3. Kerala Samaj */}
              <div className="w-16 h-16 rounded-full border-2 border-emerald-600 flex flex-col items-center justify-center p-1 text-center shadow-sm">
                <span className="text-[10px] font-black leading-none text-gray-900">KERALA</span>
                <span className="text-[11px] font-black leading-none text-emerald-700 mt-0.5">SAMAJ</span>
              </div>

              {/* 4. Malayali Collective */}
              <div className="flex flex-col items-center">
                <div className="text-[18px] font-black text-amber-700 leading-none tracking-tighter">മലയാളി</div>
                <div className="text-[11px] font-extrabold text-amber-900">COLLECTIVE</div>
                <div className="text-[7px] text-gray-400">#ProtectedHouseholds</div>
              </div>

              {/* 5. NRI Trust */}
              <div className="w-11 h-16 rounded border border-gray-300 p-1 flex flex-col justify-between bg-stone-50">
                <div className="h-4 bg-slate-600 rounded-sm" />
                <div className="h-4 bg-amber-700/70 rounded-tl-xl" />
                <div className="text-[6.5px] font-bold text-center text-gray-600">NRI TRUST</div>
              </div>

              {/* 6. Gulf Vault '26 */}
              <div className="flex items-center gap-1.5">
                <div className="w-10 h-10 rotate-45 grid grid-cols-2 gap-0.5 p-1 bg-white border border-purple-300 rounded">
                  <div className="bg-teal-500" />
                  <div className="bg-rose-500" />
                  <div className="bg-amber-400" />
                  <div className="bg-purple-600" />
                </div>
                <div className="leading-none pl-1 text-left">
                  <div className="text-[10px] font-bold text-purple-700">gulf</div>
                  <div className="text-[10px] font-extrabold text-rose-500">vault</div>
                  <div className="text-[9px] font-bold text-amber-500">'26</div>
                </div>
              </div>
            </div>
          </div>

          {/* SPLIT CONTENT BELOW BANNER */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Column (5 Cols) */}
            <div className="lg:col-span-5 text-white relative lg:pl-6 text-left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 border border-white/30 text-[11px] font-bold uppercase tracking-wider mb-5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                HOUSEHOLD MANAGEMENT
              </div>

              <h2 className="text-[36px] sm:text-[46px] font-extrabold tracking-tight leading-[1.12]">
                3-Tap Quick Scan,
                <br />
                Skip the Hurry
              </h2>

              <p className="mt-5 text-[14px] sm:text-[15px] text-white/90 leading-[1.65] max-w-[400px]">
                Manage passports, visas, land tax receipts, vehicle insurance, and health policies with greater organization
                and control. Keep member profiles, expiry schedules, share packs, and trusted worker logs separate while
                managing everything from one central platform.
              </p>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => openModal('Open My Vault')}
                  className="bg-white hover:bg-festYellow text-gray-950 font-bold text-[13.5px] px-7 py-3 rounded-full shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer"
                >
                  Open My Vault →
                </button>
              </div>

              {/* 3D Floating Checklist Card */}
              <div className="mt-8 sm:mt-4 sm:ml-44 w-48 bg-white/95 rounded-2xl p-4 shadow-2xl transform rotate-[-6deg] relative select-none pointer-events-none">
                <span className="absolute -top-2 -right-2 w-2.5 h-2.5 rounded-full bg-festYellow" />
                <span className="absolute bottom-2 -left-3 w-2 h-2 rounded-full bg-festYellow" />
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-4 h-4 rounded bg-emerald-500 text-white text-[10px] flex items-center justify-center font-black">
                      ✓
                    </span>
                    <div className="h-2.5 w-24 bg-emerald-400 rounded-full" />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-4 h-4 rounded bg-rose-500 text-white text-[10px] flex items-center justify-center font-black">
                      ✓
                    </span>
                    <div className="h-2.5 w-28 bg-rose-500 rounded-full" />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-4 h-4 rounded bg-amber-400 text-white text-[10px] flex items-center justify-center font-black">
                      ✓
                    </span>
                    <div className="h-2.5 w-20 bg-sky-500 rounded-full" />
                  </div>
                </div>
                <svg
                  className="w-6 h-6 text-amber-900 absolute -bottom-2 -right-2 transform -rotate-12"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M4 2l16 10-7 2-3 7L4 2z" />
                </svg>
              </div>
            </div>

            {/* Right Column (7 Cols): 3-Column Staggered Bento Grid */}
            <div className="lg:col-span-7 bento-fade-mask py-6 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Bento Column 1 */}
                <div className="space-y-4">
                  <div className="festie-bento-card p-5 text-white h-[165px] flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold leading-snug">Put Your Family Vault in the Right Hands</div>
                      <div className="text-[10.5px] text-white/80 mt-1 line-clamp-2">
                        Organize important documents for different household members in one place.
                      </div>
                    </div>
                  </div>

                  <div className="festie-bento-card p-5 text-white h-[175px] flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold leading-snug">Make Every Document Renewal Official</div>
                      <div className="text-[10.5px] text-white/80 mt-1 line-clamp-2">
                        Keep track of expiry dates and renewal reminders for important documents.
                      </div>
                    </div>
                  </div>

                  <div className="festie-bento-card p-5 text-white h-[175px] flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold leading-snug">
                        Manage Multiple Profiles From One Powerful Workspace
                      </div>
                      <div className="text-[10.5px] text-white/80 mt-1 line-clamp-2">
                        Keep member profiles and records cleanly separated yet accessible.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bento Column 2 (Staggered Downward) */}
                <div className="space-y-4 sm:mt-8">
                  <div className="festie-bento-card p-5 text-white h-[175px] flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold leading-snug">
                        Empower Kerala &amp; Gulf Members to Stay on Track
                      </div>
                      <div className="text-[10.5px] text-white/80 mt-1 line-clamp-2">
                        Manage household documents across Kerala and Gulf-based family members.
                      </div>
                    </div>
                  </div>

                  <div className="festie-bento-card p-5 text-white h-[175px] flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold leading-snug">See What's Expiring at a Glance</div>
                      <div className="text-[10.5px] text-white/80 mt-1 line-clamp-2">
                        Identify upcoming document expiry dates and plan renewals in advance.
                      </div>
                    </div>
                  </div>

                  <div className="festie-bento-card p-5 text-white h-[165px] flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold leading-snug">10-Second Emergency Retrieval</div>
                      <div className="text-[10.5px] text-white/80 mt-1 line-clamp-2">
                        Find important records quickly when you need them most.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bento Column 3 */}
                <div className="space-y-4">
                  <div className="festie-bento-card p-5 text-white h-[155px] flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold leading-snug">Verify With Confidence</div>
                      <div className="text-[10.5px] text-white/80 mt-1 line-clamp-2">
                        Expiring Share Packs for safe verification.
                      </div>
                    </div>
                  </div>

                  <div className="festie-bento-card p-5 text-white h-[175px] flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold leading-snug">Build Your Family Vault, Ready to Go</div>
                      <div className="text-[10.5px] text-white/80 mt-1 line-clamp-2">
                        Keep family profiles and essential records organized according to your needs.
                      </div>
                    </div>
                  </div>

                  <div className="festie-bento-card p-5 text-white h-[175px] flex flex-col justify-between">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold leading-snug">Ready-Made Kerala Workers Directory</div>
                      <div className="text-[10.5px] text-white/80 mt-1 line-clamp-2">
                        Keep useful trusted-worker details organized and accessible.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================================
           SECTION 5: 3-ROW PILL MARQUEE WITH SIDE FADES
           ============================================================================ */}
      <section className="bg-festRed pt-6 pb-16 overflow-hidden select-none">
        <div className="pill-marquee-mask space-y-4">
          {/* Row 1 */}
          <div className="track-left gap-4">
            <div className="flex items-center gap-4 pr-4">
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                10s Emergency Retrieval
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                3-Tap Quick Scan
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Smart Expiry Radar
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Aadhaar &amp; Passport Vault
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Emirates ID Tracker
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Land Tax Receipts
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Watermarked Share Packs
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                10s Emergency Retrieval
              </span>
            </div>
            <div className="flex items-center gap-4 pr-4">
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                10s Emergency Retrieval
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                3-Tap Quick Scan
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Smart Expiry Radar
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Aadhaar &amp; Passport Vault
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Emirates ID Tracker
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Land Tax Receipts
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Watermarked Share Packs
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                10s Emergency Retrieval
              </span>
            </div>
          </div>

          {/* Row 2 */}
          <div className="track-right gap-4">
            <div className="flex items-center gap-4 pr-4">
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Multi-Member Profiles
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Kerala Workers Directory
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Vehicle RC &amp; Insurance
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Health Policy Vault
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                60·30·7d Alerts
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Malayalam &amp; English UI
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                GCC &amp; India SMS Alerts
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Multi-Member Profiles
              </span>
            </div>
            <div className="flex items-center gap-4 pr-4">
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Multi-Member Profiles
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Kerala Workers Directory
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Vehicle RC &amp; Insurance
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Health Policy Vault
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                60·30·7d Alerts
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Malayalam &amp; English UI
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                GCC &amp; India SMS Alerts
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Multi-Member Profiles
              </span>
            </div>
          </div>

          {/* Row 3 */}
          <div className="track-left gap-4">
            <div className="flex items-center gap-4 pr-4">
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Family Dashboard
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Expiring Share Links
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Village Office Docs
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                WhatsApp Upload Links
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                High-Res Cloud Vault
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                NRI Family Sync
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Zero-Chaos Renewals
              </span>
            </div>
            <div className="flex items-center gap-4 pr-4">
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Family Dashboard
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                Expiring Share Links
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Village Office Docs
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                WhatsApp Upload Links
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                High-Res Cloud Vault
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white/15 border border-white/75 text-white font-semibold text-[13.5px]">
                NRI Family Sync
              </span>
              <span className="px-7 py-3.5 rounded-full bg-white text-[#111] font-semibold text-[13.5px] shadow-sm">
                Zero-Chaos Renewals
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================================
           SECTION 6: GIANT WHITE ROUNDED SHEET & 5-CARD TESTIMONIALS
           ============================================================================ */}
      <div className="bg-white rounded-t-[44px] sm:rounded-t-[60px] pt-24 pb-24 relative z-20">
        {/* Big Centered Heading */}
        <section id="stories" className="max-w-[900px] mx-auto px-6 text-center">
          <h2 className="text-[44px] sm:text-[68px] md:text-[76px] font-bold text-[#0A0A0A] tracking-[-0.03em] leading-[1.06]">
            It’s not about
            <br />
            Saving time.
          </h2>
          <p className="mt-5 text-[15px] sm:text-[17px] text-[#52525B] max-w-[520px] mx-auto leading-[1.6]">
            KUDUMBA VAULT is the new standard for high-trust family document management. See what Kerala residents and Gulf
            NRI families say about us.
          </p>
        </section>

        {/* 5-CARD HORIZONTAL EDGE-TO-EDGE TESTIMONIALS ROW */}
        <section className="mt-14 overflow-hidden">
          <div className="flex gap-6 overflow-x-auto no-scrollbar px-6 sm:px-12 lg:px-16 pb-4 -mx-4">
            {/* Card 1 */}
            <div className="w-[330px] sm:w-[360px] shrink-0 bg-festGrayCard rounded-[24px] p-7 border border-[#ECECE9] flex flex-col justify-between text-left">
              <div>
                <p className="text-[14px] text-[#3F3F46] leading-[1.65]">
                  "The expiry radar and member-wise document management are incredible. While working in Dubai, I renewed
                  my father’s car insurance and land tax in Kochi right on time without any last-minute panic."
                </p>
                <button
                  type="button"
                  onClick={() => showToast('Full verified household review opened')}
                  className="mt-5 inline-block text-[14px] font-semibold text-[#111] underline underline-offset-4 cursor-pointer"
                >
                  Read full review
                </button>
              </div>
              <div className="mt-7 pt-5 border-t border-[#E5E5E2] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                    NK
                  </div>
                  <div>
                    <div className="text-[12.5px] font-bold text-[#111]">NRI Household Member</div>
                    <div className="text-[11px] text-gray-500">Dubai &amp; Kochi</div>
                  </div>
                </div>
                <div className="bg-[#00B67A] text-white px-2.5 py-1 rounded text-[10px] font-bold tracking-widest">
                  ★★★★★
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="w-[330px] sm:w-[360px] shrink-0 bg-festGrayCard rounded-[24px] p-7 border border-[#ECECE9] flex flex-col justify-between text-left">
              <div>
                <p className="text-[14px] text-[#3F3F46] leading-[1.65]">
                  "Finally, a platform that understands what Kerala families actually need. The Expiring Share Packs make
                  document sharing easier for verification."
                </p>
                <button
                  type="button"
                  onClick={() => showToast('Full verified household review opened')}
                  className="mt-5 inline-block text-[14px] font-semibold text-[#111] underline underline-offset-4 cursor-pointer"
                >
                  Read full review
                </button>
              </div>
              <div className="mt-7 pt-5 border-t border-[#E5E5E2] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-800 text-white text-xs font-bold flex items-center justify-center">
                    FH
                  </div>
                  <div>
                    <div className="text-[12.5px] font-bold text-[#111]">Founding Household</div>
                    <div className="text-[11px] text-gray-500">Kozhikode, Kerala</div>
                  </div>
                </div>
                <div className="bg-[#00B67A] text-white px-2.5 py-1 rounded text-[10px] font-bold tracking-widest">
                  ★★★★★
                </div>
              </div>
            </div>

            {/* Card 3 (Center Card) */}
            <div className="w-[330px] sm:w-[360px] shrink-0 bg-festGrayCard rounded-[24px] p-7 border border-[#ECECE9] flex flex-col justify-between text-left">
              <div>
                <p className="text-[14px] text-[#3F3F46] leading-[1.65]">
                  "This transformed how our joint family organizes passports, Emirates IDs, and village office
                  certificates. Even my parents use the Malayalam interface easily on their phones."
                </p>
                <button
                  type="button"
                  onClick={() => showToast('Full verified household review opened')}
                  className="mt-5 inline-block text-[14px] font-semibold text-[#111] underline underline-offset-4 cursor-pointer"
                >
                  Read full review
                </button>
              </div>
              <div className="mt-7 pt-5 border-t border-[#E5E5E2] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                    JF
                  </div>
                  <div>
                    <div className="text-[12.5px] font-bold text-[#111]">Joint Family Vault</div>
                    <div className="text-[11px] text-gray-500">Thrissur &amp; Sharjah</div>
                  </div>
                </div>
                <div className="bg-[#00B67A] text-white px-2.5 py-1 rounded text-[10px] font-bold tracking-widest">
                  ★★★★★
                </div>
              </div>
            </div>

            {/* Card 4 */}
            <div className="w-[330px] sm:w-[360px] shrink-0 bg-festGrayCard rounded-[24px] p-7 border border-[#ECECE9] flex flex-col justify-between text-left">
              <div>
                <p className="text-[14px] text-[#3F3F46] leading-[1.65]">
                  "The expiry radar and member-wise document management are incredible. While working in Dubai, I renewed
                  my father’s car insurance and land tax in Kochi right on time without any last-minute panic."
                </p>
                <button
                  type="button"
                  onClick={() => showToast('Full verified household review opened')}
                  className="mt-5 inline-block text-[14px] font-semibold text-[#111] underline underline-offset-4 cursor-pointer"
                >
                  Read full review
                </button>
              </div>
              <div className="mt-7 pt-5 border-t border-[#E5E5E2] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-800 text-white text-xs font-bold flex items-center justify-center">
                    KR
                  </div>
                  <div>
                    <div className="text-[12.5px] font-bold text-[#111]">Kerala Resident Family</div>
                    <div className="text-[11px] text-gray-500">Ernakulam, Kerala</div>
                  </div>
                </div>
                <div className="bg-[#00B67A] text-white px-2.5 py-1 rounded text-[10px] font-bold tracking-widest">
                  ★★★★★
                </div>
              </div>
            </div>

            {/* Card 5 */}
            <div className="w-[330px] sm:w-[360px] shrink-0 bg-festGrayCard rounded-[24px] p-7 border border-[#ECECE9] flex flex-col justify-between text-left">
              <div>
                <p className="text-[14px] text-[#3F3F46] leading-[1.65]">
                  "Finally, a platform that understands what Kerala families actually need. The Expiring Share Packs make
                  document sharing easier for verification."
                </p>
                <button
                  type="button"
                  onClick={() => showToast('Full verified household review opened')}
                  className="mt-5 inline-block text-[14px] font-semibold text-[#111] underline underline-offset-4 cursor-pointer"
                >
                  Read full review
                </button>
              </div>
              <div className="mt-7 pt-5 border-t border-[#E5E5E2] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                    GN
                  </div>
                  <div>
                    <div className="text-[12.5px] font-bold text-[#111]">Gulf NRI Family</div>
                    <div className="text-[11px] text-gray-500">Abu Dhabi &amp; Kottayam</div>
                  </div>
                </div>
                <div className="bg-[#00B67A] text-white px-2.5 py-1 rounded text-[10px] font-bold tracking-widest">
                  ★★★★★
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================================
             SECTION 7: EXACT FESTIE PRICING CARDS SECTION
             ============================================================================ */}
        <section id="pricing" className="max-w-[1220px] mx-auto px-4 sm:px-8 mt-28">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#FFF0F1] text-festRed text-[11px] font-bold uppercase tracking-wider">
              <span>✓</span> HOUSEHOLD PLANS &amp; PRICING
            </div>
            <h2 className="text-[36px] sm:text-[52px] font-bold text-[#0A0A0A] tracking-tight mt-2 leading-tight">
              Choose Your Family Vault
            </h2>
            <p className="text-[14px] sm:text-[16px] text-gray-500 mt-2">
              Transparent plans for founding households, Gulf NRI families, and community societies.
            </p>
          </div>

          {/* 3-Column Pricing Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* ================= CARD 1: Free — Founding Household ================= */}
            <div className="pricing-card-base p-7 sm:p-8 flex flex-col justify-between text-left">
              <div>
                {/* Top Pill */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3F3F2] text-[#666] text-[10.5px] font-bold uppercase tracking-wider">
                  <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  CURRENT PLAN
                </div>

                <h3 className="text-[24px] sm:text-[26px] font-extrabold text-[#111] mt-4 tracking-tight">
                  Free <span className="font-medium text-gray-800">— Founding Household</span>
                </h3>
                <p className="text-[13px] text-gray-500 mt-1">Try the core tools for your family.</p>

                {/* Gray Price Box */}
                <div className="mt-6 bg-[#F8F8F7] rounded-[18px] p-5">
                  <div className="text-[34px] font-extrabold text-[#111] leading-none">Free</div>
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-1.5">3 DAYS</div>
                </div>

                {/* Feature List */}
                <ul className="mt-6 space-y-3 text-[13px] text-[#222] font-medium">
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Maximum 5 family members</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Only 3 GB of secure cloud storage</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Limited to supported Kerala and Gulf document types</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Free trial valid for 3 days only</span>
                  </li>

                  {/* Expandable / Collapsible Full Spec Items */}
                  {expandedPlans[0] && (
                    <div className="space-y-3 pt-1">
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No remote WhatsApp upload links</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No SMS alerts</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No watermarked expiring Share Packs</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No bulk CSV import</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No multi-tenant client portal</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No automated compliance reminders</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>Access and features after trial expiry are not specified</span>
                      </li>
                    </div>
                  )}
                </ul>
              </div>

              <div className="mt-8 pt-4 text-center">
                <button
                  type="button"
                  onClick={() => togglePlanFeatures(0)}
                  className="text-[12px] font-semibold text-gray-500 hover:text-gray-900 mb-3 inline-block cursor-pointer"
                >
                  {expandedPlans[0] ? 'View less' : 'View all features'}
                </button>
                <button
                  type="button"
                  onClick={() => openModal('Free — Founding Household')}
                  className="w-full py-3.5 rounded-full border border-[#E5E5E5] text-gray-500 font-bold text-[13.5px] hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Selected
                </button>
              </div>
            </div>

            {/* ================= CARD 2: Pro — NRI Family Plus (POPULAR) ================= */}
            <div className="pricing-card-pro p-7 sm:p-8 flex flex-col justify-between relative text-left">
              {/* Floating Center POPULAR Pill */}
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-festRed text-white text-[10.5px] font-extrabold uppercase tracking-wider px-4 py-1 rounded-full shadow-sm">
                POPULAR
              </div>

              <div>
                {/* Top Pill */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFE4E6] text-festRed text-[10.5px] font-bold uppercase tracking-wider">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  LIMITED TIME OFFER
                </div>

                <h3 className="text-[24px] sm:text-[26px] font-extrabold text-[#111] mt-4 tracking-tight">
                  Pro <span className="font-medium text-gray-800">— NRI Family Plus</span>
                </h3>
                <p className="text-[13px] text-gray-500 mt-1">
                  For busier families, with optional add-ons when you need more capacity.
                </p>

                {/* Duration Selector Tabs */}
                <div className="mt-5 bg-[#F3F2F2] p-1 rounded-full grid grid-cols-3 text-center text-[11.5px] font-bold">
                  <button
                    type="button"
                    onClick={() => setProCycle('3m')}
                    className={`py-2 rounded-full transition-all cursor-pointer ${
                      proCycle === '3m' ? 'bg-festRed text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    3 months
                  </button>
                  <button
                    type="button"
                    onClick={() => setProCycle('6m')}
                    className={`py-2 rounded-full transition-all cursor-pointer ${
                      proCycle === '6m' ? 'bg-festRed text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    6 months
                  </button>
                  <button
                    type="button"
                    onClick={() => setProCycle('1y')}
                    className={`py-2 rounded-full transition-all cursor-pointer ${
                      proCycle === '1y' ? 'bg-festRed text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    1 year
                  </button>
                </div>

                {/* Gray Price Box */}
                <div className="mt-4 bg-[#F8F8F7] rounded-[18px] p-5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[34px] font-extrabold text-[#111] leading-none">{proDetails.price}</span>
                    <span className="text-[13px] font-bold text-gray-600">{proDetails.period}</span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFE4E6] text-festRed text-[11px] font-bold">
                    <span>🎁</span>
                    <span>{proDetails.savings}</span>
                  </div>
                </div>

                {/* Feature List */}
                <ul className="mt-6 space-y-3 text-[13px] text-[#222] font-medium">
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Maximum 12 family members</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Only 15 GB of high-resolution document storage</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>WhatsApp uploads limited to remote upload links</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>SMS alerts limited to GCC and India</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Share Packs are watermarked and expire</span>
                  </li>

                  {/* Expandable / Collapsible Full Spec Items */}
                  {expandedPlans[1] && (
                    <div className="space-y-3 pt-1">
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No multi-tenant client portal</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No bulk CSV client or policy import</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No automated compliance reminders</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No unlimited storage or family members</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>Additional premium features beyond the listed scope are not specified</span>
                      </li>
                    </div>
                  )}
                </ul>
              </div>

              <div className="mt-8 pt-4 text-center">
                <button
                  type="button"
                  onClick={() => togglePlanFeatures(1)}
                  className="text-[12px] font-semibold text-gray-600 hover:text-gray-900 mb-3 inline-block cursor-pointer"
                >
                  {expandedPlans[1] ? 'View less' : 'View all features'}
                </button>
                <button
                  type="button"
                  onClick={() => openModal(`Pro — NRI Family Plus (${proDetails.price}${proDetails.period})`)}
                  className="w-full py-3.5 rounded-full bg-festRed hover:bg-festRedDark text-white font-bold text-[13.5px] shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Continue</span>
                  <span>›</span>
                </button>
              </div>
            </div>

            {/* ================= CARD 3: Partners & Societies ================= */}
            <div className="pricing-card-ultra p-7 sm:p-8 flex flex-col justify-between text-left">
              <div>
                {/* Top Pill */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF0F1] text-festRed text-[10.5px] font-bold uppercase tracking-wider">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ULTRA
                </div>

                <h3 className="text-[24px] sm:text-[26px] font-extrabold text-[#111] mt-4 tracking-tight">
                  Partners &amp; Societies
                </h3>
                <p className="text-[13px] text-gray-500 mt-1">For large organizations that need custom capacity.</p>

                {/* Gray Price Box */}
                <div className="mt-6 bg-[#F8F8F7] rounded-[18px] p-5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[34px] font-extrabold text-[#111] leading-none">₹999</span>
                    <span className="text-[13px] font-bold text-gray-600">/month</span>
                  </div>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1.5">
                    SOCIETY &amp; PARTNER TIER
                  </div>
                </div>

                {/* Feature List */}
                <ul className="mt-6 space-y-3 text-[13px] text-[#222] font-medium">
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Maximum 50 family/client seats</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Only 100 GB of vault storage</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full border border-festRed text-festRed flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span>Bulk CSV imports restricted to authorized administrators</span>
                  </li>

                  {/* Expandable / Collapsible Full Spec Items */}
                  {expandedPlans[2] && (
                    <div className="space-y-3 pt-1">
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>Supported compliance regulations are not specified</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>No unlimited storage or seats</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>Additional-seat pricing is not specified</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>Tenant isolation and permissions need to be clearly defined</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600">
                        <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span>Features beyond the listed plan scope are not specified</span>
                      </li>
                    </div>
                  )}
                </ul>
              </div>

              <div className="mt-8 pt-4 text-center">
                <button
                  type="button"
                  onClick={() => togglePlanFeatures(2)}
                  className="text-[12px] font-semibold text-gray-600 hover:text-gray-900 mb-3 inline-block cursor-pointer"
                >
                  {expandedPlans[2] ? 'View less' : 'View all features'}
                </button>
                <button
                  type="button"
                  onClick={() => openModal('Partners & Societies (₹999/month)')}
                  className="w-full py-3.5 rounded-full border border-[#E0E0E0] hover:border-gray-900 text-[#111] font-bold text-[13.5px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Contact sales</span>
                  <span>›</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================================
             SECTION 7B: MOBILE APP PROMOTION
             ============================================================================ */}
        <section id="mobile-app" className="max-w-[1220px] mx-auto px-4 sm:px-8 mt-24">
          <div className="bg-[#F8F8F7] border border-[#ECECE9] rounded-[32px] p-8 sm:p-12 lg:p-14 flex flex-col lg:flex-row items-center justify-between gap-10 text-left">
            <div className="max-w-xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFE4E6] text-festRed text-[11px] font-bold uppercase tracking-wider">
                📱 MOBILE VAULT COMPANION
              </div>
              <h3 className="text-[30px] sm:text-[40px] font-extrabold text-[#111] tracking-tight leading-tight">
                All Your Documents In Your Pocket
              </h3>
              <p className="text-[15px] text-gray-600">Manage your household documents wherever you are.</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-[13.5px] font-semibold text-gray-800">
                <li className="flex items-center gap-2">
                  <span className="text-festRed font-black">✓</span> Add, view, and organize documents easily
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-festRed font-black">✓</span> Get expiry alerts before important dates
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-festRed font-black">✓</span> Access your vault on mobile, anytime
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-festRed font-black">✓</span> Keep sensitive documents protected
                </li>
                <li className="flex items-center gap-2 sm:col-span-2">
                  <span className="text-festRed font-black">✓</span> Built for Kerala and NRI families
                </li>
              </ul>
              <div className="pt-3 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => openModal('Get the Mobile App')}
                  className="bg-[#111] hover:bg-black text-white font-semibold text-[14px] px-7 py-3.5 rounded-full shadow-md transition-transform hover:-translate-y-0.5 cursor-pointer"
                >
                  Get the Mobile App
                </button>
                <span className="text-xs text-gray-500">Scan to download Kudumba Vault for Android and iOS.</span>
              </div>
            </div>

            {/* QR Code Verification Box */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-5 shrink-0">
              <div className="w-28 h-28 bg-gray-50 rounded-xl p-2 border border-gray-200 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full text-[#111]" fill="currentColor">
                  <rect x="8" y="8" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
                  <rect x="16" y="16" width="10" height="10" />
                  <rect x="66" y="8" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
                  <rect x="74" y="16" width="10" height="10" />
                  <rect x="8" y="66" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
                  <rect x="16" y="74" width="10" height="10" />
                  <rect x="44" y="12" width="8" height="8" />
                  <rect x="44" y="28" width="8" height="16" />
                  <rect x="12" y="44" width="16" height="8" />
                  <rect x="36" y="44" width="24" height="8" />
                  <rect x="68" y="44" width="12" height="12" />
                  <rect x="44" y="64" width="12" height="12" />
                  <rect x="64" y="68" width="24" height="8" />
                  <rect x="64" y="82" width="12" height="10" />
                </svg>
              </div>
              <div className="max-w-[165px]">
                <div className="text-sm font-extrabold text-gray-900">Android &amp; iOS</div>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Scan to download Kudumba Vault when verified store links are live.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================================
             SECTION 8: FREQUENTLY ASKED QUESTIONS
             ============================================================================ */}
        <section id="faq" className="max-w-[1180px] mx-auto px-6 sm:px-10 mt-28">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start text-left">
            {/* Left Column: Huge Stacked Title */}
            <div className="lg:col-span-5">
              <h2 className="text-[52px] sm:text-[66px] font-extrabold text-[#111827] tracking-[-0.03em] leading-[1.04]">
                Frequently
                <br />
                asked
                <br />
                questions.
              </h2>
            </div>

            {/* Right Column: Interactive Accordion Cards */}
            <div className="lg:col-span-7 space-y-4">
              {/* FAQ Item 1 */}
              <div
                className={`rounded-[22px] p-6 sm:p-7 transition-all ${
                  openFaqIndex === 0
                    ? 'border border-[#FFD6D9] bg-[#FFF9FA]'
                    : 'border border-[#ECECE9] bg-[#F8F8F7]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleFaqItem(0)}
                  className="w-full flex items-center justify-between text-left gap-4 cursor-pointer"
                >
                  <span className="text-[16px] sm:text-[17.5px] font-semibold text-[#111827]">
                    How do I start organizing my family documents in Kudumba Vault?
                  </span>
                  <span
                    className={`w-8 h-8 rounded-full bg-festRed text-white flex items-center justify-center shrink-0 transition-transform ${
                      openFaqIndex === 0 ? '' : 'rotate-180'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </span>
                </button>
                {openFaqIndex === 0 && (
                  <div className="mt-3.5 text-[14px] text-[#6B7280] leading-[1.65]">
                    Create your account, set up your family vault, and start uploading or scanning important documents.
                    You can also explore our guided setup{' '}
                    <span
                      onClick={() => openModal('Guided Setup')}
                      className="underline text-gray-800 cursor-pointer"
                    >
                      here
                    </span>
                    .
                  </div>
                )}
              </div>

              {/* FAQ Item 2 */}
              <div
                className={`rounded-[22px] p-6 sm:p-7 transition-all ${
                  openFaqIndex === 1
                    ? 'border border-[#FFD6D9] bg-[#FFF9FA]'
                    : 'border border-[#ECECE9] bg-[#F8F8F7]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleFaqItem(1)}
                  className="w-full flex items-center justify-between text-left gap-4 cursor-pointer"
                >
                  <span className="text-[16px] sm:text-[17.5px] font-semibold text-[#111827]">
                    Is there a free trial available for households?
                  </span>
                  <span
                    className={`w-8 h-8 rounded-full bg-festRed text-white flex items-center justify-center shrink-0 transition-transform ${
                      openFaqIndex === 1 ? '' : 'rotate-180'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </span>
                </button>
                {openFaqIndex === 1 && (
                  <div className="mt-3.5 text-[14px] text-[#6B7280] leading-[1.65]">
                    Check the current Plans &amp; Pricing page for the available free tier or trial terms. The Free — Founding
                    Household plan provides a 3-day trial for up to 5 family members and 3 GB of cloud storage.
                  </div>
                )}
              </div>

              {/* FAQ Item 3 */}
              <div
                className={`rounded-[22px] p-6 sm:p-7 transition-all ${
                  openFaqIndex === 2
                    ? 'border border-[#FFD6D9] bg-[#FFF9FA]'
                    : 'border border-[#ECECE9] bg-[#F8F8F7]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleFaqItem(2)}
                  className="w-full flex items-center justify-between text-left gap-4 cursor-pointer"
                >
                  <span className="text-[16px] sm:text-[17.5px] font-semibold text-[#111827]">
                    Can I manage documents for multiple family members across Kerala and the Gulf?
                  </span>
                  <span
                    className={`w-8 h-8 rounded-full bg-festRed text-white flex items-center justify-center shrink-0 transition-transform ${
                      openFaqIndex === 2 ? '' : 'rotate-180'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </span>
                </button>
                {openFaqIndex === 2 && (
                  <div className="mt-3.5 text-[14px] text-[#6B7280] leading-[1.65]">
                    Kudumba Vault is designed to help families organize documents across household members. Access depends
                    on the features and permissions available in your account.
                  </div>
                )}
              </div>

              {/* FAQ Item 4 */}
              <div
                className={`rounded-[22px] p-6 sm:p-7 transition-all ${
                  openFaqIndex === 3
                    ? 'border border-[#FFD6D9] bg-[#FFF9FA]'
                    : 'border border-[#ECECE9] bg-[#F8F8F7]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleFaqItem(3)}
                  className="w-full flex items-center justify-between text-left gap-4 cursor-pointer"
                >
                  <span className="text-[16px] sm:text-[17.5px] font-semibold text-[#111827]">
                    Is technical knowledge required for elderly parents?
                  </span>
                  <span
                    className={`w-8 h-8 rounded-full bg-festRed text-white flex items-center justify-center shrink-0 transition-transform ${
                      openFaqIndex === 3 ? '' : 'rotate-180'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </span>
                </button>
                {openFaqIndex === 3 && (
                  <div className="mt-3.5 text-[14px] text-[#6B7280] leading-[1.65]">
                    The interface is designed to make document organization straightforward, with simple navigation and clear
                    actions in both English and Malayalam.
                  </div>
                )}
              </div>

              {/* FAQ Item 5 */}
              <div
                className={`rounded-[22px] p-6 sm:p-7 transition-all ${
                  openFaqIndex === 4
                    ? 'border border-[#FFD6D9] bg-[#FFF9FA]'
                    : 'border border-[#ECECE9] bg-[#F8F8F7]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleFaqItem(4)}
                  className="w-full flex items-center justify-between text-left gap-4 cursor-pointer"
                >
                  <span className="text-[16px] sm:text-[17.5px] font-semibold text-[#111827]">
                    How secure is our family data and Aadhaar numbers?
                  </span>
                  <span
                    className={`w-8 h-8 rounded-full bg-festRed text-white flex items-center justify-center shrink-0 transition-transform ${
                      openFaqIndex === 4 ? '' : 'rotate-180'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </span>
                </button>
                {openFaqIndex === 4 && (
                  <div className="mt-3.5 text-[14px] text-[#6B7280] leading-[1.65]">
                    Kudumba Vault protects sensitive information using its implemented authentication, access controls,
                    secure storage, and watermarked expiring Share Packs.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================================
             SECTION 9: FINAL CALL TO ACTION STRIP
             ============================================================================ */}
        <section className="max-w-[1180px] mx-auto px-6 sm:px-10 mt-24">
          <div className="festie-red-topo rounded-[32px] p-10 sm:p-14 text-center text-white shadow-xl">
            <h2 className="text-[32px] sm:text-[48px] font-extrabold tracking-tight leading-tight">
              Ready to Secure Your Family Vault?
            </h2>
            <p className="mt-3 text-[15px] sm:text-[17px] text-white/90 max-w-xl mx-auto">
              Join families using Kudumba Vault to organize their important documents and keep track of renewals.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
              <button
                type="button"
                onClick={() => openModal('Enter Kudumba Vault')}
                className="bg-[#141414] hover:bg-black text-white font-semibold text-[14px] sm:text-[15px] px-8 py-3.5 rounded-full shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer"
              >
                Enter Kudumba Vault →
              </button>
              <button
                type="button"
                onClick={() => openModal('Talk to Us')}
                className="bg-white hover:bg-gray-50 text-[#141414] font-semibold text-[14px] sm:text-[15px] px-8 py-3.5 rounded-full shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer"
              >
                Talk to Us
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ============================================================================
           SECTION 10: PITCH BLACK FOOTER WITH GIANT METALLIC WORDMARK
           ============================================================================ */}
      <footer className="bg-[#050505] text-white pt-16 pb-0 overflow-hidden text-left">
        <div className="max-w-[1280px] mx-auto px-6 sm:px-12">
          {/* Top 5-Column Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-14 border-b border-[#1F1F1F]">
            {/* Column 1: Kudumba Vault. */}
            <div className="lg:col-span-4 space-y-5">
              <div className="text-[18px] font-bold text-white tracking-tight">Kudumba Vault.</div>
              <p className="text-[13px] text-[#8E8E93] leading-[1.6] max-w-[300px]">
                A secure document management platform for families. Keep your important documents organized, safe, and
                always accessible.
              </p>
              <div className="flex items-center gap-2.5 text-[13px] text-white font-medium pt-1">
                <svg className="w-4 h-4 text-[#8E8E93]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <a href="mailto:hello@kudumbavault.app" className="hover:underline">
                  hello@kudumbavault.app
                </a>
              </div>

              {/* 4 Dark Rounded-Square Social Icons */}
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => showToast('YouTube Channel')}
                  className="w-9 h-9 rounded-lg border border-[#262626] bg-[#0B0B0B] hover:border-gray-500 flex items-center justify-center text-white transition-colors cursor-pointer"
                  aria-label="YouTube"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => showToast('Instagram Page')}
                  className="w-9 h-9 rounded-lg border border-[#262626] bg-[#0B0B0B] hover:border-gray-500 flex items-center justify-center text-white transition-colors cursor-pointer"
                  aria-label="Instagram"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => showToast('LinkedIn Page')}
                  className="w-9 h-9 rounded-lg border border-[#262626] bg-[#0B0B0B] hover:border-gray-500 flex items-center justify-center text-white transition-colors cursor-pointer"
                  aria-label="LinkedIn"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => showToast('Facebook Page')}
                  className="w-9 h-9 rounded-lg border border-[#262626] bg-[#0B0B0B] hover:border-gray-500 flex items-center justify-center text-white transition-colors cursor-pointer"
                  aria-label="Facebook"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Column 2: Product */}
            <div className="lg:col-span-2 space-y-3.5">
              <div className="text-[12px] font-bold text-white">Product</div>
              <ul className="space-y-2.5 text-[13px] text-white/90 font-medium">
                <li>
                  <a href="#features" className="hover:text-gray-300">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-gray-300">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-gray-300">
                    Security
                  </a>
                </li>
                <li>
                  <a href="#mobile-app" className="hover:text-gray-300">
                    Mobile App
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3: Household */}
            <div className="lg:col-span-2 space-y-3.5">
              <div className="text-[12px] font-bold text-white">Household</div>
              <ul className="space-y-2.5 text-[13px] text-white/90 font-medium">
                <li>
                  <a href="#why-vault" className="hover:text-gray-300">
                    Family Dashboard
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-gray-300">
                    Member Profiles
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-gray-300">
                    Pricing &amp; Plans
                  </a>
                </li>
                <li>
                  <a href="#stories" className="hover:text-gray-300">
                    Family Stories
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-gray-300">
                    Security FAQ
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 4: Support */}
            <div className="lg:col-span-2 space-y-3.5">
              <div className="text-[12px] font-bold text-white">Support</div>
              <ul className="space-y-2.5 text-[13px] text-white/90 font-medium">
                <li>
                  <a href="#faq" className="hover:text-gray-300">
                    Help Center
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-gray-300">
                    Documentation
                  </a>
                </li>
                <li>
                  <button type="button" onClick={() => openModal('Contact Us')} className="hover:text-gray-300 cursor-pointer">
                    Contact Us
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => showToast('System Status: All Vault Clusters Operational')}
                    className="hover:text-gray-300 cursor-pointer"
                  >
                    System Status
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 5: Subscribe */}
            <div className="lg:col-span-2 space-y-3">
              <div className="text-[12px] font-bold text-white">Subscribe</div>
              <p className="text-[12.5px] text-[#8E8E93] leading-relaxed">Get the latest updates and features.</p>
              <form onSubmit={handleFooterSubscribe} className="space-y-2.5 pt-1">
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={footerEmail}
                  onChange={(e) => setFooterEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#0B0F17] border border-[#1E2430] text-[12.5px] text-white placeholder-[#6B7280] focus:outline-none focus:border-gray-500"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-md bg-white hover:bg-gray-100 text-[#0A0A0A] font-semibold text-[13px] transition-colors cursor-pointer"
                >
                  Subscribe
                </button>
              </form>
            </div>
          </div>

          {/* Copyright & Legal Links Row */}
          <div className="py-7 flex flex-col sm:flex-row items-center justify-between text-[11.5px] text-[#6E6E73] gap-4">
            <div>© 2026 Kudumba Vault. All rights reserved.</div>
            <div className="flex items-center gap-6">
              <button type="button" onClick={() => showToast('Privacy Policy')} className="hover:text-gray-400 cursor-pointer">
                Privacy Policy
              </button>
              <button type="button" onClick={() => showToast('Terms of Service')} className="hover:text-gray-400 cursor-pointer">
                Terms of Service
              </button>
              <button type="button" onClick={() => showToast('Refund Policy')} className="hover:text-gray-400 cursor-pointer">
                Refund Policy
              </button>
            </div>
          </div>
        </div>

        {/* GIANT EDGE-TO-EDGE METALLIC WORDMARK CLIPPED AT BOTTOM */}
        <div className="w-full text-center pt-4 overflow-hidden select-none leading-none">
          <div className="festie-metallic-word text-[18.8vw] tracking-[-0.055em] whitespace-nowrap -mb-[2.8vw]">
            KUDUMBA
          </div>
        </div>
      </footer>

      {/* ============================================================================
           TOAST NOTIFICATION
           ============================================================================ */}
      {toastVisible && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#111] text-white px-5 py-3 rounded-full shadow-2xl border border-white/15 text-xs font-semibold flex items-center gap-2.5 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-festYellow" />
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
