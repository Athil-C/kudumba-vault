import React, { useState } from 'react';
import { Home, Users, Files, Search } from 'lucide-react';

interface FamiliesScreenProps {
  data: any;
  loading: boolean;
}

export const FamiliesScreen: React.FC<FamiliesScreenProps> = ({ data, loading }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const rawFamilies = data?.families;
  const families = Array.isArray(rawFamilies) ? rawFamilies : [];
  const pagination = data?.pagination || { total: families.length, page: 1, totalPages: 1 };

  const filteredFamilies = families.filter((f: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      f.owner?.name?.toLowerCase().includes(term) ||
      f.owner?.familyName?.toLowerCase().includes(term) ||
      f.owner?.email?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#E6E8EC]">
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5B6168]" />
          <input
            type="text"
            placeholder="Search family name or owner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8F9FA] border border-[#E6E8EC] rounded-lg focus:outline-none focus:border-[#E03A45]"
          />
        </div>
        <div className="text-xs text-[#5B6168]">
          Total Verified Households: <span className="font-bold text-[#0B0B0C]">{pagination.total}</span>
        </div>
      </div>

      {/* Families Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredFamilies.length === 0 ? (
          <div className="col-span-full py-12 text-center text-[#5B6168] bg-white rounded-xl border border-[#E6E8EC]">
            No verified household groups found.
          </div>
        ) : (
          filteredFamilies.map((fam: any, idx: number) => (
            <div key={fam.owner?.id || idx} className="bg-white p-5 rounded-xl border border-[#E6E8EC] shadow-2xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[#0B0B0C]">
                    {fam.owner?.familyName ? `${fam.owner.familyName} Household` : `${fam.owner?.name}'s Family`}
                  </h4>
                  <p className="text-[11px] text-[#5B6168]">Owner: {fam.owner?.email}</p>
                </div>
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Home className="h-4 w-4" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E6E8EC] text-xs">
                <div className="bg-[#F8F9FA] p-2.5 rounded-lg border border-[#E6E8EC]">
                  <span className="text-[10px] text-[#5B6168] uppercase font-semibold">Members</span>
                  <p className="font-bold text-sm text-[#0B0B0C] mt-0.5">{fam.memberCount}</p>
                </div>
                <div className="bg-[#F8F9FA] p-2.5 rounded-lg border border-[#E6E8EC]">
                  <span className="text-[10px] text-[#5B6168] uppercase font-semibold">Documents</span>
                  <p className="font-bold text-sm text-[#0B0B0C] mt-0.5">{fam.documentCount}</p>
                </div>
              </div>

              {fam.members && fam.members.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-semibold text-[#5B6168]">Registered Members:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {fam.members.map((m: any) => (
                      <span
                        key={m.id}
                        className="text-[10px] bg-[#F4F5F7] border border-[#E6E8EC] px-2 py-0.5 rounded-md font-medium text-[#0B0B0C]"
                      >
                        {m.nameEn} ({m.relationEn})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
