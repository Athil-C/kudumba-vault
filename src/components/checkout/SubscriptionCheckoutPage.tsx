import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Tag,
  Home,
  CreditCard,
  CheckCircle2,
  Lock,
  ChevronDown,
} from 'lucide-react';
import {
  apiCalculatePlanPrice,
  apiCreatePaymentRequest,
  PlanPriceCalculationClient,
  BillingAddressClient,
  CurrentPaymentStatusClient,
} from '../../services/apiClient';
import { Language } from '../../types/vault';

interface SubscriptionCheckoutPageProps {
  planId: string;
  initialDuration?: 'monthly' | 'quarterly' | 'yearly';
  lang?: Language;
  savedAddress?: BillingAddressClient | null;
  onBack: () => void;
  onProceedToPayment: (paymentData: any) => void;
}

export const SubscriptionCheckoutPage: React.FC<SubscriptionCheckoutPageProps> = ({
  planId,
  initialDuration = 'quarterly',
  lang = 'en',
  savedAddress = null,
  onBack,
  onProceedToPayment,
}) => {
  const [duration, setDuration] = useState<'monthly' | 'quarterly' | 'yearly'>(initialDuration);
  const [addressMode, setAddressMode] = useState<'saved' | 'custom'>(savedAddress ? 'saved' : 'custom');

  // Form State
  const [fullName, setFullName] = useState(savedAddress?.fullName || '');
  const [houseBuilding, setHouseBuilding] = useState(savedAddress?.houseBuilding || '');
  const [streetLocality, setStreetLocality] = useState(savedAddress?.streetLocality || '');
  const [city, setCity] = useState(savedAddress?.city || '');
  const [state, setState] = useState(savedAddress?.state || 'Kerala');
  const [country, setCountry] = useState(savedAddress?.country || 'India');
  const [postalCode, setPostalCode] = useState(savedAddress?.postalCode || '');
  const [phone, setPhone] = useState(savedAddress?.phone || '');
  const [saveBillingAddress, setSaveBillingAddress] = useState(true);

  // Pricing State
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PlanPriceCalculationClient | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  // Checkout submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch server-calculated price
  const fetchPrice = async (dur: 'monthly' | 'quarterly' | 'yearly', coupon?: string) => {
    setIsLoadingPrice(true);
    setPriceError(null);
    try {
      const res = await apiCalculatePlanPrice({
        planId,
        duration: dur,
        couponCode: coupon || undefined,
      });
      if (res && res.pricing) {
        setPricing(res.pricing);
        if (coupon) {
          setAppliedCoupon(coupon);
        }
      }
    } catch (err: any) {
      setPriceError(err?.message || 'Failed to calculate price.');
      if (coupon) {
        setAppliedCoupon(null);
      }
    } finally {
      setIsLoadingPrice(false);
    }
  };

  useEffect(() => {
    fetchPrice(duration, appliedCoupon || undefined);
  }, [planId, duration]);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    fetchPrice(duration, couponCode.trim());
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setAppliedCoupon(null);
    fetchPrice(duration, undefined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate fields
    const activeAddress: BillingAddressClient =
      addressMode === 'saved' && savedAddress
        ? savedAddress
        : {
            fullName: fullName.trim(),
            houseBuilding: houseBuilding.trim(),
            streetLocality: streetLocality.trim(),
            city: city.trim(),
            state: state.trim(),
            country: country.trim(),
            postalCode: postalCode.trim(),
            phone: phone.trim(),
          };

    if (!activeAddress.fullName || activeAddress.fullName.length < 2) {
      setFormError('Please enter full name (at least 2 characters).');
      return;
    }
    if (!activeAddress.houseBuilding || activeAddress.houseBuilding.length < 2) {
      setFormError('Please enter house or building name.');
      return;
    }
    if (!activeAddress.streetLocality) {
      setFormError('Please enter street or locality.');
      return;
    }
    if (!activeAddress.city) {
      setFormError('Please enter city.');
      return;
    }
    if (!activeAddress.postalCode || activeAddress.postalCode.length < 4) {
      setFormError('Please enter a valid postal PIN code.');
      return;
    }
    if (!activeAddress.phone || activeAddress.phone.length < 8) {
      setFormError('Please enter a valid contact phone number.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await apiCreatePaymentRequest({
        planId,
        duration,
        billingAddress: activeAddress,
        couponCode: appliedCoupon || undefined,
        saveBillingAddress: addressMode === 'custom' && saveBillingAddress,
      });

      if (res && res.ok) {
        onProceedToPayment(res);
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to initialize payment request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isNri = planId === 'nri-plus';
  const planDisplayName = isNri ? 'NRI Family Plus' : 'Partners & Societies';
  const planTag = isNri ? '# NRI FAMILY PLUS' : '# PARTNER PRO';

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0B0B0C] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-bold text-[#5B6168] hover:text-[#0B0B0C] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'ml' ? 'പ്ലാനുകളിലേക്ക് മടങ്ങുക' : 'Back to Plans'}</span>
          </button>

          <div className="flex items-center gap-2 text-xs font-semibold text-[#5B6168]">
            <ShieldCheck className="w-4 h-4 text-[#0F7B3E]" />
            <span>Bank-grade 256-bit Secure Checkout</span>
          </div>
        </div>

        {/* Form Error Toast */}
        {formError && (
          <div className="p-4 rounded-2xl bg-[#FDECEE] border border-[#F9C3C6] text-[#E03A45] text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
            <button
              onClick={() => setFormError(null)}
              className="text-[#E03A45] hover:opacity-80 text-xs font-bold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main 2-Column Checkout Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Plan Banner & Billing Address (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. Plan Overview Card (Festie Coral Header Theme) */}
            <div className="rounded-[28px] overflow-hidden border border-[#E6E8EC] bg-white shadow-xs">
              <div className="bg-[#E03A45] text-white p-6 sm:p-7 relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-extrabold tracking-wider bg-white/20 px-3 py-1 rounded-full uppercase">
                    {planTag}
                  </span>

                  {/* Billing Duration Dropdown */}
                  <div className="relative">
                    <select
                      value={duration}
                      onChange={(e) => setDuration(e.target.value as any)}
                      className="appearance-none bg-white/15 hover:bg-white/25 text-white text-xs font-bold py-1.5 pl-3 pr-8 rounded-xl border border-white/20 focus:outline-none transition-colors cursor-pointer"
                    >
                      <option value="monthly" className="text-[#0B0B0C]">
                        1 month (Standard)
                      </option>
                      <option value="quarterly" className="text-[#0B0B0C]">
                        3 months (13% off)
                      </option>
                      <option value="yearly" className="text-[#0B0B0C]">
                        1 year (20% off)
                      </option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-white absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{planDisplayName}</h1>
                <p className="text-white/85 text-xs sm:text-sm mt-1 max-w-md font-medium">
                  {isNri
                    ? 'Tailored for growing families across Kerala & the Gulf with WhatsApp upload links and automated expiry alerts.'
                    : 'Complete multi-tenant document compliance suite for partners, auditors, and large family trusts.'}
                </p>

                {/* Features Pills Checklist */}
                <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-white/20 text-xs font-medium text-white/95">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span>{isNri ? '12 Family Members' : '50 Client Profiles'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span>{isNri ? '15 GB High-Res Vault' : '100 GB Vault Storage'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span>WhatsApp Remote Links</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span>GCC & India SMS Alerts</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Billing Address Form Card */}
            <div className="rounded-[28px] border border-[#E6E8EC] bg-white p-6 sm:p-7 shadow-xs">
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#F0F1F4]">
                <div>
                  <h2 className="text-base font-bold text-[#0B0B0C] font-malayalam">
                    {lang === 'ml' ? 'ബില്ലിംഗ് വിലാസം' : 'Billing Address'}
                  </h2>
                  <p className="text-xs text-[#5B6168] mt-0.5">
                    {lang === 'ml'
                      ? 'ഇൻവോയ്സ് തയ്യാറാക്കുന്നതിനായി നിങ്ങളുടെ വിലാസം നൽകുക.'
                      : 'Provide your tax address for GST and official subscription invoices.'}
                  </p>
                </div>
              </div>

              {/* Address Mode Radio Selector */}
              {savedAddress && (
                <div className="space-y-3 mb-5">
                  <label
                    onClick={() => setAddressMode('saved')}
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      addressMode === 'saved'
                        ? 'border-[#E03A45] bg-[#FDECEE]/30 ring-1 ring-[#E03A45]'
                        : 'border-[#E6E8EC] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="addressMode"
                      checked={addressMode === 'saved'}
                      onChange={() => setAddressMode('saved')}
                      className="mt-1 text-[#E03A45] focus:ring-[#E03A45]"
                    />
                    <div>
                      <span className="text-xs font-bold text-[#0B0B0C] block">
                        Use saved household address
                      </span>
                      <span className="text-xs text-[#5B6168] mt-0.5 block leading-relaxed">
                        {savedAddress.fullName}, {savedAddress.houseBuilding}, {savedAddress.streetLocality},{' '}
                        {savedAddress.city}, {savedAddress.state} - {savedAddress.postalCode}
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setAddressMode('custom')}
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      addressMode === 'custom'
                        ? 'border-[#E03A45] bg-[#FDECEE]/30 ring-1 ring-[#E03A45]'
                        : 'border-[#E6E8EC] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="addressMode"
                      checked={addressMode === 'custom'}
                      onChange={() => setAddressMode('custom')}
                      className="mt-1 text-[#E03A45] focus:ring-[#E03A45]"
                    />
                    <div>
                      <span className="text-xs font-bold text-[#0B0B0C] block">
                        Use custom billing address
                      </span>
                      <span className="text-xs text-[#5B6168] mt-0.5 block">
                        Enter a separate address for this subscription.
                      </span>
                    </div>
                  </label>
                </div>
              )}

              {/* Form Input Fields */}
              {(addressMode === 'custom' || !savedAddress) && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#0B0B0C] mb-1">Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Athil Chalil"
                      className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#0B0B0C] mb-1">
                        House / Building
                      </label>
                      <input
                        type="text"
                        value={houseBuilding}
                        onChange={(e) => setHouseBuilding(e.target.value)}
                        placeholder="e.g. Chalil House, No. 42"
                        className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B0B0C] mb-1">
                        Street / Locality
                      </label>
                      <input
                        type="text"
                        value={streetLocality}
                        onChange={(e) => setStreetLocality(e.target.value)}
                        placeholder="e.g. Vellamunda Post"
                        className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#0B0B0C] mb-1">City / Town</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Mananthavadi"
                        className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B0B0C] mb-1">Country</label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors cursor-pointer"
                      >
                        <option value="India">India</option>
                        <option value="United Arab Emirates">United Arab Emirates</option>
                        <option value="Qatar">Qatar</option>
                        <option value="Saudi Arabia">Saudi Arabia</option>
                        <option value="Oman">Oman</option>
                        <option value="Kuwait">Kuwait</option>
                        <option value="Bahrain">Bahrain</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#0B0B0C] mb-1">
                        PIN / Postal Code
                      </label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="e.g. 670731"
                        className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B0B0C] mb-1">
                        State / Province
                      </label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="e.g. Kerala"
                        className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0B0B0C] mb-1">Phone Number</label>
                    <div className="flex rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] overflow-hidden focus-within:border-[#E03A45] focus-within:bg-white transition-colors">
                      <span className="inline-flex items-center px-3.5 bg-[#F0F1F4] text-xs font-bold text-[#5B6168] border-r border-[#E6E8EC]">
                        🇮🇳 +91
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 8590500401"
                        className="w-full h-11 px-3.5 bg-transparent text-xs font-semibold text-[#0B0B0C] focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#0B0B0C]">
                      <input
                        type="checkbox"
                        checked={saveBillingAddress}
                        onChange={(e) => setSaveBillingAddress(e.target.checked)}
                        className="w-4 h-4 rounded text-[#E03A45] focus:ring-[#E03A45]"
                      />
                      <span>Save this billing address for future invoices</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Pricing Summary Card (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-[28px] border border-[#E6E8EC] bg-white p-6 sm:p-7 shadow-xs space-y-5">
              <span className="text-[11px] font-extrabold text-[#5B6168] tracking-wider uppercase flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                <span>PRICING</span>
              </span>

              {/* Highlighted Payable Banner Card */}
              <div className="rounded-2xl bg-[#E03A45] text-white p-5 space-y-1">
                <span className="text-[10px] font-extrabold tracking-wider uppercase text-white/80 block">
                  PAYABLE NOW
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black">
                    ₹{pricing ? pricing.finalPayable.toLocaleString('en-IN') : '...'}
                  </span>
                  {pricing && pricing.planSavings > 0 && (
                    <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">
                      {duration === 'yearly' ? '20% offer' : '13% offer'}
                    </span>
                  )}
                </div>
                {pricing && pricing.planSavings > 0 && (
                  <p className="text-xs text-white/85 font-medium">
                    Saved ₹{pricing.planSavings.toLocaleString('en-IN')}
                  </p>
                )}
                <p className="text-[11px] text-white/70 font-medium pt-1">
                  {duration === 'monthly'
                    ? '1 month billing cycle'
                    : duration === 'quarterly'
                    ? '3 months billing cycle'
                    : '1 year billing cycle'}
                </p>
              </div>

              {/* Detailed Price Breakdown Table */}
              <div className="space-y-2.5 text-xs pt-1">
                <div className="flex items-center justify-between text-[#5B6168]">
                  <span>Monthly rate</span>
                  <span className="font-semibold text-[#0B0B0C]">
                    ₹{pricing?.monthlyRate || 0} /mo
                  </span>
                </div>

                <div className="flex items-center justify-between text-[#5B6168]">
                  <span>
                    {pricing?.durationMonths || 1} {pricing?.durationMonths === 1 ? 'month' : 'months'}{' '}
                    total
                  </span>
                  <span className="font-semibold text-[#0B0B0C]">
                    ₹{pricing?.baseTotal || 0}
                  </span>
                </div>

                {pricing && pricing.planSavings > 0 && (
                  <div className="flex items-center justify-between text-[#0F7B3E] font-medium">
                    <span>Plan savings</span>
                    <span>- ₹{pricing.planSavings}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-[#5B6168]">
                  <span>Subtotal payable</span>
                  <span className="font-semibold text-[#0B0B0C]">
                    ₹{pricing?.subtotalPayable || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[#5B6168]">
                  <span>Coupon discount</span>
                  <span className="font-semibold text-[#0F7B3E]">
                    - ₹{pricing?.couponDiscount || 0}
                  </span>
                </div>

                <div className="border-t border-[#F0F1F4] pt-3 flex items-center justify-between text-sm">
                  <span className="font-bold text-[#0B0B0C]">Total</span>
                  <span className="text-2xl font-black text-[#0B0B0C]">
                    ₹{pricing ? pricing.finalPayable.toLocaleString('en-IN') : '0'}
                  </span>
                </div>
              </div>

              {/* Coupon Section */}
              <div className="border-t border-[#F0F1F4] pt-4">
                <span className="text-xs font-bold text-[#0B0B0C] mb-2 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#5B6168]" />
                  <span>Coupon</span>
                </span>

                {appliedCoupon ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#E4F7EC] border border-[#BDE8D0] text-[#0F7B3E] text-xs font-semibold">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{appliedCoupon} applied</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="text-xs font-bold hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="e.g. KUDUMBA10"
                      className="flex-1 h-10 px-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-bold uppercase text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45] transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={!couponCode.trim() || isLoadingPrice}
                      className="h-10 px-4 rounded-xl bg-[#F0F1F4] hover:bg-[#E6E8EC] disabled:opacity-50 text-xs font-bold text-[#0B0B0C] transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </form>
                )}

                {priceError && (
                  <p className="text-[11px] text-[#E03A45] font-semibold mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{priceError}</span>
                  </p>
                )}
              </div>

              {/* Proceed to Payment Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || isLoadingPrice}
                  className="w-full h-12 rounded-full bg-[#E03A45] hover:bg-[#C42F3A] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Continue to UPI Payment</span>
                    </>
                  )}
                </button>
                <p className="text-center text-[11px] text-[#7C879B] mt-2 font-medium">
                  Thank you for choosing Kudumba Vault.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
