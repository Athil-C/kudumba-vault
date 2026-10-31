import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../ui/DesignSystem';
import { WorkerRecordItem } from '../../types/vault';

export interface AddWorkerModalProps {
  lang: 'ml' | 'en';
  onClose: () => void;
  onSave: (worker: WorkerRecordItem) => void;
}

const TRADE_OPTIONS = [
  { value: 'Electrician', en: 'Electrician', ml: 'ഇലക്ട്രീഷ്യൻ', icon: 'Zap' },
  { value: 'Plumber', en: 'Plumber', ml: 'പ്ലംബർ', icon: 'Droplet' },
  { value: 'AC Service', en: 'AC Service', ml: 'എസി സർവീസ്', icon: 'Snowflake' },
  { value: 'Coconut Climber', en: 'Coconut Climber', ml: 'തെങ്ങുകയറ്റം', icon: 'Trees' },
  { value: 'Carpenter', en: 'Carpenter', ml: 'ആശാരി', icon: 'Hammer' },
  { value: 'Painter', en: 'Painter', ml: 'പെയിന്റർ', icon: 'Wrench' },
  { value: 'Driver', en: 'Driver', ml: 'ഡ്രൈവർ', icon: 'Car' },
  { value: 'Mason', en: 'Mason / Civil', ml: 'മേസ്തിരി / സിവിൽ', icon: 'Hammer' },
  { value: 'Gardener', en: 'Gardener / Cleaner', ml: 'തോട്ടം / ക്ലീനിംഗ്', icon: 'Trees' },
  { value: 'Appliance Repair', en: 'Appliance Repair', ml: 'അപ്ലയൻസ് സർവീസ്', icon: 'Wrench' },
  { value: 'General Worker', en: 'General Worker', ml: 'മറ്റ് വീട്ടുജോലികൾ', icon: 'Wrench' },
];

