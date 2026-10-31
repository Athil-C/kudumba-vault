import React, { useState } from 'react';
import { Files, Search, ShieldCheck, Tag } from 'lucide-react';

interface DocumentsScreenProps {
  data: any;
  loading: boolean;
}

export const DocumentsScreen: React.FC<DocumentsScreenProps> = ({ data, loading }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const rawDocs = data?.documents;
  const documents = Array.isArray(rawDocs) ? rawDocs : [];
  const rawCatDist = data?.categoryDistribution;
  const categoryDistribution = Array.isArray(rawCatDist) ? rawCatDist : [];
  const pagination = data?.pagination || { total: documents.length, page: 1, totalPages: 1 };

  const filteredDocs = documents.filter((doc: any) => {
    const matchesCat = !selectedCategory || doc.category === selectedCategory;
    const matchesSearch =
      !searchTerm ||
      doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.fileName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
            selectedCategory === ''
              ? 'bg-[#E03A45] text-white shadow-xs'
              : 'bg-white text-[#5B6168] border border-[#E6E8EC] hover:bg-[#F4F5F7]'
          }`}
        >
          All Categories ({pagination.total})
        </button>
        {categoryDistribution.map((c: any) => (
          <button
            key={c._id}
            onClick={() => setSelectedCategory(c._id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              selectedCategory === c._id
                ? 'bg-[#E03A45] text-white shadow-xs'
                : 'bg-white text-[#5B6168] border border-[#E6E8EC] hover:bg-[#F4F5F7]'
            }`}
          >
            {c._id} ({c.count})
          </button>
        ))}
      </div>

      {/* Search Header */}
      <div className="flex items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#E6E8EC]">
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5B6168]" />
          <input
            type="text"
            placeholder="Search document title or file..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8F9FA] border border-[#E6E8EC] rounded-lg focus:outline-none focus:border-[#E03A45]"
          />
        </div>
        <div className="text-xs text-[#5B6168] flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Private URL Isolation Enforced</span>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-[#E6E8EC] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E6E8EC] bg-[#FAFAFA] text-[#5B6168] font-semibold">
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Owner</th>
                <th className="py-3 px-4">File Name</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E8EC]">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#5B6168]">
                    No document records matching query.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc: any) => (
                  <tr key={doc._id} className="hover:bg-[#F9FAFB]">
                    <td className="py-3 px-4 font-bold text-[#0B0B0C]">{doc.title}</td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#F4F5F7] text-[#0B0B0C] border border-[#E6E8EC]">
                        {doc.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0B0B0C]">{doc.ownerId?.name || 'Owner'}</div>
                      <div className="text-[11px] text-[#5B6168]">{doc.ownerId?.email}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#5B6168] truncate max-w-xs">
                      {doc.fileName}
                    </td>
                    <td className="py-3 px-4 text-[#5B6168]">
                      {doc.fileSize ? `${Math.round(doc.fileSize / 1024)} KB` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-[#5B6168]">
                      {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : 'Lifetime'}
                    </td>
                    <td className="py-3 px-4 text-[#5B6168]">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
