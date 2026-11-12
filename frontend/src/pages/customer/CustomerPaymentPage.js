import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPaymentPayInfoApi,
  getPaymentDetailsApi,
  submitPaymentProofApi,
} from '../../api/customer';
import { PaymentRulesCard } from '../../components/customer/CustomerRulesCards';
import StatusBadge from '../../components/common/StatusBadge';
import { SkeletonCard } from '../../components/common/Skeleton';
import ErrorState from '../../components/common/ErrorState';
import Toast from '../../components/common/Toast';
import Button from '../../components/common/Button';
import { formatCurrency, formatPayableAmount } from '../../utils/formatters';
import { TextInput, FileInput } from '../../components/forms';
import './CustomerPages.css';

export default function CustomerPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [payInfo, setPayInfo] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form states
  const [transactionRef, setTransactionRef] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);

  // Polling ref
  const pollTimerRef = useRef(null);

  const loadPayData = useCallback(async (isInitial = true) => {
    try {
      if (isInitial) setLoading(true);
      setError(null);
      const [info, details] = await Promise.all([
        getPaymentPayInfoApi(id),
        getPaymentDetailsApi(id),
      ]);
      setPayInfo(info);
      setPaymentDetails(details);

      if (details.status === 'PAID') {
        navigate(`/customer/payments/${id}/receipt`);
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setError('You are not authorized to view this payment.');
      } else if (err.response?.status === 404) {
        setError('Payment record not found.');
      } else {
        setError('Unable to load payment details. Please try again.');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadPayData(true);
  }, [loadPayData]);

  // Polling when status is PAYMENT_INITIATED
  useEffect(() => {
    const isInitiated =
      paymentDetails?.status === 'PAYMENT_INITIATED' ||
      payInfo?.status === 'PAYMENT_INITIATED';

    if (isInitiated) {
      pollTimerRef.current = setInterval(async () => {
        if (document.hidden) return;
        try {
          const updated = await getPaymentDetailsApi(id);
          setPaymentDetails(updated);
          if (updated.status === 'PAID') {
            clearInterval(pollTimerRef.current);
            setToast({ type: 'success', message: 'Payment confirmed! Redirecting to receipt...' });
            setTimeout(() => {
              navigate(`/customer/payments/${id}/receipt`);
            }, 1000);
          }
        } catch (err) {
          console.error('Polling error', err);
        }
      }, 10000);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [paymentDetails?.status, payInfo?.status, id, navigate]);

  const handleCopyAmount = () => {
    if (!payInfo?.amount) return;
    navigator.clipboard.writeText(String(payInfo.amount));
    setToast({ type: 'success', message: `Copied Rs. ${payInfo.amount} to clipboard!` });
  };

  const handleDownloadQr = () => {
    if (!payInfo?.qr_image_url) return;
    const a = document.createElement('a');
    a.href = payInfo.qr_image_url;
    a.download = `FleetFlow-Payment-QR-${id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSubmitProof = async (e) => {
    e.preventDefault();
    setFieldErrors({});

    const ref = transactionRef.trim();
    if (!ref) {
      setFieldErrors({ transaction_reference: 'Transaction reference is required.' });
      return;
    }

    if (ref.length < 6 || ref.length > 30 || !/^[A-Za-z0-9]+$/.test(ref)) {
      setFieldErrors({
        transaction_reference:
          'Transaction reference (UTR) must be 6 to 30 alphanumeric characters.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('transaction_reference', ref);
      if (screenshotFile) {
        formData.append('proof_screenshot', screenshotFile);
      }

      const res = await submitPaymentProofApi(id, formData);
      setPaymentDetails(res);
      setToast({
        type: 'success',
        message: 'Payment proof submitted! Waiting for verification.',
      });
    } catch (err) {
      console.error('Proof submission error', err);
      const data = err.response?.data;
      if (typeof data === 'object') {
        const errObj = {};
        if (data.transaction_reference) {
          errObj.transaction_reference = Array.isArray(data.transaction_reference)
            ? data.transaction_reference[0]
            : data.transaction_reference;
        }
        if (data.detail) {
          errObj.transaction_reference = data.detail;
        }
        setFieldErrors(errObj);
      } else {
        setFieldErrors({
          transaction_reference: 'Failed to submit payment proof. Please check your reference.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="customer-page">
        <SkeletonCard />
        <div style={{ marginTop: '1.5rem' }}>
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-page">
        <ErrorState message={error} onRetry={() => loadPayData(true)} />
      </div>
    );
  }

  if (!payInfo) return null;

  const currentStatus = paymentDetails?.status || payInfo.status;
  const isAwaitingVerification = currentStatus === 'PAYMENT_INITIATED';
  const isRejected = currentStatus === 'UNPAID' && Boolean(paymentDetails?.failure_reason);

  return (
    <div className="customer-page">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Page Header */}
      <div className="customer-page-header">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() => navigate('/customer/payments')}
            style={{ marginBottom: '8px' }}
          >
            ← Back to Payments
          </Button>
          <div className="booking-title-row">
            <h1 className="customer-page-title">Secure Payment</h1>
            <StatusBadge status={currentStatus} />
          </div>
          <p className="customer-page-subtitle">
            Pay directly via UPI for your FleetFlow trip
          </p>
        </div>
      </div>

      {/* Rules Notice Card */}
      <PaymentRulesCard />

      {/* Rejected Alert Notice */}
      {isRejected && (
        <div className="booking-alert-box alert-rejected">
          <strong>Payment Verification Rejected:</strong>
          <p style={{ margin: '4px 0 0 0' }}>
            {paymentDetails.failure_reason}
          </p>
          <div style={{ fontSize: '12px', marginTop: '6px' }}>
            Please re-check your UPI transaction details or upload a clearer screenshot below and submit again.
          </div>
        </div>
      )}

      {/* Awaiting Verification Banner */}
      {isAwaitingVerification && (
        <div className="verification-status-card">
          <div className="verification-icon-spin">⏳</div>
          <div className="verification-content">
            <h3>Payment Proof Submitted</h3>
            <p>
              Your transaction reference (<strong>{paymentDetails?.transaction_reference}</strong>)
              has been recorded and is currently waiting for the driver or manager to verify.
            </p>
            <div className="verification-poll-tag">
              Auto-checking status every 10 seconds...
            </div>
          </div>
        </div>
      )}

      {/* Main Payment Layout */}
      <div className="payment-page-grid">
        {/* Left Card: Fare & QR Instructions */}
        <div className="payment-qr-card">
          <div className="payment-trip-info">
            <div className="payment-amount-display">
              <span className="amount-label">Final Fare to Pay</span>
              <span className="amount-hero">
                {formatPayableAmount(payInfo.amount, {
                  paymentStatus: currentStatus,
                  notDue: currentStatus === 'PAID' || currentStatus === 'NO_PAYMENT_DUE',
                })}
              </span>
            </div>

            <div className="trip-summary-pills">
              <div className="pill-item">
                <span className="pill-lbl">Route</span>
                <span className="pill-val">{payInfo.route || 'Trip Route'}</span>
              </div>
              <div className="pill-item">
                <span className="pill-lbl">Vehicle</span>
                <span className="pill-val">{payInfo.vehicle || 'Fleet Vehicle'}</span>
              </div>
              <div className="pill-item">
                <span className="pill-lbl">Driver</span>
                <span className="pill-val">{payInfo.driver_name || 'Assigned Driver'}</span>
              </div>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="qr-container-box">
            {payInfo.qr_image_url ? (
              <>
                <div className="qr-image-wrapper">
                  <img
                    src={payInfo.qr_image_url}
                    alt="FleetFlow Payment QR"
                    className="static-qr-img"
                  />
                </div>
                {payInfo.upi_id && (
                  <div className="upi-id-badge">
                    <span>UPI ID:</span>
                    <strong>{payInfo.upi_id}</strong>
                  </div>
                )}
                <div className="qr-action-buttons" style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={handleCopyAmount}
                  >
                    📋 Copy Amount
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={handleDownloadQr}
                  >
                    📥 Download QR
                  </Button>
                </div>
              </>
            ) : (
              <div className="no-qr-alert">
                <span style={{ fontSize: '24px' }}>⚠️</span>
                <p>Payment QR is not set. Please contact support.</p>
              </div>
            )}
          </div>

          {/* Steps list */}
          <div className="payment-steps-list">
            <h4>Simple Payment Steps:</h4>
            <ol>
              <li>Scan this QR with any UPI app (PhonePe, Google Pay, Paytm, etc.).</li>
              <li>Pay exactly <strong>{formatCurrency(payInfo.amount)}</strong>.</li>
              <li>Enter the 12-digit UPI transaction reference (UTR) below and submit.</li>
            </ol>
          </div>
        </div>

        {/* Right Card: Proof Submission Form */}
        <div className="payment-form-card">
          <h2 className="card-section-title">Submit Payment Details</h2>
          <p className="form-helper-text">
            Enter the transaction reference from your UPI confirmation screen to verify payment.
          </p>

          <form onSubmit={handleSubmitProof} className="proof-submit-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <TextInput
              id="txRefInput"
              label="Transaction Reference / UTR"
              required
              placeholder="e.g. 329481928374 or UPI Ref ID"
              value={transactionRef}
              onChange={(e) => {
                setTransactionRef(e.target.value);
                setFieldErrors((prev) => ({ ...prev, transaction_reference: null }));
              }}
              disabled={submitting}
              maxLength={30}
              error={fieldErrors.transaction_reference}
              hint="6 to 30 alphanumeric characters found on your bank/UPI debit receipt."
            />

            <FileInput
              id="screenshotInput"
              label="Payment Screenshot (Optional)"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              maxSizeMB={2}
              disabled={submitting}
              onChange={(file) => {
                setScreenshotFile(file);
                setFieldErrors((prev) => ({ ...prev, proof_screenshot: null }));
              }}
              error={fieldErrors.proof_screenshot}
              hint="PNG, JPG, or WEBP up to 2 MB."
            />

            <Button
              type="submit"
              variant="primary"
              size="large"
              fullWidth
              loading={submitting}
              disabled={submitting || !transactionRef.trim()}
            >
              Submit Payment Proof
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
