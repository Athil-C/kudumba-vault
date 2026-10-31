import React, { useState, useEffect } from 'react';
import {
  QrCode,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Search,
  Settings,
  ExternalLink,
  ShieldAlert,
  ChevronDown,
  FileImage,
  Download,
  MoreVertical,
  Ban,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import {
  apiGetAdminPaymentRequests,
  apiApprovePaymentRequest,
  apiRejectPaymentRequest,
  apiGetAdminUpiSettings,
  apiUpdateAdminUpiSettings,
  apiGetAdminPaymentProofBlob,
  apiAdminCancelSubscription,
} from '../../services/adminApiClient';

interface PaymentProofModalProps {
  request: any;
  onClose: () => void;
}

export const PaymentProofModal: React.FC<PaymentProofModalProps> = ({ request, onClose }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reqId = request?._id || request?.id;

  const loadProof = async () => {
    if (!reqId) {
      setError('Invalid payment request ID.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const blob = await apiGetAdminPaymentProofBlob(reqId);
      const url = URL.createObjectURL(blob);
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load payment proof screenshot.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProof();
    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [reqId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOpenFullSize = () => {
    if (!blobUrl) return;
    const win = window.open(blobUrl, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    const filename = request.proofOriginalName || `payment-proof-${reqId}.png`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-[24px] overflow-hidden shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#F0F1F4]">
          <div>
            <h3 id="proof-modal-title" className="text-sm font-bold text-[#0B0B0C]">
              Payment Screenshot Proof
            </h3>
            <p className="text-xs text-[#5B6168]">
              UTR: <span className="font-mono font-bold">{request?.utrNumber || 'Not submitted'}</span> • ₹
              {request?.payableAmount}
              {request?.userEmail && <span className="ml-2 text-[#7C879B]">({request.userEmail})</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-[#F0F1F4] hover:bg-[#E6E8EC] transition-colors flex items-center justify-center text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="min-h-[260px] max-h-[65vh] overflow-auto rounded-xl bg-[#FAFAFA] border border-[#E6E8EC] p-3 flex items-center justify-center relative">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-[#5B6168] space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#E03A45]" />
              <p className="text-xs font-medium">Retrieving authenticated payment screenshot...</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center max-w-md space-y-3">
              <div className="w-10 h-10 rounded-full bg-[#FDECEE] text-[#E03A45] flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-xs text-[#E03A45] font-medium">{error}</p>
              <button
                type="button"
                onClick={loadProof}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B0B0C] hover:bg-[#202024] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {!loading && !error && blobUrl && (
            <img
              src={blobUrl}
              alt="Payment proof screenshot"
              className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-xs"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5B6168] pt-1">
          <span className="truncate max-w-[280px]" title={request?.proofOriginalName || 'proof.png'}>
            Original File: <span className="font-medium text-[#0B0B0C]">{request?.proofOriginalName || 'proof.png'}</span>
          </span>
          <div className="flex items-center gap-3">
            {blobUrl && (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1 font-bold text-[#5B6168] hover:text-[#0B0B0C] transition-colors cursor-pointer"
                  title="Download proof screenshot"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenFullSize}
                  className="inline-flex items-center gap-1 font-bold text-[#0B0B0C] hover:text-[#E03A45] transition-colors cursor-pointer"
                  title="Open proof screenshot in new tab"
                >
                  <span>Open Full Size</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PaymentsScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');

  // Proof Modal
  const [selectedProofRequest, setSelectedProofRequest] = useState<any | null>(null);

  // Approval Modal
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  // Rejection Modal
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Active Action Menu Dropdown (3-dots)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Cancellation Modal State
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelMode, setCancelMode] = useState<'END_OF_PERIOD' | 'IMMEDIATE'>('END_OF_PERIOD');
  const [cancelReason, setCancelReason] = useState('');
  const [confirmImmediate, setConfirmImmediate] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);

  // UPI Settings Card state
  const [isUpiSettingsOpen, setIsUpiSettingsOpen] = useState(false);
  const [upiSettings, setUpiSettings] = useState<any>(null);
  const [editUpiId, setEditUpiId] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [isSavingUpi, setIsSavingUpi] = useState(false);
  const [upiSaveMsg, setUpiSaveMsg] = useState<string | null>(null);

  // Fetch Requests
  const fetchRequests = async (status = activeTab) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiGetAdminPaymentRequests(status);
      if (res && res.requests) {
        setRequests(res.requests);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load payment requests.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch UPI Settings
  const fetchUpiSettings = async () => {
    try {
      const res = await apiGetAdminUpiSettings();
      if (res && res.config) {
        setUpiSettings(res.config);
        setEditUpiId(res.config.upiId || '');
        setEditMerchant(res.config.merchantName || '');
        setEditWhatsapp(res.config.whatsappNumber || '');
      }
    } catch (err) {
      console.warn('[PaymentsScreen] Failed to fetch UPI config:', err);
    }
  };

  useEffect(() => {
    fetchRequests(activeTab);
    fetchUpiSettings();
  }, [activeTab]);

  const handleSaveUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingUpi(true);
      setUpiSaveMsg(null);
      const res = await apiUpdateAdminUpiSettings({
        upiId: editUpiId,
        merchantName: editMerchant,
        whatsappNumber: editWhatsapp,
      });
      if (res && res.config) {
        setUpiSettings(res.config);
        setUpiSaveMsg('UPI details updated successfully!');
        setTimeout(() => setUpiSaveMsg(null), 3000);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to update UPI settings.');
    } finally {
      setIsSavingUpi(false);
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    try {
      setIsApproving(true);
      const reqId = approveTarget._id || approveTarget.id;
      await apiApprovePaymentRequest(reqId);
      setApproveTarget(null);
      fetchRequests(activeTab);
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget || !rejectionReason.trim()) return;
    try {
      setIsRejecting(true);
      const reqId = rejectTarget._id || rejectTarget.id;
      await apiRejectPaymentRequest(reqId, rejectionReason.trim());
      setRejectTarget(null);
      setRejectionReason('');
      fetchRequests(activeTab);
    } catch (err: any) {
      alert(`Rejection error: ${err.message}`);
    } finally {
      setIsRejecting(false);
    }
  };

  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;

    if (cancelMode === 'IMMEDIATE') {
      if (!cancelReason.trim() || cancelReason.trim().length < 5) {
        setCancelError('A detailed reason (at least 5 characters) is required for immediate cancellation.');
        return;
      }
      if (!confirmImmediate) {
        setCancelError('Please confirm the checkbox acknowledging immediate benefit revocation.');
        return;
      }
    }

    try {
      setIsCancelling(true);
      setCancelError(null);
      const reqId = cancelTarget._id || cancelTarget.id;
      const res = await apiAdminCancelSubscription(reqId, {
        mode: cancelMode,
        reason: cancelReason.trim(),
        isPaymentId: true,
      });

      setCancelSuccessMsg(res?.message || 'Subscription cancelled successfully.');
      setCancelTarget(null);
      setCancelReason('');
      setConfirmImmediate(false);
      setTimeout(() => setCancelSuccessMsg(null), 4000);
      await fetchRequests(activeTab);
    } catch (err: any) {
      setCancelError(err?.message || 'Failed to cancel subscription.');
    } finally {
      setIsCancelling(false);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const userName = r.userId?.fullName || r.billingAddressSnapshot?.fullName || '';
    const userEmail = r.userId?.email || '';
    const utr = r.utrNumber || '';
    const plan = r.planNameSnapshot || '';
    return (
      userName.toLowerCase().includes(term) ||
      userEmail.toLowerCase().includes(term) ||
      utr.toLowerCase().includes(term) ||
      plan.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B0B0C] flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#E03A45]" />
            <span>Manual UPI Payment Verification</span>
          </h1>
          <p className="text-xs text-[#5B6168] mt-1">
            Review user-submitted UPI screenshots and UTR numbers. Approve to activate subscriptions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsUpiSettingsOpen(!isUpiSettingsOpen)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E6E8EC] hover:bg-[#F9FAFB] text-xs font-bold text-[#0B0B0C] transition-colors shadow-2xs cursor-pointer w-fit"
        >
          <Settings className="w-4 h-4 text-[#5B6168]" />
          <span>Receiver UPI Settings</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${isUpiSettingsOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Cancellation Success Feedback */}
      {cancelSuccessMsg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-2xs flex items-center justify-between text-xs font-bold text-emerald-900 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{cancelSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setCancelSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Collapsible UPI Settings Card */}
      {isUpiSettingsOpen && (
        <div className="rounded-2xl bg-white border border-[#E6E8EC] p-5 shadow-xs animate-in fade-in duration-150 space-y-4">
          <div className="flex items-center justify-between border-b border-[#F0F1F4] pb-3">
            <span className="text-xs font-bold text-[#0B0B0C]">Configured Merchant UPI Receiver</span>
            {upiSaveMsg && (
              <span className="text-xs font-bold text-[#0F7B3E] bg-[#E4F7EC] px-2.5 py-0.5 rounded-md">
                {upiSaveMsg}
              </span>
            )}
          </div>

          <form onSubmit={handleSaveUpi} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5B6168] mb-1">UPI ID / VPA</label>
              <input
                type="text"
                value={editUpiId}
                onChange={(e) => setEditUpiId(e.target.value)}
                placeholder="e.g. kudumbavault@oksbi"
                className="w-full h-10 px-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-mono font-bold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5B6168] mb-1">Merchant Display Name</label>
              <input
                type="text"
                value={editMerchant}
                onChange={(e) => setEditMerchant(e.target.value)}
                placeholder="e.g. Kudumba Vault"
                className="w-full h-10 px-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-bold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5B6168] mb-1">WhatsApp Support Number</label>
              <input
                type="text"
                value={editWhatsapp}
                onChange={(e) => setEditWhatsapp(e.target.value)}
                placeholder="e.g. +91 90612 64525"
                className="w-full h-10 px-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-bold text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45]"
                required
              />
            </div>
            <div className="sm:col-span-3 flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSavingUpi}
                className="px-4 py-2 rounded-xl bg-[#E03A45] hover:bg-[#C42F3A] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {isSavingUpi ? 'Saving...' : 'Save UPI Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tabs: Pending, Approved, Rejected */}
        <div className="flex items-center gap-2 bg-[#F0F1F4] p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('PENDING')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'PENDING'
                ? 'bg-white text-[#E03A45] shadow-xs'
                : 'text-[#5B6168] hover:text-[#0B0B0C]'
            }`}
          >
            Pending Verification
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('APPROVED')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'APPROVED'
                ? 'bg-white text-[#0F7B3E] shadow-xs'
                : 'text-[#5B6168] hover:text-[#0B0B0C]'
            }`}
          >
            Approved
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('REJECTED')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'REJECTED'
                ? 'bg-white text-[#5B6168] shadow-xs'
                : 'text-[#5B6168] hover:text-[#0B0B0C]'
            }`}
          >
            Rejected
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#7C879B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search user, email, UTR..."
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-[#E6E8EC] bg-white text-xs text-[#0B0B0C] focus:outline-none focus:border-[#E03A45]"
          />
        </div>
      </div>

      {/* Main Table / List Card */}
      <div className="rounded-2xl border border-[#E6E8EC] bg-white overflow-hidden shadow-2xs">
        {loading ? (
          <div className="py-16 text-center text-[#5B6168] text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#E03A45]" />
            <span>Loading payment records...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-[#E03A45] text-xs font-semibold">{error}</div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-16 text-center text-[#7C879B] text-xs">
            No {activeTab.toLowerCase()} payment requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F9FA] text-[#5B6168] font-bold border-b border-[#E6E8EC]">
                <tr>
                  <th className="py-3 px-4">User & Household</th>
                  <th className="py-3 px-4">Plan & Cycle</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">UTR Reference</th>
                  <th className="py-3 px-4">Submission Date</th>
                  <th className="py-3 px-4">Proof Screenshot</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F1F4]">
                {filteredRequests.map((req) => {
                  const reqId = req._id || req.id;
                  const userName = req.userId?.fullName || req.billingAddressSnapshot?.fullName || 'User';
                  const userEmail = req.userId?.email || 'N/A';
                  const familyName = req.userId?.familyName || 'Family';

                  return (
                    <tr key={reqId} className="hover:bg-[#FAFAFA] transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-[#0B0B0C] block">{userName}</span>
                        <span className="text-[11px] text-[#5B6168] block">{userEmail}</span>
                        <span className="text-[10px] text-[#7C879B] font-medium block">{familyName}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-[#0B0B0C] block">{req.planNameSnapshot}</span>
                        <span className="text-[11px] text-[#5B6168] block capitalize">
                          {req.billingDuration} ({req.durationMonths || 1} mo)
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-black text-[#0B0B0C] text-sm">
                          ₹{req.payableAmount?.toLocaleString('en-IN')}
                        </span>
                        {req.planSavings > 0 && (
                          <span className="text-[10px] text-[#0F7B3E] font-medium block">
                            Saved ₹{req.planSavings}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-[#0B0B0C]">
                        {req.utrNumber ? (
                          <span className="bg-[#F0F1F4] px-2 py-0.5 rounded text-[11px]">
                            {req.utrNumber}
                          </span>
                        ) : (
                          <span className="text-[#7C879B] italic font-sans font-normal text-[11px]">
                            Not yet submitted
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-[#5B6168]">
                        <span className="block font-medium">
                          {new Date(req.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="text-[10px] text-[#7C879B]">
                          {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {req.proofFilePath ? (
                          <button
                            type="button"
                            onClick={() => setSelectedProofRequest(req)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F0F1F4] hover:bg-[#E6E8EC] text-[11px] font-bold text-[#0B0B0C] transition-colors cursor-pointer"
                          >
                            <FileImage className="w-3.5 h-3.5 text-[#0F7B3E]" />
                            <span>View Proof</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#7C879B] italic">No proof attached</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {req.status === 'PENDING' ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setApproveTarget(req)}
                              disabled={!req.utrNumber}
                              title={!req.utrNumber ? 'Cannot approve before UTR is submitted' : 'Approve Payment'}
                              className="px-3 py-1.5 rounded-lg bg-[#0F7B3E] hover:bg-[#0D6D37] disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTarget(req);
                                setRejectionReason('');
                              }}
                              className="px-3 py-1.5 rounded-lg border border-[#E6E8EC] hover:bg-[#FDECEE] hover:border-[#F9C3C6] text-[#E03A45] text-xs font-bold transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                          </div>
                        ) : req.status === 'APPROVED' ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0F7B3E] bg-[#E4F7EC] px-2.5 py-1 rounded-full">
                              <Check className="w-3 h-3" />
                              <span>Approved</span>
                            </span>

                            {/* Subscription Status Badges if Cancelled or Scheduled */}
                            {req.subscription?.status === 'canceled' ? (
                              <span
                                className="inline-flex items-center text-[10px] font-bold text-[#8A949E] bg-[#F0F1F4] px-2 py-0.5 rounded-full"
                                title="Subscription has been cancelled"
                              >
                                Cancelled
                              </span>
                            ) : req.subscription?.cancelAtPeriodEnd ? (
                              <span
                                className="inline-flex items-center text-[10px] font-bold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded-full"
                                title={`Scheduled to end on ${
                                  req.subscription?.currentPeriodEnd
                                    ? new Date(req.subscription.currentPeriodEnd).toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                      })
                                    : 'period end'
                                }`}
                              >
                                Ends{' '}
                                {req.subscription?.currentPeriodEnd
                                  ? new Date(req.subscription.currentPeriodEnd).toLocaleDateString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                    })
                                  : 'soon'}
                              </span>
                            ) : null}

                            {/* Three-dot action menu for active or scheduled subscriptions */}
                            {req.subscription?.status !== 'canceled' && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === reqId ? null : reqId);
                                  }}
                                  className="w-7 h-7 rounded-lg hover:bg-[#F0F1F4] text-[#5B6168] hover:text-[#0B0B0C] flex items-center justify-center transition-colors cursor-pointer"
                                  title="Subscription actions"
                                  aria-label="Subscription actions"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>

                                {activeMenuId === reqId && (
                                  <div
                                    className="absolute right-0 top-8 z-30 w-48 rounded-xl bg-white border border-[#E6E8EC] p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-100 text-left"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        setCancelTarget(req);
                                        setCancelMode('END_OF_PERIOD');
                                        setCancelReason('');
                                        setConfirmImmediate(false);
                                        setCancelError(null);
                                      }}
                                      className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs font-semibold text-[#E03A45] hover:bg-[#FDECEE] rounded-lg transition-colors cursor-pointer text-left"
                                    >
                                      <Ban className="w-3.5 h-3.5 text-[#E03A45]" />
                                      <span>Cancel Subscription</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-right">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E03A45] bg-[#FDECEE] px-2.5 py-1 rounded-full">
                              <X className="w-3 h-3" />
                              <span>Rejected</span>
                            </span>
                            {req.rejectionReason && (
                              <p className="text-[10px] text-[#7C879B] mt-0.5 max-w-xs truncate">
                                {req.rejectionReason}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Authenticated Proof Screenshot High-Res Modal */}
      {selectedProofRequest && (
        <PaymentProofModal
          request={selectedProofRequest}
          onClose={() => setSelectedProofRequest(null)}
        />
      )}

      {/* Approve Confirmation Modal */}
      {approveTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md bg-white rounded-[24px] p-6 shadow-2xl border border-[#E6E8EC] space-y-4">
            <div className="w-10 h-10 rounded-full bg-[#E4F7EC] text-[#0F7B3E] flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#0B0B0C]">Confirm Payment Approval</h3>
              <p className="text-xs text-[#5B6168] mt-1 leading-relaxed">
                Have you verified that the amount of{' '}
                <strong className="text-[#0B0B0C]">₹{approveTarget.payableAmount}</strong> with UTR{' '}
                <strong className="font-mono text-[#0B0B0C]">{approveTarget.utrNumber}</strong> has credited into
                the receiving bank / UPI account?
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAFAFA] border border-[#E6E8EC] text-xs space-y-1">
              <div className="flex justify-between text-[#5B6168]">
                <span>Plan:</span>
                <span className="font-bold text-[#0B0B0C]">{approveTarget.planNameSnapshot}</span>
              </div>
              <div className="flex justify-between text-[#5B6168]">
                <span>Cycle:</span>
                <span className="font-bold text-[#0B0B0C] capitalize">{approveTarget.billingDuration}</span>
              </div>
              <div className="flex justify-between text-[#5B6168]">
                <span>Duration:</span>
                <span className="font-bold text-[#0B0B0C]">{approveTarget.durationMonths || 1} months</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                className="px-4 py-2 rounded-xl border border-[#E6E8EC] hover:bg-[#F0F1F4] text-xs font-bold text-[#5B6168] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving}
                className="px-5 py-2 rounded-xl bg-[#0F7B3E] hover:bg-[#0D6D37] text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                {isApproving ? 'Activating...' : 'Yes, Approve & Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog Modal */}
      {rejectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md bg-white rounded-[24px] p-6 shadow-2xl border border-[#E6E8EC] space-y-4">
            <div className="w-10 h-10 rounded-full bg-[#FDECEE] text-[#E03A45] flex items-center justify-center">
              <XCircle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#0B0B0C]">Reject Payment Request</h3>
              <p className="text-xs text-[#5B6168] mt-1">
                Please provide a clear reason. This explanation will be displayed to the user so they can correct it.
              </p>
            </div>

            <form onSubmit={handleReject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B0B0C] mb-1">Rejection Reason *</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. UTR number not found in bank statement, or amount credited was incorrect..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-medium text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45]"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 rounded-xl border border-[#E6E8EC] hover:bg-[#F0F1F4] text-xs font-bold text-[#5B6168] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRejecting || rejectionReason.trim().length < 5}
                  className="px-5 py-2 rounded-xl bg-[#E03A45] hover:bg-[#C42F3A] disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Cancel Subscription Confirmation Modal */}
      {cancelTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div className="w-full max-w-xl bg-white rounded-[24px] p-6 shadow-2xl border border-[#E6E8EC] space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0F1F4]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FDECEE] text-[#E03A45] flex items-center justify-center shrink-0">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0B0B0C]">Cancel Customer Subscription</h3>
                  <p className="text-xs text-[#5B6168]">
                    Review customer details and choose how to terminate active subscription coverage.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="w-8 h-8 rounded-full bg-[#F0F1F4] flex items-center justify-center text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Customer & Subscription Overview Card */}
            <div className="rounded-xl bg-[#FAFAFA] border border-[#E6E8EC] p-4 space-y-3">
              <span className="text-[11px] font-bold text-[#8A949E] uppercase tracking-wider block">
                Subscription & Household Details
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#7C879B] block text-[11px]">Customer Name:</span>
                  <span className="font-bold text-[#0B0B0C] block">
                    {cancelTarget.userId?.fullName || cancelTarget.billingAddressSnapshot?.fullName || 'User'}
                  </span>
                </div>
                <div>
                  <span className="text-[#7C879B] block text-[11px]">Customer Email:</span>
                  <span className="font-semibold text-[#0B0B0C] block truncate">
                    {cancelTarget.userId?.email || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[#7C879B] block text-[11px]">Household Name:</span>
                  <span className="font-bold text-[#0B0B0C] block">
                    {cancelTarget.userId?.familyName || 'Family Household'}
                  </span>
                </div>
                <div>
                  <span className="text-[#7C879B] block text-[11px]">Payment Amount:</span>
                  <span className="font-mono font-bold text-[#0B0B0C] block">
                    ₹{cancelTarget.payableAmount?.toLocaleString('en-IN')} (UTR: {cancelTarget.utrNumber || 'N/A'})
                  </span>
                </div>
                <div>
                  <span className="text-[#7C879B] block text-[11px]">Current Plan:</span>
                  <span className="font-bold text-[#0B0B0C] block">
                    {cancelTarget.subscription?.planName || cancelTarget.planNameSnapshot}
                  </span>
                </div>
                <div>
                  <span className="text-[#7C879B] block text-[11px]">Billing Cycle:</span>
                  <span className="font-semibold text-[#0B0B0C] block capitalize">
                    {cancelTarget.subscription?.cadence || cancelTarget.billingDuration} ({cancelTarget.durationMonths || 1} mo)
                  </span>
                </div>
                <div>
                  <span className="text-[#7C879B] block text-[11px]">Subscription Start Date:</span>
                  <span className="font-medium text-[#0B0B0C] block">
                    {cancelTarget.subscription?.currentPeriodStart
                      ? new Date(cancelTarget.subscription.currentPeriodStart).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : cancelTarget.verifiedAt
                      ? new Date(cancelTarget.verifiedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : new Date(cancelTarget.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                  </span>
                </div>
                <div>
                  <span className="text-[#7C879B] block text-[11px]">Subscription Expiry Date:</span>
                  <span className="font-bold text-[#0B0B0C] block">
                    {cancelTarget.subscription?.currentPeriodEnd
                      ? new Date(cancelTarget.subscription.currentPeriodEnd).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'N/A'}
                  </span>
                </div>
                <div className="sm:col-span-2 flex items-center justify-between border-t border-[#E6E8EC] pt-2">
                  <span className="text-[#7C879B] text-[11px]">Current Subscription Status:</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      cancelTarget.subscription?.status === 'canceled'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : cancelTarget.subscription?.cancelAtPeriodEnd
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {cancelTarget.subscription?.status === 'canceled'
                      ? 'CANCELLED'
                      : cancelTarget.subscription?.cancelAtPeriodEnd
                      ? 'ACTIVE (SCHEDULED TO END)'
                      : (cancelTarget.subscription?.status?.toUpperCase() || 'ACTIVE')}
                  </span>
                </div>
              </div>
            </div>

            {/* Error Message Alert */}
            {cancelError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-semibold">{cancelError}</span>
              </div>
            )}

            {/* Cancellation Form */}
            <form onSubmit={handleConfirmCancel} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B0B0C] mb-2">
                  Select Cancellation Mode *
                </label>

                <div className="space-y-2.5">
                  {/* Option A: Cancel at Period End (DEFAULT) */}
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      cancelMode === 'END_OF_PERIOD'
                        ? 'bg-[#FFF9F9] border-[#E03A45] shadow-2xs'
                        : 'bg-white border-[#E6E8EC] hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancelMode"
                      value="END_OF_PERIOD"
                      checked={cancelMode === 'END_OF_PERIOD'}
                      onChange={() => setCancelMode('END_OF_PERIOD')}
                      className="mt-1 text-[#E03A45] focus:ring-[#E03A45]"
                    />
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#0B0B0C]">Option A: Cancel at Period End</span>
                        <span className="px-2 py-0.5 rounded-md bg-[#E4F7EC] text-[#0F7B3E] text-[10px] font-bold">
                          DEFAULT / RECOMMENDED
                        </span>
                      </div>
                      <p className="text-[#5B6168] leading-relaxed">
                        Subscription remains active until its existing paid expiry date (
                        <strong className="text-[#0B0B0C]">
                          {cancelTarget.subscription?.currentPeriodEnd
                            ? new Date(cancelTarget.subscription.currentPeriodEnd).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'end of billing cycle'}
                        </strong>
                        ). The customer retains all plan benefits until expiry, and auto-renewal is prevented.
                      </p>
                    </div>
                  </label>

                  {/* Option B: Cancel Immediately */}
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      cancelMode === 'IMMEDIATE'
                        ? 'bg-[#FFF5F5] border-[#E03A45] shadow-2xs'
                        : 'bg-white border-[#E6E8EC] hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancelMode"
                      value="IMMEDIATE"
                      checked={cancelMode === 'IMMEDIATE'}
                      onChange={() => setCancelMode('IMMEDIATE')}
                      className="mt-1 text-[#E03A45] focus:ring-[#E03A45]"
                    />
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#0B0B0C]">Option B: Cancel Immediately</span>
                        <span className="px-2 py-0.5 rounded-md bg-[#FDECEE] text-[#E03A45] text-[10px] font-bold">
                          IMMEDIATE REVOCATION
                        </span>
                      </div>
                      <p className="text-[#5B6168] leading-relaxed">
                        Immediately revokes paid entitlements and switches the account to free tier. Existing documents, uploaded files, and family member records are preserved permanently and never deleted.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Cancellation Reason */}
              <div>
                <label className="block text-xs font-bold text-[#0B0B0C] mb-1">
                  Cancellation Reason {cancelMode === 'IMMEDIATE' ? '*' : '(Optional)'}
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={
                    cancelMode === 'IMMEDIATE'
                      ? 'Required: Explain why this subscription is being revoked immediately (at least 5 characters)...'
                      : 'Optional: Enter reason or notes for the customer and audit log...'
                  }
                  rows={2}
                  className="w-full p-3 rounded-xl border border-[#E6E8EC] bg-[#FAFAFA] text-xs font-medium text-[#0B0B0C] focus:bg-white focus:outline-none focus:border-[#E03A45]"
                  required={cancelMode === 'IMMEDIATE'}
                />
              </div>

              {/* Explicit Confirmation Checkbox for Immediate Revocation */}
              {cancelMode === 'IMMEDIATE' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmImmediate}
                      onChange={(e) => setConfirmImmediate(e.target.checked)}
                      className="mt-0.5 rounded text-[#E03A45] focus:ring-[#E03A45]"
                    />
                    <span className="text-xs font-bold text-amber-900 leading-snug">
                      I understand that paid benefits will be revoked immediately upon cancellation. (Existing documents and members remain safe).
                    </span>
                  </label>
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#F0F1F4]">
                <button
                  type="button"
                  onClick={() => setCancelTarget(null)}
                  disabled={isCancelling}
                  className="px-4 py-2 rounded-xl border border-[#E6E8EC] hover:bg-[#F0F1F4] text-xs font-bold text-[#5B6168] cursor-pointer"
                >
                  Keep Subscription
                </button>
                <button
                  type="submit"
                  disabled={
                    isCancelling ||
                    (cancelMode === 'IMMEDIATE' && (!confirmImmediate || cancelReason.trim().length < 5))
                  }
                  className="px-5 py-2 rounded-xl bg-[#E03A45] hover:bg-[#C42F3A] disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-2"
                >
                  {isCancelling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Cancelling...</span>
                    </>
                  ) : (
                    <span>Confirm Cancellation</span>
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
