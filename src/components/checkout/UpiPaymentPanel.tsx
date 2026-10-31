import React, { useState } from 'react';
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  Upload,
  RefreshCw,
  Copy,
  Check,
  X,
  FileText,
  Calendar,
  MessageSquare,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import {
  apiSubmitPaymentProof,
  apiCancelPaymentRequest,
  PaymentRequestClient,
} from '../../services/apiClient';
import { Language } from '../../types/vault';

interface UpiPaymentPanelProps {
  request: PaymentRequestClient;
  qrSvg?: string;
  qrDataUrl?: string;
  upiUri?: string;
  upiConfig?: {
    upiId: string;
    merchantName: string;
    whatsappNumber: string;
  };
  lang?: Language;
  onPaymentSubmitted: (updatedRequest: PaymentRequestClient) => void;
  onRequestCancelled: () => void;
}

export const UpiPaymentPanel: React.FC<UpiPaymentPanelProps> = ({
  request,
  qrSvg,
  qrDataUrl,
  upiUri,
  upiConfig,
  lang = 'en',
  onPaymentSubmitted,
  onRequestCancelled,
}) => {
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Form state
  const [utrNumber, setUtrNumber] = useState(request.utrNumber || '');
  const [paymentDate, setPaymentDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  });
  const [remarks, setRemarks] = useState(request.remarks || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Copy state
  const [copiedUpi, setCopiedUpi] = useState(false);

  const activeUpiId = upiConfig?.upiId || 'kudumbavault@oksbi';
  const activeMerchant = upiConfig?.merchantName || 'Kudumba Vault';
  const activeWhatsapp =
    upiConfig?.whatsappNumber ||
    ((import.meta as any).env?.VITE_WHATSAPP_SUPPORT_NUMBER
      ? `+${(import.meta as any).env.VITE_WHATSAPP_SUPPORT_NUMBER}`
      : '+91 94470 00000');

  const handleCopyUpi = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(activeUpiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2500);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSubmitError('Please upload a JPG, PNG, or WebP screenshot image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSubmitError('Screenshot file size cannot exceed 5 MB.');
      return;
    }

    setSelectedFile(file);
    setSubmitError(null);

    const reader = new FileReader();
    reader.onload = () => {
      setFilePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this pending payment request?')) {
      return;
    }
    setIsCancelling(true);
    setCancelError(null);
    try {
      const requestId = String(request._id || request.id || '');
      if (!requestId) {
        throw new Error('Payment request ID not found.');
      }
      await apiCancelPaymentRequest(requestId);
      onRequestCancelled();
    } catch (err: any) {
      setCancelError(err?.message || 'Failed to cancel payment request.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const cleanUtr = utrNumber.trim().toUpperCase();
    if (!cleanUtr) {
      setSubmitError('Please enter the 12-digit UPI / UTR transaction reference number.');
      return;
    }
    if (!/^[A-Z0-9]{8,32}$/.test(cleanUtr)) {
      setSubmitError('Invalid UTR format. Please enter a valid 8 to 32 alphanumeric UTR number.');
      return;
    }
    if (!selectedFile && !request.proofFilePath) {
      setSubmitError('Payment screenshot proof is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append('requestId', request._id || request.id || '');
      formData.append('utrNumber', cleanUtr);
      formData.append('paymentDate', new Date(paymentDate).toISOString());
      if (remarks.trim()) {
        formData.append('remarks', remarks.trim());
      }
      if (selectedFile) {
        formData.append('proof', selectedFile);
      }

      const res = await apiSubmitPaymentProof(formData);
      if (res && res.ok) {
        setSubmitSuccess('Payment proof submitted successfully! Our team is verifying your payment.');
        onPaymentSubmitted(res.request);
        setTimeout(() => {
          setIsSubmitModalOpen(false);
        }, 1500);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit payment proof.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isNri = request.subscriptionPlanId === 'nri-plus';
  const hasProof = Boolean(request.utrNumber || request.proofFilePath);

  return (
    <div className="rounded-[28px] border border-[#E6E8EC] bg-white p-6 sm:p-7 shadow-xs space-y-6 animate-in fade-in duration-200">
      {/* Header status badge & title (Festie layout) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F0F1F4]">
        <div>
          <span className="text-[11px] font-extrabold tracking-wider uppercase text-[#E03A45] flex items-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span>REQUEST PENDING</span>
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-[#0B0B0C] tracking-tight">
            {hasProof ? 'Payment submitted — awaiting verification' : 'Your subscription is pending.'}
          </h2>
          <p className="text-xs text-[#5B6168] mt-0.5 font-medium">
            Request Reference: <span className="font-mono font-bold text-[#0B0B0C]">{request._id || request.id}</span>
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[#FDECEE] text-[#E03A45] border border-[#F9C3C6] w-fit">
          <span className="w-2 h-2 rounded-full bg-[#E03A45] animate-pulse" />
          <span>{hasProof ? 'AWAITING VERIFICATION' : 'PENDING'}</span>
        </span>
      </div>

      {cancelError && (
        <div className="p-3.5 rounded-xl bg-[#FDECEE] border border-[#F9C3C6] text-[#E03A45] text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{cancelError}</span>
        </div>
      )}

      {/* Main UPI QR & Plan Details Grid (Festie Screenshot 3 Layout) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Left Box: UPI QR Code Card (5 cols) */}
        <div className="md:col-span-5 flex flex-col items-center p-5 rounded-2xl bg-[#FAFAFA] border border-[#E6E8EC]">
          {/* UPI Badge */}
          <div className="flex items-center gap-1.5 mb-3">
            <div className="px-2.5 py-1 rounded-md bg-[#0B0B0C] text-white text-[11px] font-black tracking-wider flex items-center gap-1">
              <span className="text-[#0F7B3E]">UPI</span>
              <span className="text-white">UNIFIED PAYMENTS</span>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="p-3 bg-white rounded-xl shadow-xs border border-[#E6E8EC] flex items-center justify-center">
            {qrSvg ? (
              <div
                dangerouslySetInnerHTML={{ __html: qrSvg }}
                className="w-56 h-56 flex items-center justify-center"
              />
            ) : qrDataUrl ? (
              <img src={qrDataUrl} alt="UPI QR Code" className="w-56 h-56 object-contain" />
            ) : (
              <div className="w-56 h-56 flex flex-col items-center justify-center text-[#5B6168] text-xs">
                <QrCode className="w-12 h-12 mb-2 text-[#7C879B]" />
                <span>Loading payment QR...</span>
              </div>
            )}
          </div>

          {/* Amount Badge below QR */}
          <div className="mt-3 text-center">
            <span className="text-[10px] font-extrabold uppercase text-[#5B6168] tracking-wider block">
              PAYABLE AMOUNT
            </span>
            <span className="text-2xl font-black text-[#0B0B0C]">
              ₹{request.payableAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Right Box: Plan details, delta pills, instructions, buttons (7 cols) */}
        <div className="md:col-span-7 space-y-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black text-[#0B0B0C]">{request.planNameSnapshot}</span>
              <span className="text-xs font-bold text-[#5B6168]">
                {request.billingDuration === 'monthly'
                  ? '1 month'
                  : request.billingDuration === 'quarterly'
                  ? '3 months'
                  : '1 year'}
              </span>
              <span className="text-sm font-black text-[#0B0B0C] ml-auto">
                ₹{request.payableAmount.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Feature Delta Pills */}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F0F1F4] text-[#0B0B0C] text-[11px] font-extrabold">
                <span className="text-[#0F7B3E] font-black">+</span>
                <span>{isNri ? '15 GB STORAGE' : '100 GB STORAGE'}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F0F1F4] text-[#0B0B0C] text-[11px] font-extrabold">
                <span className="text-[#0F7B3E] font-black">+</span>
                <span>{isNri ? '7 FAMILY MEMBERS' : '50 CLIENTS'}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F0F1F4] text-[#0B0B0C] text-[11px] font-extrabold">
                <span className="text-[#0F7B3E] font-black">+</span>
                <span>WHATSAPP LINKS</span>
              </span>
            </div>
          </div>

          {/* Bilingual Instructions text */}
          <p className="text-xs text-[#5B6168] leading-relaxed font-medium">
            Scan the UPI QR code using any UPI app (GPay, PhonePe, Paytm, or BHIM). Complete payment with the
            exact displayed amount of <strong className="text-[#0B0B0C]">₹{request.payableAmount}</strong>, take a screenshot of the successful transaction, and submit your UTR reference number.
          </p>

          {/* UPI ID Copy Card */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAFAFA] border border-[#E6E8EC]">
            <div>
              <span className="text-[10px] font-bold text-[#5B6168] uppercase block">UPI ID / VPA</span>
              <span className="text-xs font-mono font-bold text-[#0B0B0C]">{activeUpiId}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyUpi}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E6E8EC] hover:bg-[#F0F1F4] text-xs font-bold text-[#0B0B0C] transition-colors cursor-pointer"
            >
              {copiedUpi ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#0F7B3E]" />
                  <span className="text-[#0F7B3E]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#5B6168]" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Action Buttons (Festie Screenshot 3 Layout) */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isCancelling}
              className="px-4 py-2.5 rounded-xl border border-[#E6E8EC] hover:bg-[#FDECEE] hover:border-[#F9C3C6] text-xs font-bold text-[#E03A45] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel plan'}
            </button>

            <button
              type="button"
              onClick={() => setIsSubmitModalOpen(true)}
              className="flex-1 px-5 py-2.5 rounded-xl bg-[#0F7B3E] hover:bg-[#0D6D37] text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{hasProof ? 'Update Payment Proof' : "I've paid / Submit Proof"}</span>
            </button>
          </div>

          {hasProof && (
            <div className="p-3 rounded-xl bg-[#E4F7EC] border border-[#BDE8D0] text-[#0F7B3E] text-xs font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                UTR <strong className="font-mono">{request.utrNumber}</strong> submitted. Admin will verify with bank receipt.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Modal / Drawer for Submitting Proof */}
      {isSubmitModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div className="w-full max-w-lg rounded-[28px] bg-white p-6 sm:p-7 shadow-2xl border border-[#E6E8EC] space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0F1F4]">
              <div>
                <h3 className="text-lg font-black text-[#0B0B0C]">Submit Payment Proof</h3>
                <p className="text-xs text-[#5B6168]">
                  Amount: ₹{request.payableAmount} • {request.planNameSnapshot}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F0F1F4] hover:bg-[#E6E8EC] flex items-center justify-center text-[#5B6168] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitError && (
              <div className="p-3.5 rounded-xl bg-[#FDECEE] border border-[#F9C3C6] text-[#E03A45] text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {submitSuccess && (
              <div className="p-3.5 rounded-xl bg-[#E4F7EC] border border-[#BDE8D0] text-[#0F7B3E] text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{submitSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSubmitProof} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B0B0C] mb-1">
                  UTR / UPI Transaction Reference Number (12 digits) *
                </label>
                <input
                  type="text"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. 430192837465"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-mono font-bold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#0F7B3E] transition-colors"
                  required
                />
                <p className="text-[11px] text-[#7C879B] mt-1">
                  Found on your UPI receipt / confirmation screen (GPay, PhonePe, Paytm).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B0B0C] mb-1">
                  Payment Date & Time *
                </label>
                <input
                  type="datetime-local"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-semibold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#0F7B3E] transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B0B0C] mb-1">
                  Payment Screenshot Proof *
                </label>
                <div className="rounded-xl border-2 border-dashed border-[#E6E8EC] hover:border-[#0F7B3E] bg-[#FAFAFA] p-4 text-center transition-colors">
                  {filePreview ? (
                    <div className="space-y-2">
                      <img
                        src={filePreview}
                        alt="Screenshot Preview"
                        className="max-h-40 mx-auto rounded-lg border border-[#E6E8EC] object-contain"
                      />
                      <label className="inline-block text-xs font-bold text-[#0F7B3E] hover:underline cursor-pointer">
                        <span>Change Screenshot</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="cursor-pointer block py-2">
                      <Upload className="w-8 h-8 mx-auto text-[#7C879B] mb-2" />
                      <span className="text-xs font-bold text-[#0B0B0C] block">
                        Click to upload screenshot or drag and drop
                      </span>
                      <span className="text-[11px] text-[#7C879B] mt-0.5 block">
                        PNG, JPG, or WebP up to 5 MB
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileChange}
                        className="hidden"
                        required={!request.proofFilePath}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B0B0C] mb-1">
                  Optional Remarks / Note
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Paid via Google Pay from HDFC Bank account..."
                  rows={2}
                  className="w-full p-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-medium text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#0F7B3E] transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#E6E8EC] hover:bg-[#F0F1F4] text-xs font-bold text-[#5B6168] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[#0F7B3E] hover:bg-[#0D6D37] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Submit Verification</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