export const AddWorkerModal: React.FC<AddWorkerModalProps> = ({
  lang,
  onClose,
  onSave,
}) => {
  const [nameEn, setNameEn] = useState('');
  const [roleEn, setRoleEn] = useState('Electrician');
  const [areaEn, setAreaEn] = useState('');
  const [phone, setPhone] = useState('');
  const [rateAmount, setRateAmount] = useState('400');
  const [notesEn, setNotesEn] = useState('');
  const [firstWorkEn, setFirstWorkEn] = useState('');
  const [firstAmount, setFirstAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nameEn.trim();
    if (!cleanName) return;
    const cleanPhone = phone.trim();
    if (!cleanPhone) return;
    const cleanArea = areaEn.trim() || (lang === 'ml' ? 'കേരളം' : 'Kerala');
    const cleanRate = parseInt(rateAmount.replace(/\D/g, ''), 10) || 400;
    const amt = parseInt(firstAmount.replace(/\D/g, ''), 10) || 0;
    const today = new Date().toISOString().slice(0, 10);

    const selectedTrade = TRADE_OPTIONS.find((t) => t.value === roleEn);
    const tradeMl = selectedTrade?.ml || roleEn;
    const iconName = selectedTrade?.icon || 'Wrench';

    const initialHistory = firstWorkEn.trim()
      ? [
          {
            id: `wh-${Date.now()}`,
            date: today,
            workEn: firstWorkEn.trim(),
            workMl: firstWorkEn.trim(),
            amount: amt,
            paid: true,
          },
        ]
      : [];

    onSave({
      id: `wrk-${Date.now()}`,
      nameEn: cleanName,
      nameMl: cleanName,
      roleEn,
      roleMl: tradeMl,
      tradeEn: roleEn,
      tradeMl: tradeMl,
      tradeId: roleEn.toLowerCase().replace(/\s+/g, '-'),
      iconName,
      areaEn: cleanArea,
      areaMl: cleanArea,
      countryCode: '+91',
      phone: cleanPhone,
      whatsapp: '91' + cleanPhone.replace(/\D/g, '').slice(-10),
      rateAmount: cleanRate,
      rateUnit: 'per visit',
      lastServiceDate: today,
      lastVisit: today,
      notesEn: notesEn.trim(),
      notesMl: notesEn.trim(),
      rating: 5,
      favourite: false,
      history: initialHistory,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E6E8EC] pb-3">
          <h3 className="text-[16px] font-bold text-[#0B0B0C] tracking-tight font-malayalam">
            {lang === 'ml'
              ? 'പുതിയ ജോലിക്കാരനെ ചേർക്കുക'
              : 'Add Trusted Household Worker'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#F4F5F7] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-[#0B0B0C] mb-1 font-malayalam">
                {lang === 'ml' ? 'പേര് *' : 'Worker Name *'}
              </label>
              <input
                type="text"
                required
                placeholder={lang === 'ml' ? 'ഉദാ. രവി മേനോൻ' : 'e.g., Ravi Menon'}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-[#E6E8EC] bg-[#F4F5F7] px-3 text-[13px] text-[#0B0B0C] focus:bg-white focus:border-[#E03A45] focus:outline-none font-malayalam"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#0B0B0C] mb-1 font-malayalam">
                {lang === 'ml' ? 'ജോലി വിഭാഗം' : 'Trade / Role'}
              </label>
              <select
                value={roleEn}
                onChange={(e) => setRoleEn(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-[#E6E8EC] bg-[#F4F5F7] px-3 text-[13px] text-[#0B0B0C] focus:bg-white focus:border-[#E03A45] focus:outline-none font-malayalam cursor-pointer"
              >
                {TRADE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {lang === 'ml' ? `${t.ml} (${t.en})` : `${t.en} (${t.ml})`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-[#0B0B0C] mb-1 font-malayalam">
                {lang === 'ml' ? 'സ്ഥലം (Area)' : 'Locality / Area'}
              </label>
              <input
                type="text"
                placeholder={lang === 'ml' ? 'ഉദാ. ഇടപ്പള്ളി, കൊച്ചി' : 'e.g., Edappally, Kochi'}
                value={areaEn}
                onChange={(e) => setAreaEn(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-[#E6E8EC] bg-[#F4F5F7] px-3 text-[13px] text-[#0B0B0C] focus:bg-white focus:border-[#E03A45] focus:outline-none font-malayalam"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#0B0B0C] mb-1 font-malayalam">
                {lang === 'ml' ? 'ഫോൺ നമ്പർ *' : 'Phone / WhatsApp *'}
              </label>
              <input
                type="text"
                required
                placeholder={lang === 'ml' ? 'ഉദാ. 98470 12345' : 'e.g., 98470 12345'}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-[#E6E8EC] bg-[#F4F5F7] px-3 font-mono-tabular text-[13px] font-semibold text-[#0B0B0C] focus:bg-white focus:border-[#E03A45] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-[#0B0B0C] mb-1 font-malayalam">
                {lang === 'ml' ? 'സന്ദർശന നിരക്ക് (₹)' : 'Rate / Visit (₹)'}
              </label>
              <input
                type="text"
                placeholder="400"
                value={rateAmount}
                onChange={(e) => setRateAmount(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-[#E6E8EC] bg-[#F4F5F7] px-3 font-mono-tabular text-[13px] text-[#0B0B0C] focus:bg-white focus:border-[#E03A45] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#0B0B0C] mb-1 font-malayalam">
                {lang === 'ml' ? 'കുറിപ്പുകൾ' : 'Notes'}
              </label>
              <input
                type="text"
                placeholder={lang === 'ml' ? 'ഉദാ. കൃത്യസമയത്ത് എത്തുന്നയാൾ' : 'e.g., Very punctual, carries own tools'}
                value={notesEn}
                onChange={(e) => setNotesEn(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-[#E6E8EC] bg-[#F4F5F7] px-3 text-[13px] text-[#0B0B0C] focus:bg-white focus:border-[#E03A45] focus:outline-none font-malayalam"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[12px] font-semibold text-[#0B0B0C] mb-1 font-malayalam">
                {lang === 'ml' ? 'അവസാനം ചെയ്ത ജോലി (ഓപ്ഷണൽ)' : 'Recent Work Done (Optional)'}
              </label>
              <input
                type="text"
                placeholder={lang === 'ml' ? 'ഉദാ. ആദ്യ സർവീസും പരിശോധനയും' : 'e.g., Initial service & inspection'}
                value={firstWorkEn}
                onChange={(e) => setFirstWorkEn(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-[#E6E8EC] bg-[#F4F5F7] px-3 text-[13px] text-[#0B0B0C] focus:bg-white focus:border-[#E03A45] focus:outline-none font-malayalam"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#0B0B0C] mb-1 font-malayalam">
                {lang === 'ml' ? 'നൽകിയ തുക (₹)' : 'Paid Amount (₹)'}
              </label>
              <input
                type="text"
                placeholder="450"
                value={firstAmount}
                onChange={(e) => setFirstAmount(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-[#E6E8EC] bg-[#F4F5F7] px-3 font-mono-tabular text-[13px] font-semibold text-[#0B0B0C] focus:bg-white focus:border-[#E03A45] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline-ink" onClick={onClose}>
              <span className="font-malayalam">{lang === 'ml' ? 'റദ്ദാക്കുക' : 'Cancel'}</span>
            </Button>
            <Button type="submit" variant="primary">
              <Plus className="h-4 w-4 stroke-[2.4]" />
              <span className="font-malayalam">{lang === 'ml' ? 'സേവ് ചെയ്യുക' : 'Save Worker'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
