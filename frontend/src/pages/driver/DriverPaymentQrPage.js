import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Modal from '../../components/common/Modal';
import { Textarea } from '../../components/forms';
import { Skeleton } from '../../components/common/Loader';
import {
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  ClockIcon,
  WarningIcon,
} from '../../components/common/Icons';
import {
  getTripDetailsApi,
  getTripPaymentsApi,
  getPaymentQrSettingApi,
  confirmPaymentApi,
  rejectPaymentProofApi,
  downloadReceiptPdfApi,
} from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import CountUp from '../../components/common/CountUp';
import './DriverPages.css';

export default function DriverPaymentQrPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [trip, setTrip] = useState(null);
  const [payments, setPayments] = useState([]);
  const [qrSetting, setQrSetting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Confirm Received Modal State
  const [confirmTargetPayment, setConfirmTargetPayment] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const fareNumber = parseFloat(trip?.total_fare) || 0;

  // Reject Proof Modal State
  const [rejectTargetPayment, setRejectTargetPayment] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState('');

  // Receipt Download Loading Map
  const [downloadingReceiptId, setDownloadingReceiptId] = useState(null);

  const isMountedRef = useRef(true);

  // Load Initial Data
  const loadData = useCallback(async () => {
    try {
      const [tripRes, paymentsRes, qrRes] = await Promise.all([
        getTripDetailsApi(id),
        getTripPaymentsApi(id),
        getPaymentQrSettingApi().catch(() => null),
      ]);

      if (isMountedRef.current) {
        setTrip(tripRes);
        const pList = Array.isArray(paymentsRes)
          ? paymentsRes
          : paymentsRes.results || [];
        setPayments(pList);
        setQrSetting(qrRes);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(getApiErrorMessage(err));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    isMountedRef.current = true;
    setLoading(true);
    loadData();

    // Auto-poll payments every 10 seconds
    const intervalTimer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const paymentsRes = await getTripPaymentsApi(id);
        const pList = Array.isArray(paymentsRes)
          ? paymentsRes
          : paymentsRes.results || [];
        if (isMountedRef.current) {
          setPayments(pList);
        }
      } catch (err) {
        // Silently continue polling
      }
    }, 10000);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalTimer);
    };
  }, [id, loadData]);

  // Handle Download QR
  const handleDownloadQr = async () => {
    if (!qrSetting?.qr_image_url) return;
    try {
      const res = await fetch(qrSetting.qr_image_url);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fleetflow_payment_qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      success('QR Code downloaded successfully');
    } catch (e) {
      // Fallback
      window.open(qrSetting.qr_image_url, '_blank');
    }
  };

  // Confirm Payment Received
  const handleConfirmPayment = async () => {
    if (!confirmTargetPayment || confirming) return;
    setConfirming(true);
    try {
      await confirmPaymentApi(confirmTargetPayment.id);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2500);
      success('Payment confirmed successfully!');
      setConfirmTargetPayment(null);
      // Refresh payments immediately
      const refreshed = await getTripPaymentsApi(id);
      const pList = Array.isArray(refreshed) ? refreshed : refreshed.results || [];
      setPayments(pList);
    } catch (err) {
      toastError(getApiErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  // Reject Payment Proof
  const handleRejectProof = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setRejectError('Please enter a reason for rejecting the payment proof.');
      return;
    }
    if (rejecting || !rejectTargetPayment) return;

    setRejecting(true);
    setRejectError('');
    try {
      await rejectPaymentProofApi(rejectTargetPayment.id, rejectReason.trim());
      success('Payment proof rejected. Status reverted to UNPAID.');
      setRejectTargetPayment(null);
      setRejectReason('');
      // Refresh payments immediately
      const refreshed = await getTripPaymentsApi(id);
      const pList = Array.isArray(refreshed) ? refreshed : refreshed.results || [];
      setPayments(pList);
    } catch (err) {
      setRejectError(getApiErrorMessage(err));
    } finally {
      setRejecting(false);
    }
  };

  // Download Receipt PDF
  const handleDownloadReceipt = async (payment) => {
    setDownloadingReceiptId(payment.id);
    try {
      const blob = await downloadReceiptPdfApi(payment.id);
      const fileUrl = window.URL.createObjectURL(
        new Blob([blob], { type: 'application/pdf' })
      );
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = `receipt_${payment.receipt_number || payment.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(fileUrl);
      success('Receipt downloaded successfully!');
    } catch (err) {
      toastError(getApiErrorMessage(err));
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  return (
    <div className="driver-page fade-in">
      {/* Top Header */}
      <div className="driver-page-header">
        <IconButton
          icon={<ArrowLeftIcon size={20} />}
          tooltip="Back to Trip Details"
          ariaLabel="Back to Trip Details"
          variant="secondary"
          size="medium"
          onClick={() => navigate(`/driver/trips/${id}`)}
        />
        <h1 className="driver-page-title">Trip Payment</h1>
        <div style={{ width: 40 }} />
      </div>

      {loading ? (
        <div className="driver-skeletons-wrapper">
          <Skeleton height="140px" borderRadius="12px" />
          <Skeleton height="260px" borderRadius="12px" />
          <Skeleton height="160px" borderRadius="12px" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <>
          {/* Header Banner: Trip Completed with Total Fare */}
          <div className="driver-completed-header-card">
            <div className="driver-completed-icon-circle">
              <CheckIcon size={28} />
            </div>
            <h2 className="driver-completed-title">Trip Completed</h2>
            <div className="driver-completed-fare-box">
              <span className="driver-fare-label">Total Fare</span>
              <span className="driver-completed-fare">
                {fareNumber > 0 ? (
                  <CountUp value={fareNumber} format="rupees" duration={800} />
                ) : (
                  'Fare Pending'
                )}
              </span>
            </div>
          </div>

          {/* 16-element CSS Confetti Burst on Payment Confirmation */}
          {showConfetti && (
            <div className="driver-confetti-overlay" aria-hidden="true">
              <div className="driver-confetti-center-check">
                <CheckIcon size={36} />
              </div>
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className="driver-confetti-particle"
                  style={{
                    '--rot': `${(i * 360) / 16}deg`,
                    '--dist': `${70 + (i % 4) * 20}px`,
                    '--clr': ['var(--chart-3)', 'var(--chart-1)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-5)'][i % 5],
                  }}
                />
              ))}
            </div>
          )}

          <div className="driver-payment-qr-desktop-split">
            {/* Left: Active Payment QR Card */}
            <Card className="driver-qr-card">
              {qrSetting?.qr_image_url ? (
                <div className="driver-qr-content">
                  <div className="driver-qr-image-wrapper">
                    <img
                      src={qrSetting.qr_image_url}
                      alt={qrSetting.title || 'Payment QR Code'}
                      className="driver-qr-image"
                    />
                    <div className="driver-qr-scan-line" />
                  </div>
                  {qrSetting.upi_id && (
                    <div className="driver-upi-id-tag">UPI: {qrSetting.upi_id}</div>
                  )}
                  <p className="driver-qr-instruction">
                    Show this QR to the customer for payment
                  </p>
                  <Button
                    variant="outline"
                    size="medium"
                    onClick={handleDownloadQr}
                  >
                    <DownloadIcon size={16} />
                    Download QR
                  </Button>
                </div>
              ) : (
                <div className="driver-no-qr-box">
                  <WarningIcon size={24} />
                  <p>Payment QR is not set. Please ask the Admin to upload it.</p>
                </div>
              )}
            </Card>

            {/* Right: Payments Section */}
            <div className="driver-payments-container">
              <h3 className="driver-section-subtitle">
                Customer Payment Status ({payments.length})
              </h3>

              {payments.length === 0 ? (
                <Card className="driver-empty-payments-card">
                  <p>Generating payment records for this trip...</p>
                </Card>
              ) : (
                payments.map((p) => {
                  const isPaid = p.status === 'PAID';
                  const isInitiated = p.status === 'PAYMENT_INITIATED';
                  const isUnpaid = p.status === 'UNPAID' || p.status === 'FAILED';

                  return (
                    <Card key={p.id} className="driver-payment-item-card">
                      <div className="driver-card-top-row">
                        <div className="driver-customer-name">
                          {p.customer_name || p.customer_email || 'Customer'}
                        </div>
                        <Badge status={p.status} />
                      </div>

                      <div className="driver-payment-amount-row">
                        <span className="amount-label">Amount:</span>
                        <span className="amount-value">₹{p.amount}</span>
                      </div>

                      {/* UNPAID State */}
                      {isUnpaid && (
                        <div className="driver-payment-status-unpaid">
                          <ClockIcon size={16} />
                          <span>Waiting for the customer to pay</span>
                        </div>
                      )}

                      {/* PAYMENT_INITIATED State */}
                      {isInitiated && (
                        <div className="driver-payment-initiated-section">
                          <div className="driver-txn-info-box">
                            <span className="txn-label">Transaction Ref:</span>
                            <span className="txn-ref">
                              {p.transaction_reference || 'N/A'}
                            </span>
                          </div>

                          {p.proof_screenshot && (
                            <div className="driver-proof-screenshot-box">
                              <span className="screenshot-label">Proof Screenshot:</span>
                              <a
                                href={p.proof_screenshot}
                                target="_blank"
                                rel="noreferrer"
                                className="driver-screenshot-link"
                              >
                                <img
                                  src={p.proof_screenshot}
                                  alt="Payment Proof"
                                  className="driver-screenshot-thumb"
                                />
                                <span>View Full Image</span>
                              </a>
                            </div>
                          )}

                          <div className="driver-initiated-actions">
                            <Button
                              variant="success"
                              size="medium"
                              onClick={() => setConfirmTargetPayment(p)}
                              disabled={confirming || rejecting}
                            >
                              <CheckIcon size={16} />
                              Confirm Payment Received
                            </Button>

                            <Button
                              variant="danger"
                              size="medium"
                              onClick={() => {
                                setRejectTargetPayment(p);
                                setRejectReason('');
                                setRejectError('');
                              }}
                              disabled={confirming || rejecting}
                            >
                              Not Received
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* PAID State */}
                      {isPaid && (
                        <div className="driver-payment-paid-card driver-receipt-slide-up">
                          <div className="driver-paid-status-row">
                            <CheckIcon size={18} />
                            <span>Payment Successful</span>
                          </div>
                          {p.receipt_number && (
                            <div className="driver-receipt-number">
                              Receipt: #{p.receipt_number}
                            </div>
                          )}
                          <Button
                            variant="outline"
                            size="medium"
                            fullWidth
                            loading={downloadingReceiptId === p.id}
                            disabled={downloadingReceiptId === p.id}
                            onClick={() => handleDownloadReceipt(p)}
                          >
                            <DownloadIcon size={16} />
                            Download Receipt
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </div>

          {/* Confirm Payment Received Dialog */}
          <ConfirmDialog
            isOpen={!!confirmTargetPayment}
            title="Confirm Payment Received"
            message={`Are you sure you have received ₹${confirmTargetPayment?.amount} from ${confirmTargetPayment?.customer_name || 'Customer'}? This will mark the payment as PAID and generate an official receipt.`}
            confirmText="Yes, Confirm Payment"
            cancelText="Cancel"
            variant="success"
            loading={confirming}
            onConfirm={handleConfirmPayment}
            onCancel={() => setConfirmTargetPayment(null)}
          />


          {/* Reject Proof Modal */}
          {rejectTargetPayment && (
            <Modal
              isOpen={true}
              onClose={() => setRejectTargetPayment(null)}
              title="Payment Not Received"
            >
              <form onSubmit={handleRejectProof}>
                <p className="driver-reject-modal-intro">
                  Please provide a reason why this payment of ₹{rejectTargetPayment.amount} was not received. This will be sent directly to the customer.
                </p>

                <Textarea
                  id="reject-reason-input"
                  label="Reason for Rejection"
                  required
                  rows={3}
                  placeholder="e.g. Transaction reference not found in bank statement, wrong amount received..."
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (rejectError) setRejectError('');
                  }}
                  error={rejectError}
                  disabled={rejecting}
                />

                <div className="driver-modal-actions">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRejectTargetPayment(null)}
                    disabled={rejecting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="danger"
                    loading={rejecting}
                    disabled={rejecting || !rejectReason.trim()}
                  >
                    Confirm Rejection
                  </Button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
