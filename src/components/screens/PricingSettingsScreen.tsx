import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/DesignSystem';

export interface Screen6PricingProps {
  lang: 'ml' | 'en';
  onStart: () => void;
}

export const Screen6Pricing: React.FC<Screen6PricingProps> = ({
  lang,
  onStart,
}) => {
  const plans = [
    {
      nameMl: 'തുടക്കം (Starter Free)',
      nameEn: 'Starter Vault',
      price: '₹0',
      periodMl: '/ എന്നേക്കും സൗജന്യം',
      periodEn: '/ forever free',
      badge: null,
      featuresMl: [
        '10 പ്രധാന കുടുംബ രേഖകൾ വരെ സൂക്ഷിക്കാം',
        '2 കുടുംബാംഗങ്ങൾക്ക് പ്രവേശനം',
        'ഇമെയിൽ വഴി കാലാവധി അലേർട്ടുകൾ',
        'ജോലിക്കാരുടെ ബുക്ക് (5 പേർ വരെ)',
      ],
      featuresEn: [
        'Up to 10 encrypted household documents',
        '2 family members included',
        'Email expiry alerts (60, 30, 7 days)',
        'Workers Book (up to 5 trusted tradespeople)',
      ],
      ctaMl: 'സൗജന്യമായി തുടങ്ങുക',
      ctaEn: 'Current Free Plan',
      highlighted: false,
    },
    {
      nameMl: 'കുടുംബം പ്ലാൻ (Kudumbam Plus)',
      nameEn: 'Kudumbam Family',
      price: '₹99',
      periodMl: '/ മാസം (₹999/വർഷം)',
      periodEn: '/ month (billed ₹999/yr)',
      badge:
        lang === 'ml'
          ? 'ഏറ്റവും ജനപ്രിയം'
          : 'Most Popular for Kerala + Gulf',
      featuresMl: [
        'പരിധിയില്ലാത്ത രേഖകളും PDF സ്കാനുകളും',
        '6 കുടുംബാംഗങ്ങൾ (നാട്ടിലും ഗൾഫിലും ഉള്ളവർക്ക്)',
        'ഓട്ടോമേറ്റഡ് ഇമെയിൽ കാലാവധി അലേർട്ടുകൾ (60/30/7/1d)',
        'ഇഖാമ, പാസ്‌പോർട്ട്, ഭൂനികുതി, വാഹന RC ട്രാക്കർ',
        'ജോലിക്കാരുടെ പൂർണ്ണ ബുക്കും വാറന്റി രസീതുകളും',
      ],
      featuresEn: [
        'Unlimited documents, multi-page PDFs & photos',
        'Up to 6 family members across Kerala & Gulf',
        'Automated Email expiry reminders (60/30/7/1d)',
        'Iqama, Passport, Land Tax & Gold Loan trackers',
        'Unlimited Workers Book & service history logs',
      ],
      ctaMl: 'കുടുംബ പ്ലാൻ തിരഞ്ഞെടുക്കുക',
      ctaEn: 'Choose Family Plan',
      highlighted: true,
    },
    {
      nameMl: 'തറവാട് / NRI Pro',
      nameEn: 'Tharavadu / NRI Pro',
      price: '₹249',
      periodMl: '/ മാസം',
      periodEn: '/ month',
      badge: null,
      featuresMl: [
        '2 വീടുകൾ (ഉദാ: കൊച്ചി + ദുബായ് / മാതാപിതാക്കളുടെ വീട്)',
        '15 കുടുംബാംഗങ്ങൾ വരെ',
        'സിഎ / ലോയർ / ഏജന്റ് എന്നിവർക്ക് സുരക്ഷിത ഷെയർ ലിങ്ക്',
        'അടിയന്തര മെഡിക്കൽ & ഇൻഷുറൻസ് കാർഡ് പായ്ക്ക്',
      ],
      featuresEn: [
        '2 Households (e.g., Parents home in Kerala + NRI home)',
        'Up to 15 extended family members',
        'Expiring CA / Lawyer / Agent share links',
        '1-tap Emergency Medical & Insurance Share Pack',
      ],
      ctaMl: 'NRI Pro തിരഞ്ഞെടുക്കുക',
      ctaEn: 'Start NRI Pro Trial',
      highlighted: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <span className="inline-block rounded-full bg-[#F4F5F7] px-4 py-1 text-[16px] font-medium text-[#E03A45]">
          {lang === 'ml' ? 'ലളിതമായ നിരക്കുകൾ' : 'Simple Household Pricing'}
        </span>
        <h2 className="text-[24px] sm:text-[28px] font-semibold text-[#0B0B0C] font-malayalam">
          {lang === 'ml'
            ? 'ഒരു രേഖയുടെ പിഴത്തുകയേക്കാൾ കുറഞ്ഞ നിരക്കിൽ കുടുംബ വോൾട്ട്'
            : 'Cheaper than a single late vehicle insurance or Iqama fine'}
        </h2>
        <p className="text-[16px] text-[#5B6168]">
          {lang === 'ml'
            ? 'നിങ്ങളുടെ കുടുംബത്തിന്റെ സ്വകാര്യ ഡിജിറ്റൽ ലോക്കർ — പരസ്യങ്ങളില്ല.'
            : 'Private family organizer — never sells data, no ads, cancel anytime.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {plans.map((plan, idx) => (
          <div
            key={idx}
            className={`rounded-[24px] border p-6 sm:p-8 flex flex-col justify-between ${
              plan.highlighted
                ? 'border-2 border-[#E03A45] bg-white shadow-lg relative'
                : 'border-[#E6E8EC] bg-white'
            }`}
          >
            <div>
              {plan.badge && (
                <span className="inline-block mb-3 rounded-full bg-[#FFF4D6] px-3.5 py-1 text-[16px] font-medium text-[#A85A00]">
                  {plan.badge}
                </span>
              )}
              <h3 className="text-[20px] font-semibold text-[#0B0B0C] font-malayalam">
                {lang === 'ml' ? plan.nameMl : plan.nameEn}
              </h3>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[36px] font-bold text-[#0B0B0C]">
                  {plan.price}
                </span>
                <span className="text-[16px] text-[#5B6168]">
                  {lang === 'ml' ? plan.periodMl : plan.periodEn}
                </span>
              </div>

              <ul className="mt-6 space-y-3">
                {(lang === 'ml' ? plan.featuresMl : plan.featuresEn).map(
                  (feat, fIdx) => (
                    <li
                      key={fIdx}
                      className="flex items-start gap-2.5 text-[16px] text-[#0B0B0C] font-malayalam"
                    >
                      <CheckCircle2 className="h-5 w-5 text-[#0F7B3E] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  )
                )}
              </ul>
            </div>

            <div className="mt-8">
              <Button
                variant={plan.highlighted ? 'primary' : 'outline'}
                size="lg"
                className="w-full"
                onClick={onStart}
              >
                <span>{lang === 'ml' ? plan.ctaMl : plan.ctaEn}</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
