import React, { useState } from 'react';
import {
  Trash2,
  Check,
  Download,
  Image as ImageIcon,
  Loader2,
  Plus,
  Eye,
  FolderLock,
} from 'lucide-react';
import { Button, Card, EmptyState } from '../ui/DesignSystem';
import { SharePackItem, VaultDocumentItem } from '../../types/vault';
import {
  buildSharePackPdfBlob,
  downloadDocImage,
  downloadAllPackImages,
} from '../../utils/sharePackPdf';
import { getEffectiveDocImageDataUrl } from '../../utils/documentCardGenerator';

export interface SharePacksScreenProps {
  lang: 'ml' | 'en';
  sharePacks: SharePackItem[];
  docs: VaultDocumentItem[];
  onOpenAddShareModal: () => void;
  onDeleteSharePack: (packId: string) => void;
  onOpenDocDetail: (doc: VaultDocumentItem) => void;
}

export const SharePacksScreen: React.FC<SharePacksScreenProps> = ({
  lang,
  sharePacks,
  docs,
  onOpenAddShareModal,
  onDeleteSharePack,
  onOpenDocDetail,
}) => {
  const [downloadingPdfPackId, setDownloadingPdfPackId] = useState<string | null>(null);
  const [downloadedPdfPackId, setDownloadedPdfPackId] = useState<string | null>(null);
  const [downloadingImgPackId, setDownloadingImgPackId] = useState<string | null>(null);
  const [downloadedImgPackId, setDownloadedImgPackId] = useState<string | null>(null);

  /**
   * Generates and downloads a multi-page PDF containing:
   * 1. Overview summary page with recipient, purpose, and index
   * 2. Full-page high-resolution scans for every included document
   */
  const handleDownloadPackPdf = async (
    pack: SharePackItem,
    bundledDocs: VaultDocumentItem[]
  ) => {
    if (downloadingPdfPackId) return;
    try {
      setDownloadingPdfPackId(pack.id);
      const blob = await buildSharePackPdfBlob(pack, bundledDocs);
      const url = URL.createObjectURL(blob);
      const slug = pack.titleEn
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug || 'share-pack'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      setDownloadedPdfPackId(pack.id);
      setTimeout(() => setDownloadedPdfPackId(null), 3000);
    } catch (err) {
      console.error('Failed to download share pack PDF:', err);
    } finally {
      setDownloadingPdfPackId(null);
    }
  };

  /**
   * Directly downloads all included document images as high-resolution image files (.png / .jpg).
   */
  const handleDownloadPackImages = async (
    pack: SharePackItem,
    bundledDocs: VaultDocumentItem[]
  ) => {
    if (downloadingImgPackId) return;
    try {
      setDownloadingImgPackId(pack.id);
      await downloadAllPackImages(pack, bundledDocs);
      setDownloadedImgPackId(pack.id);
      setTimeout(() => setDownloadedImgPackId(null), 3000);
    } catch (err) {
      console.error('Failed to download images:', err);
    } finally {
      setDownloadingImgPackId(null);
    }
  };

  /**
   * Downloads a single document's original scan image.
   */
  const handleDownloadSingleDocImage = (
    e: React.MouseEvent,
    doc: VaultDocumentItem,
    packTitle?: string
  ) => {
    e.stopPropagation();
    downloadDocImage(doc, packTitle);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold text-[#0B0B0C] font-malayalam tracking-tight">
            {lang === 'ml'
              ? 'സുരക്ഷിത ഷെയർ പായ്ക്കുകൾ'
              : 'Expiring Share Packs'}
          </h2>
          <p className="text-[13px] text-[#5B6168] mt-0.5">
            {lang === 'ml'
              ? 'ആശുപത്രി, സിഎ, വില്ലേജ് ഓഫീസ് എന്നിവർക്ക് യഥാർത്ഥ രേഖകളുടെ സ്കാനുകൾ ഉൾപ്പെടുന്ന പായ്ക്കുകൾ അയക്കാം.'
              : 'Create time-limited, view-only document bundles with high-resolution scans for hospitals, CAs, or village offices.'}
          </p>
        </div>

        <Button
          variant="primary"
          onClick={onOpenAddShareModal}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>{lang === 'ml' ? 'പുതിയ ഷെയർ പായ്ക്ക്' : 'New Share Pack'}</span>
        </Button>
      </div>

      {sharePacks.length === 0 ? (
        <EmptyState
          icon={FolderLock}
          title={
            lang === 'ml'
              ? 'ഷെയർ പായ്ക്കുകളൊന്നും സൃഷ്ടിച്ചിട്ടില്ല'
              : 'No share packs created yet'
          }
          subtitle={
            lang === 'ml'
              ? 'ആശുപത്രി, വില്ലേജ് ഓഫീസ്, വിസ ആവശ്യങ്ങൾക്കായി രേഖകളുടെ താൽക്കാലിക വ്യൂ-ഒൺലി ലിങ്ക് പായ്ക്ക് തയ്യാറാക്കാം.'
              : 'Create time-limited, view-only document bundles with high-resolution scans for hospitals, CAs, or village offices.'
          }
          ctaLabel={lang === 'ml' ? '+ പുതിയ ഷെയർ പായ്ക്ക്' : '+ New Share Pack'}
          onCta={onOpenAddShareModal}
          bullets={
            lang === 'ml'
              ? [
                  'സമയപരിധി നിശ്ചയിച്ച ആക്സസ്',
                  'കാണാൻ മാത്രമുള്ള സുരക്ഷിത ലിങ്കുകൾ',
                  'ഉയർന്ന നിലവാരമുള്ള സ്കാനുകൾ',
                  'സ്വീകർത്താവിന് അക്കൗണ്ട് ആവശ്യമില്ല',
                ]
              : [
                  'Time-limited access',
                  'View-only links',
                  'High-resolution files',
                  'No account required',
                ]
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sharePacks.map((pack) => {
          const bundledDocs = docs.filter((d) => pack.docIds.includes(d.id));
          const isDownloadingPdf = downloadingPdfPackId === pack.id;
          const isDownloadedPdf = downloadedPdfPackId === pack.id;
          const isDownloadingImg = downloadingImgPackId === pack.id;
          const isDownloadedImg = downloadedImgPackId === pack.id;

          const badgeLabel =
            lang === 'ml'
              ? pack.expiryLabelMl || pack.tag || 'PDF പായ്ക്ക്'
              : pack.expiryLabelEn || pack.tag || 'PDF Pack';
          const subtitleText =
            lang === 'ml'
              ? pack.recipientMl || pack.descMl || ''
              : pack.recipientEn || pack.descEn || '';

          return (
            <Card
              key={pack.id}
              className="flex flex-col justify-between gap-4 transition-all hover:shadow-md"
            >
              <div className="space-y-3.5">
                {/* Top Badge & Delete Button */}
                <div className="flex items-center justify-between">
                  <span className="inline-block rounded-full bg-[#FFF4D6] px-3.5 py-1 text-xs font-bold text-[#A85A00]">
                    {badgeLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteSharePack(pack.id)}
                    aria-label="Delete share pack"
                    className="text-[#5B6168] hover:text-[#B3121F] p-1.5 rounded-lg hover:bg-[#F4F5F7] transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4.5 w-4.5" />
                  </button>
                </div>

                {/* Pack Title & Purpose */}
                <div>
                  <h3 className="text-[18px] font-semibold text-[#0B0B0C] font-malayalam leading-snug">
                    {lang === 'ml' ? pack.titleMl : pack.titleEn}
                  </h3>
                  {subtitleText && (
                    <p className="text-[13px] text-[#5B6168] font-malayalam mt-1">
                      {subtitleText}
                    </p>
                  )}
                </div>

                {/* Included Documents with Visual Thumbnail Previews */}
                {bundledDocs.length > 0 && (
                  <div className="pt-2 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-[#0B0B0C]">
                        {lang === 'ml'
                          ? `ഉൾപ്പെടുത്തിയ രേഖകൾ (${bundledDocs.length})`
                          : `Included Docs (${bundledDocs.length})`}
                      </span>
                      <span className="text-[11px] font-medium text-[#15803D] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                        {lang === 'ml' ? 'സ്കാനുകൾ ലഭ്യമാണ്' : 'Scans Included'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {bundledDocs.map((bd) => {
                        const imgUrl = getEffectiveDocImageDataUrl(bd);
                        return (
                          <div
                            key={bd.id}
                            onClick={() => onOpenDocDetail(bd)}
                            className="group flex items-center justify-between gap-2.5 p-2 rounded-xl bg-[#F8F9FA] border border-[#E6E8EC] hover:border-[#E03A45] hover:bg-white transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {/* Document Scan Thumbnail */}
                              <div className="h-10 w-14 shrink-0 rounded-lg overflow-hidden border border-[#E6E8EC] bg-white flex items-center justify-center shadow-2xs">
                                <img
                                  src={imgUrl}
                                  alt={bd.titleEn}
                                  className="h-full w-full object-cover"
                                />
                              </div>

                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-[#0B0B0C] truncate font-malayalam group-hover:text-[#E03A45] transition-colors">
                                  {lang === 'ml' ? bd.titleMl : bd.titleEn}
                                </p>
                                <p className="text-[11px] text-[#5B6168] truncate">
                                  {bd.ownerEn} • {bd.docNumber}
                                </p>
                              </div>
                            </div>

                            {/* Quick Action Icons */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                title={
                                  lang === 'ml'
                                    ? 'ചിത്രം ഡൗൺലോഡ് ചെയ്യുക'
                                    : 'Download exact image scan'
                                }
                                onClick={(e) =>
                                  handleDownloadSingleDocImage(e, bd, pack.titleEn)
                                }
                                className="p-1.5 rounded-lg text-[#5B6168] hover:text-[#E03A45] hover:bg-[#F4F5F7] transition-colors cursor-pointer"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                              <div className="p-1.5 text-[#8A949E] group-hover:text-[#0B0B0C]">
                                <Eye className="h-4 w-4" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons: Full PDF with Scans + Direct Image Download */}
              <div className="space-y-2 pt-3 border-t border-[#E6E8EC]">
                {/* 1. PDF with Embedded Scans */}
                <Button
                  variant={isDownloadedPdf ? 'secondary' : 'primary'}
                  className="w-full flex items-center justify-center gap-2 py-2.5"
                  disabled={isDownloadingPdf}
                  onClick={() => handleDownloadPackPdf(pack, bundledDocs)}
                >
                  {isDownloadingPdf ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>
                        {lang === 'ml'
                          ? 'PDF തയ്യാറാക്കുന്നു...'
                          : 'Generating PDF with Scans...'}
                      </span>
                    </>
                  ) : isDownloadedPdf ? (
                    <>
                      <Check className="h-4 w-4 text-[#0F7B3E]" />
                      <span>
                        {lang === 'ml'
                          ? 'PDF ഡൗൺലോഡ് ചെയ്തു!'
                          : 'PDF Downloaded!'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>
                        {lang === 'ml'
                          ? 'PDF ഡൗൺലോഡ് ചെയ്യുക (സ്കാനുകളോടെ)'
                          : 'Download PDF (with Scans)'}
                      </span>
                    </>
                  )}
                </Button>

                {/* 2. Direct Image Download */}
                <Button
                  variant={isDownloadedImg ? 'secondary' : 'outline'}
                  className="w-full flex items-center justify-center gap-2 py-2 text-[13px]"
                  disabled={isDownloadingImg}
                  onClick={() => handleDownloadPackImages(pack, bundledDocs)}
                >
                  {isDownloadingImg ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0B0B0C]" />
                      <span>
                        {lang === 'ml'
                          ? 'ചിത്രങ്ങൾ സേവ് ചെയ്യുന്നു...'
                          : 'Saving Images...'}
                      </span>
                    </>
                  ) : isDownloadedImg ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#0F7B3E]" />
                      <span>
                        {lang === 'ml'
                          ? 'ചിത്രങ്ങൾ സേവ് ചെയ്തു!'
                          : 'Images Saved!'}
                      </span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-3.5 w-3.5 text-[#5B6168]" />
                      <span>
                        {lang === 'ml'
                          ? 'യഥാർത്ഥ ചിത്രങ്ങൾ ഡൗൺലോഡ് ചെയ്യുക'
                          : 'Download Images'}
                      </span>
                    </>
                  )}
                </Button>

                <p className="text-[11px] text-[#8A949E] text-center pt-0.5">
                  {lang === 'ml'
                    ? 'രേഖകളുടെ യഥാർത്ഥ സ്കാനുകൾ ഓരോ പേജിലും ചേർത്തിട്ടുണ്ട്.'
                    : 'Original document scans are embedded on dedicated pages.'}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
};
