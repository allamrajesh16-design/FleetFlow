import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPaymentDetailsApi,
  getPaymentReceiptApi,
  downloadReceiptPdfApi,
} from '../../api/customer';
import { SkeletonCard } from '../../components/common/Skeleton';
import ErrorState from '../../components/common/ErrorState';
import Toast from '../../components/common/Toast';
import Button from '../../components/common/Button';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import './CustomerPages.css';

export default function CustomerPaymentReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [payment, setPayment] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const paymentData = await getPaymentDetailsApi(id);
      setPayment(paymentData);

      if (paymentData.status === 'PAID') {
        try {
          const receiptData = await getPaymentReceiptApi(id);
          setReceipt(receiptData);
        } catch (rErr) {
          // Receipt may be asynchronously generated
        }
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setError('You are not authorized to view this receipt.');
      } else if (err.response?.status === 404) {
        setError('Payment record not found.');
      } else {
        setError('Failed to load receipt details. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const blob = await downloadReceiptPdfApi(id);
      const url = window.URL.createObjectURL(
        new Blob([blob], { type: 'application/pdf' })
      );
      const link = document.createElement('a');
      link.href = url;
      const receiptNum = receipt?.receipt_number || payment?.receipt_number || id;
      link.setAttribute('download', `FleetFlow-Receipt-${receiptNum}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setToast({ type: 'success', message: 'PDF Receipt downloaded successfully.' });
    } catch (err) {
      console.error('Failed to download PDF', err);
      setToast({ type: 'error', message: 'Unable to download PDF receipt. Please try again.' });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="customer-page">
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-page">
        <ErrorState message={error} onRetry={loadData} />
      </div>
    );
  }

  if (!payment) return null;

  const rData = receipt?.data || {};
  const status = payment.status;

  return (
    <div className="customer-page">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Top back navigation */}
      <div className="customer-page-header">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() => navigate('/customer/bookings')}
            style={{ marginBottom: '8px' }}
          >
            ← Back to Bookings
          </Button>
          <h1 className="customer-page-title">Payment Status & Receipt</h1>
        </div>
      </div>

      {/* Case 1: SUCCESS / PAID */}
      {status === 'PAID' && (
        <div className="receipt-container-card">
          <div className="receipt-header-banner success-banner">
            <div className="success-icon-badge">✓</div>
            <h2>Payment Successful</h2>
            <p className="success-subtitle">
              Your payment has been received and confirmed. Official receipt issued.
            </p>
            <div className="receipt-hero-amount">
              {formatCurrency(payment.amount)}
            </div>
          </div>

          <div className="receipt-body">
            <div className="receipt-meta-grid">
              <div className="receipt-meta-item">
                <span className="rm-lbl">Receipt Number</span>
                <strong className="rm-val">
                  {receipt?.receipt_number || payment.receipt_number || `REC-${payment.id}`}
                </strong>
              </div>

              <div className="receipt-meta-item">
                <span className="rm-lbl">Transaction Reference</span>
                <strong className="rm-val">
                  {payment.transaction_reference || payment.gateway_reference || 'UPI-REF'}
                </strong>
              </div>

              <div className="receipt-meta-item">
                <span className="rm-lbl">Payment Date & Time</span>
                <strong className="rm-val">
                  {formatDateTime(payment.paid_at || payment.updated_at)}
                </strong>
              </div>

              <div className="receipt-meta-item">
                <span className="rm-lbl">Payment Method</span>
                <strong className="rm-val">UPI (Static QR)</strong>
              </div>
            </div>

            <div className="receipt-divider" />

            <h3 className="receipt-section-heading">Trip Summary</h3>
            <div className="receipt-trip-grid">
              <div className="receipt-meta-item">
                <span className="rm-lbl">Route</span>
                <strong className="rm-val">
                  {rData.route || `${payment.trip_source || 'Start'} to ${payment.trip_destination || 'End'}`}
                </strong>
              </div>

              <div className="receipt-meta-item">
                <span className="rm-lbl">Vehicle</span>
                <strong className="rm-val">
                  {rData.vehicle || payment.vehicle_registration || 'Fleet Vehicle'}
                </strong>
              </div>

              <div className="receipt-meta-item">
                <span className="rm-lbl">Assigned Driver</span>
                <strong className="rm-val">
                  {rData.driver || payment.driver_name || 'Fleet Driver'}
                </strong>
              </div>

              {rData.distance_km && (
                <div className="receipt-meta-item">
                  <span className="rm-lbl">Total Distance</span>
                  <strong className="rm-val">{rData.distance_km} km</strong>
                </div>
              )}

              <div className="receipt-meta-item">
                <span className="rm-lbl">Total Fare</span>
                <strong className="rm-val">{formatCurrency(payment.amount)}</strong>
              </div>
            </div>

            <div className="receipt-actions-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="primary"
                size="medium"
                onClick={handleDownloadPdf}
                loading={downloading}
                disabled={downloading}
              >
                📄 Download PDF Receipt
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="medium"
                onClick={() => navigate('/customer/bookings')}
              >
                Back to My Bookings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Case 2: FAILED */}
      {status === 'FAILED' && (
        <div className="receipt-container-card">
          <div className="receipt-header-banner failed-banner">
            <div className="failed-icon-badge">✕</div>
            <h2>Payment Failed</h2>
            <p className="failed-subtitle">
              {payment.failure_reason || 'The payment verification could not be completed.'}
            </p>
            <div className="receipt-hero-amount">
              {formatCurrency(payment.amount)}
            </div>
          </div>
          <div className="receipt-body">
            <p>
              Your payment of {formatCurrency(payment.amount)} was not verified. You can retry paying with a valid transaction reference.
            </p>
            <div className="receipt-actions-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="primary"
                size="medium"
                onClick={() => navigate(`/customer/payments/${id}/pay`)}
              >
                Retry Payment
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="medium"
                onClick={() => navigate('/customer/bookings')}
              >
                Back to Bookings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Case 3: EXPIRED */}
      {status === 'EXPIRED' && (
        <div className="receipt-container-card">
          <div className="receipt-header-banner warning-banner">
            <div className="warning-icon-badge">⏱️</div>
            <h2>Payment Expired</h2>
            <p className="warning-subtitle">
              The payment window for this trip has expired.
            </p>
            <div className="receipt-hero-amount">
              {formatCurrency(payment.amount)}
            </div>
          </div>
          <div className="receipt-body">
            <p>
              Please re-initiate payment to complete your trip settlement.
            </p>
            <div className="receipt-actions-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="primary"
                size="medium"
                onClick={() => navigate(`/customer/payments/${id}/pay`)}
              >
                Pay Now
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="medium"
                onClick={() => navigate('/customer/bookings')}
              >
                Back to Bookings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Case 4: REFUNDED */}
      {status === 'REFUNDED' && (
        <div className="receipt-container-card">
          <div className="receipt-header-banner refunded-banner">
            <div className="refund-icon-badge">↩️</div>
            <h2>Payment Refunded</h2>
            <p className="refund-subtitle">
              A refund of {formatCurrency(payment.amount)} was processed for this booking.
            </p>
            <div className="receipt-hero-amount">
              {formatCurrency(payment.amount)}
            </div>
          </div>
          <div className="receipt-body">
            <div className="receipt-meta-grid">
              <div className="receipt-meta-item">
                <span className="rm-lbl">Refund Date</span>
                <strong className="rm-val">
                  {formatDateTime(payment.refunded_at || payment.updated_at)}
                </strong>
              </div>
              <div className="receipt-meta-item">
                <span className="rm-lbl">Status</span>
                <strong className="rm-val">REFUNDED</strong>
              </div>
            </div>
            <div className="receipt-actions-row" style={{ marginTop: '1.5rem' }}>
              <Button
                type="button"
                variant="secondary"
                size="medium"
                onClick={() => navigate('/customer/bookings')}
              >
                Back to Bookings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Case 5: UNPAID or PAYMENT_INITIATED */}
      {['UNPAID', 'PAYMENT_INITIATED'].includes(status) && (
        <div className="receipt-container-card">
          <div className="receipt-header-banner warning-banner">
            <div className="warning-icon-badge">⏳</div>
            <h2>Payment Pending</h2>
            <p className="warning-subtitle">
              {status === 'PAYMENT_INITIATED'
                ? 'Your payment proof has been submitted and is awaiting confirmation.'
                : 'Payment for this trip has not been completed yet.'}
            </p>
            <div className="receipt-hero-amount">
              {formatCurrency(payment.amount)}
            </div>
          </div>
          <div className="receipt-body">
            <div className="receipt-actions-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="primary"
                size="medium"
                onClick={() => navigate(`/customer/payments/${id}/pay`)}
              >
                {status === 'PAYMENT_INITIATED' ? 'View Payment Status' : 'Proceed to Pay'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="medium"
                onClick={() => navigate('/customer/bookings')}
              >
                Back to Bookings
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
