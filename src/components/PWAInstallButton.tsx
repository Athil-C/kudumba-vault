import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  lang: 'ml' | 'en';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const label = lang === 'ml' ? 'ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യുക' : 'Install App';

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (isInstallable) {
            await install();
          } else {
            setShowGuide(true);
          }
        }}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#EA4C46] px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#D43B35] whitespace-nowrap shrink-0 cursor-pointer"
        aria-label={label}
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEE2E2] text-[#EA4C46]">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="pwa-guide-title" className="text-lg font-bold text-[#0F172A]">
                    {lang === 'ml'
                      ? 'ഫോണിൽ കുടുംബ വോൾട്ട് ഇൻസ്റ്റാൾ ചെയ്യാം'
                      : 'Install Kudumba Vault'}
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    {isIOS ? 'iPhone / iPad Safari' : 'Android Chrome / Desktop'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F3F4F6]"
                aria-label="Close install instructions"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm text-[#0F172A]">
              <p>
                <strong>1.</strong>{' '}
                {lang === 'ml'
                  ? 'ബ്രൗസർ മെനുവിലെ Share അല്ലെങ്കിൽ Menu (⋮) ബട്ടൺ അമർത്തുക.'
                  : 'Tap the browser Share icon or Menu (⋮) button in your address bar.'}
              </p>
              <p>
                <strong>2.</strong>{' '}
                {lang === 'ml'
                  ? '“Add to Home Screen” (ഹോം സ്ക്രീനിലേക്ക് ചേർക്കുക) തിരഞ്ഞെടുക്കുക.'
                  : 'Select “Add to Home Screen” or “Install App” for fast offline access.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[48px] rounded-full bg-[#EA4C46] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D43B35] cursor-pointer"
            >
              {lang === 'ml' ? 'മനസ്സിലായി' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
