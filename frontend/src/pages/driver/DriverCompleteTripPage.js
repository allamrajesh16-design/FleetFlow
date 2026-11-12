import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import DateTimeInput from '../../components/forms/DateTimeInput';
import Textarea from '../../components/forms/Textarea';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton, Spinner } from '../../components/common/Loader';
import DriverTripReceipt from '../../components/driver/DriverTripReceipt';
import {
  ArrowLeftIcon,
  CheckIcon,
  UserIcon,
} from '../../components/common/Icons';
import {
  getTripDetailsApi,
  getTripPaymentsApi,
  getPaymentQrSettingApi,
  getTripFarePreviewApi,
  completeTripWithDistanceApi,
  collectPaymentApi,
  confirmPaymentApi,
  downloadTripReceiptPdfApi,
} from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import './DriverPages.css';

export default function DriverCompleteTripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrSetting, setQrSetting] = useState(null);

  // Workflow Stage: 1 = Complete Trip Form (Stage 4), 2 = Payment Process (Stage 5), 3 = Completed & Receipt
  const [stage, setStage] = useState(1);

  // STAGE 4 FORM FIELDS
  const [actualPickup, setActualPickup] = useState('');
  const [actualDrop, setActualDrop] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [actualStartTime, setActualStartTime] = useState('');
  const [actualEndTime, setActualEndTime] = useState('');
  const [additionalCharges, setAdditionalCharges] = useState('0');
  const [remarks, setRemarks] = useState('');

  // Fare Calculation State
  const [farePreview, setFarePreview] = useState(null);
  const [fareLoading, setFareLoading] = useState(false);
  const [completingTrip, setCompletingTrip] = useState(false);
  const [formError, setFormError] = useState('');

  // STAGE 5 PAYMENT STATE
  const [paymentId, setPaymentId] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState('PENDING'); // 'PENDING' | 'PAID' | 'FAILED'
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // 'CASH' | 'ONLINE'
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [utrReference, setUtrReference] = useState('');
  const [completedTripData, setCompletedTripData] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const debounceTimerRef = useRef(null);

  // Initial Load
  const fetchTripData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tripData, qrData, paymentsData] = await Promise.all([
        getTripDetailsApi(id),
        getPaymentQrSettingApi().catch(() => null),
        getTripPaymentsApi(id).catch(() => []),
      ]);

      setTrip(tripData);
      setQrSetting(qrData);

      // Initialize form fields
      setActualPickup(tripData.pickup_location || tripData.source || '');
      setActualDrop(tripData.drop_location || tripData.destination || '');

      // Default distance from estimated route or 15 km
      const estDist = Number(tripData.route_distance_km || 15);
      setDistanceKm(String(estDist));

      // Times
      if (tripData.started_at) {
        const sDate = new Date(tripData.started_at);
        setActualStartTime(sDate.toISOString().slice(0, 16));
      } else {
        setActualStartTime(new Date().toISOString().slice(0, 16));
      }
      setActualEndTime(new Date().toISOString().slice(0, 16));

      // Check payments list
      const pList = Array.isArray(paymentsData) ? paymentsData : paymentsData?.results || [];
      const unpaidP = pList.find((p) => p.status === 'UNPAID' || p.status === 'PAYMENT_INITIATED');
      const paidP = pList.find((p) => p.status === 'PAID');

      if (tripData.status === 'COMPLETED') {
        setCompletedTripData(tripData);
        if (paidP) {
          setPaymentStatus('PAID');
          setPaymentId(paidP.id);
          setStage(3); // Receipt view
        } else if (unpaidP) {
          setPaymentId(unpaidP.id);
          setPaymentStatus('PENDING');
          setStage(2); // Payment view
        } else {
          setStage(3);
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTripData();
  }, [fetchTripData]);

  // Handle Distance Change -> Auto Fare Preview
  const handleDistanceChange = (val) => {
    setDistanceKm(val);
    setFormError('');
    const dist = Number(val);
    if (!isNaN(dist) && dist > 0) {
      triggerFareCalculation(dist, additionalCharges);
    }
  };

  // Handle Additional Charges Change
  const handleAdditionalChargesChange = (val) => {
    setAdditionalCharges(val);
    const dist = Number(distanceKm);
    if (!isNaN(dist) && dist > 0) {
      triggerFareCalculation(dist, val);
    }
  };

  // Debounced server fare calculation
  const triggerFareCalculation = useCallback((dist, charges) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      if (!trip || dist <= 0) return;
      setFareLoading(true);
      try {
        const preview = await getTripFarePreviewApi(id, {
          distance_km: dist,
          additional_charges: charges || 0,
        });
        setFarePreview(preview);
      } catch (err) {
        // Fallback local calculation if network preview fails
        const rate = Number(trip.rate_per_km || 15);
        const distFare = dist * rate;
        const extra = Number(charges || 0);
        const total = distFare + extra;
        setFarePreview({
          base_fare: '0.00',
          distance_fare: distFare.toFixed(2),
          additional_charges: extra.toFixed(2),
          fare: total.toFixed(2),
          breakdown: `${dist} km × ₹${rate}/km + ₹${extra} extra = ₹${total.toFixed(2)}`,
        });
      } finally {
        setFareLoading(false);
      }
    }, 300);
  }, [id, trip]);

  // Trigger initial fare calculation once trip is loaded
  useEffect(() => {
    if (trip && trip.status === 'IN_PROGRESS' && distanceKm) {
      triggerFareCalculation(Number(distanceKm), additionalCharges);
    }
  }, [trip, distanceKm, additionalCharges, triggerFareCalculation]);

  // Computed displayed fare numbers
  const displayFare = useMemo(() => {
    if (farePreview?.fare) return farePreview.fare;
    const rate = Number(trip?.rate_per_km || 15);
    const dist = Number(distanceKm || 0);
    const extra = Number(additionalCharges || 0);
    return ((dist * rate) + extra).toFixed(2);
  }, [farePreview, trip, distanceKm, additionalCharges]);

  // STAGE 4: CONFIRM TRIP COMPLETION SUBMISSION
  const handleConfirmCompletion = async (e) => {
    e?.preventDefault();
    setFormError('');

    if (!actualPickup.trim()) {
      setFormError('Please enter actual pickup address.');
      return;
    }
    if (!actualDrop.trim()) {
      setFormError('Please enter actual drop-off address.');
      return;
    }

    const dist = Number(distanceKm);
    if (!distanceKm || isNaN(dist) || dist <= 0) {
      setFormError('Total distance travelled must be strictly greater than 0 KM.');
      return;
    }

    if (completingTrip) return;
    setCompletingTrip(true);

    try {
      const payload = {
        distance_km: dist,
        actual_pickup: actualPickup.trim(),
        actual_drop: actualDrop.trim(),
        additional_charges: Number(additionalCharges || 0),
        remarks: remarks.trim(),
        actual_start_time: actualStartTime ? new Date(actualStartTime).toISOString() : undefined,
        actual_end_time: actualEndTime ? new Date(actualEndTime).toISOString() : new Date().toISOString(),
      };

      const response = await completeTripWithDistanceApi(id, payload);
      const updatedTrip = response.trip || response;
      setTrip(updatedTrip);
      setCompletedTripData(updatedTrip);

      if (response.payment_id) {
        setPaymentId(response.payment_id);
      } else {
        // Fetch fresh payment records
        const paymentsData = await getTripPaymentsApi(id).catch(() => []);
        const pList = Array.isArray(paymentsData) ? paymentsData : paymentsData?.results || [];
        const unpaid = pList.find((p) => p.status === 'UNPAID' || p.status === 'PAYMENT_INITIATED');
        if (unpaid) setPaymentId(unpaid.id);
      }

      success('Trip completed successfully! Please proceed with payment settlement.');
      setStage(2); // Advance to Stage 5: Payment Process
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setCompletingTrip(false);
    }
  };

  // STAGE 5: CONFIRM CASH PAYMENT
  const handleConfirmCashPayment = async () => {
    if (!paymentId) {
      toastError('Payment record not found for this trip.');
      return;
    }
    setSubmittingPayment(true);
    try {
      const result = await collectPaymentApi(paymentId, {
        method: 'CASH',
        payment_method: 'CASH',
      });

      // Verification check: ensure backend marked payment as PAID
      if (result.status === 'PAID' || result.payment?.status === 'PAID') {
        setPaymentStatus('PAID');
        success('Cash payment confirmed and recorded successfully!');
        // Refresh trip details
        const refreshed = await getTripDetailsApi(id);
        setCompletedTripData(refreshed);
        setStage(3); // Advance to receipt view
      } else {
        setPaymentStatus('PENDING');
        toastError('Payment recorded but awaiting manager settlement confirmation.');
      }
    } catch (err) {
      toastError(getApiErrorMessage(err));
    } finally {
      setSubmittingPayment(false);
    }
  };

  // STAGE 5: CONFIRM ONLINE / QR PAYMENT
  const handleConfirmOnlinePayment = async () => {
    if (!paymentId) {
      toastError('Payment record not found.');
      return;
    }
    setSubmittingPayment(true);
    try {
      // Collect online payment with transaction reference
      await collectPaymentApi(paymentId, {
        method: 'ONLINE',
        payment_method: 'UPI',
        transaction_reference: utrReference.trim() || undefined,
      });

      // Confirm receipt
      const result = await confirmPaymentApi(paymentId);
      if (result.status === 'PAID' || result.payment?.status === 'PAID') {
        setPaymentStatus('PAID');
        success('Online payment verified successfully!');
        const refreshed = await getTripDetailsApi(id);
        setCompletedTripData(refreshed);
        setStage(3);
      } else {
        success('Payment reference submitted. Verification in progress.');
      }
    } catch (err) {
      toastError(getApiErrorMessage(err));
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const blob = await downloadTripReceiptPdfApi(id);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `FleetFlow_Receipt_Trip_${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toastError('Failed to download PDF receipt.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="driver-page fade-in">
        <div className="driver-page-header">
          <Skeleton height="32px" width="180px" />
        </div>
        <Card>
          <Skeleton height="200px" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="driver-page fade-in">
        <div className="driver-page-header">
          <IconButton
            icon={<ArrowLeftIcon size={20} />}
            label="Back"
            ariaLabel="Back"
            onClick={() => navigate('/driver/trips')}
            variant="ghost"
          />
        </div>
        <ErrorState message={error} onRetry={fetchTripData} />
      </div>
    );
  }

  return (
    <div className="driver-page driver-complete-trip-page fade-in">
      {/* Top Header */}
      <div className="driver-page-header">
        <IconButton
          icon={<ArrowLeftIcon size={20} />}
          label="Back"
          ariaLabel="Back"
          onClick={() => navigate(`/driver/trips/${id}`)}
          variant="ghost"
        />
        <h1 className="driver-page-title">
          {stage === 1 ? `Complete Trip #${id}` : stage === 2 ? 'Payment Settlement' : 'Trip Receipt'}
        </h1>
        <div style={{ width: 44 }} />
      </div>

      {/* Multi-Stage Visual Stepper */}
      <div className="driver-lifecycle-stepper">
        <div className={`driver-step ${stage >= 1 ? 'completed' : ''}`}>
          <div className="driver-step-dot">{stage > 1 ? '✓' : '1'}</div>
          <span className="driver-step-title">Trip Details</span>
        </div>

        <div className={`driver-step-line ${stage >= 2 ? 'active' : ''}`} />

        <div className={`driver-step ${stage >= 2 ? (stage > 2 ? 'completed' : 'active') : ''}`}>
          <div className="driver-step-dot">{stage > 2 ? '✓' : '2'}</div>
          <span className="driver-step-title">Payment</span>
        </div>

        <div className={`driver-step-line ${stage === 3 ? 'active' : ''}`} />

        <div className={`driver-step ${stage === 3 ? 'completed' : ''}`}>
          <div className="driver-step-dot">{stage === 3 ? '✓' : '3'}</div>
          <span className="driver-step-title">Receipt</span>
        </div>
      </div>

      {/* =========================================================================
          STAGE 4: COMPLETE TRIP FORM
          ========================================================================= */}
      {stage === 1 && (
        <form onSubmit={handleConfirmCompletion} className="driver-completion-form-wrap">
          {formError && (
            <div className="driver-form-error-banner">
              {formError}
            </div>
          )}

          <div className="driver-form-two-col">
            {/* Left Column: Form Fields in clean 2-column grid */}
            <Card className="driver-form-card">
              <h3 className="driver-card-heading">Actual Trip Details</h3>

              <div className="driver-form-grid">
                {/* 1. Actual Pickup Address */}
                <div className="driver-form-col-1">
                  <Input
                    label="1. Actual Pickup Address *"
                    type="text"
                    required
                    placeholder="Enter pickup point"
                    value={actualPickup}
                    onChange={(e) => setActualPickup(e.target.value)}
                  />
                </div>

                {/* 2. Actual Drop Address */}
                <div className="driver-form-col-1">
                  <Input
                    label="2. Actual Drop Address *"
                    type="text"
                    required
                    placeholder="Enter drop-off destination"
                    value={actualDrop}
                    onChange={(e) => setActualDrop(e.target.value)}
                  />
                </div>

                {/* 3. Total Distance */}
                <div className="driver-form-col-1">
                  <Input
                    label="3. Total Distance (KM) *"
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    placeholder="e.g. 18.5"
                    value={distanceKm}
                    onChange={(e) => handleDistanceChange(e.target.value)}
                    helperText="Total kilometres travelled for this trip."
                  />
                </div>

                {/* 4. Additional Charges */}
                <div className="driver-form-col-1">
                  <Input
                    label="4. Additional Charges (₹)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={additionalCharges}
                    onChange={(e) => handleAdditionalChargesChange(e.target.value)}
                    helperText="Tolls, parking, or waiting fees (0 if none)."
                  />
                </div>

                {/* 5. Actual Start Time */}
                <div className="driver-form-col-1">
                  <DateTimeInput
                    label="5. Actual Start Time *"
                    required
                    value={actualStartTime}
                    onChange={(e) => setActualStartTime(e.target.value)}
                  />
                </div>

                {/* 6. Actual End Time */}
                <div className="driver-form-col-1">
                  <DateTimeInput
                    label="6. Actual End Time *"
                    required
                    value={actualEndTime}
                    onChange={(e) => setActualEndTime(e.target.value)}
                  />
                </div>

                {/* 7. Completion Notes (Full Width) */}
                <div className="driver-form-col-full">
                  <Textarea
                    label="7. Completion Notes (Optional)"
                    rows={2}
                    placeholder="Enter any completion notes or remarks..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* Right Column: Live Fare Calculation Card */}
            <div className="driver-fare-preview-col">
              <Card className="driver-fare-preview-card">
                <h3 className="driver-card-heading">Fare & Payment Summary</h3>
                <p className="driver-fare-sub">
                  Calculated automatically using configured vehicle rates.
                </p>

                <div className="driver-fare-breakdown-list">
                  <div className="driver-fare-row">
                    <span className="driver-fare-k">Total Distance:</span>
                    <span className="driver-fare-v font-bold">
                      {distanceKm ? `${distanceKm} KM` : '—'}
                    </span>
                  </div>

                  <div className="driver-fare-row">
                    <span className="driver-fare-k">Base Fare:</span>
                    <span className="driver-fare-v">
                      {Number(farePreview?.base_fare || 0) > 0 ? `₹${Number(farePreview.base_fare).toFixed(2)}` : '₹0.00'}
                    </span>
                  </div>

                  <div className="driver-fare-row">
                    <div className="driver-fare-label-wrap">
                      <span className="driver-fare-k">Distance Fare:</span>
                      <span className="driver-fare-calc-tag">
                        ({distanceKm || 0} km × ₹{trip?.rate_per_km || 15}/km)
                      </span>
                    </div>
                    <span className="driver-fare-v font-bold">
                      ₹{farePreview?.distance_fare || ((Number(distanceKm || 0) * Number(trip?.rate_per_km || 15)).toFixed(2))}
                    </span>
                  </div>

                  <div className="driver-fare-row">
                    <span className="driver-fare-k">Additional Charges:</span>
                    <span className="driver-fare-v">
                      ₹{Number(additionalCharges || 0).toFixed(2)}
                    </span>
                  </div>

                  {farePreview?.discount && Number(farePreview.discount) > 0 && (
                    <div className="driver-fare-row discount">
                      <span className="driver-fare-k">Discount:</span>
                      <span className="driver-fare-v" style={{ color: 'var(--success-text)' }}>
                        -₹{Number(farePreview.discount).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="driver-fare-row">
                    <span className="driver-fare-k">Payment Status:</span>
                    <span className="driver-fare-v">
                      <span
                        className={`driver-payment-badge ${
                          trip?.payment_status === 'PAID'
                            ? 'paid'
                            : trip?.payment_status === 'UNPAID'
                            ? 'unpaid'
                            : 'pending'
                        }`}
                      >
                        {trip?.payment_status || 'PENDING'}
                      </span>
                    </span>
                  </div>

                  <div className="driver-fare-divider" />

                  <div className="driver-fare-row total">
                    <span className="driver-fare-k total">Final Amount:</span>
                    <span className="driver-fare-v total">
                      {fareLoading ? <Spinner size="sm" /> : `₹${displayFare}`}
                    </span>
                  </div>
                </div>

                <div className="driver-form-actions-stack">
                  <Button
                    type="submit"
                    variant="primary"
                    size="large"
                    fullWidth
                    disabled={completingTrip || !distanceKm}
                  >
                    {completingTrip ? 'Submitting Completion...' : 'Confirm Trip Completion'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="medium"
                    fullWidth
                    disabled={completingTrip}
                    onClick={() => navigate(`/driver/trips/${id}`)}
                  >
                    Cancel
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </form>
      )}

      {/* =========================================================================
          STAGE 5: PAYMENT PROCESS
          ========================================================================= */}
      {stage === 2 && (
        <div className="driver-payment-stage-wrap">
          <Card className="driver-payment-summary-card">
            <div className="driver-payment-success-header">
              <div className="driver-completed-badge-icon">
                <CheckIcon size={24} />
              </div>
              <div>
                <h2 className="driver-payment-title">Trip Completed – Settlement Summary</h2>
                <p className="driver-payment-sub">
                  Review the final fare and select payment method to collect payment.
                </p>
              </div>
            </div>

            {/* Payment Summary Details */}
            <div className="driver-payment-summary-grid">
              <div className="driver-summary-item">
                <span className="driver-summary-title">Booking ID</span>
                <span className="driver-summary-data font-bold">
                  {trip?.booking_id ? `#${trip.booking_id}` : 'Direct Dispatch'}
                </span>
              </div>

              <div className="driver-summary-item">
                <span className="driver-summary-title">Trip ID</span>
                <span className="driver-summary-data font-bold">#{trip?.id}</span>
              </div>

              <div className="driver-summary-item">
                <span className="driver-summary-title">Customer Name</span>
                <span className="driver-summary-data primary">
                  <UserIcon size={14} />
                  {trip?.customer_name || 'Customer'}
                </span>
              </div>

              <div className="driver-summary-item">
                <span className="driver-summary-title">Total Distance</span>
                <span className="driver-summary-data">{trip?.distance_km || distanceKm} KM</span>
              </div>

              <div className="driver-summary-item">
                <span className="driver-summary-title">Total Fare</span>
                <span className="driver-summary-data fare font-bold">
                  ₹{trip?.total_fare || displayFare}
                </span>
              </div>

              <div className="driver-summary-item">
                <span className="driver-summary-title">Payment Status</span>
                <span className="driver-summary-data">
                  <span
                    className={`driver-payment-badge ${
                      paymentStatus === 'PAID'
                        ? 'paid'
                        : paymentStatus === 'FAILED'
                        ? 'unpaid'
                        : 'pending'
                    }`}
                  >
                    {paymentStatus}
                  </span>
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="driver-method-selector-section">
              <h3 className="driver-method-heading">Select Payment Method</h3>
              <div className="driver-methods-grid">
                <div
                  role="button"
                  tabIndex={0}
                  className={`driver-method-card ${paymentMethod === 'CASH' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('CASH')}
                  onKeyDown={(e) => e.key === 'Enter' && setPaymentMethod('CASH')}
                >
                  <div className="driver-method-radio">
                    <span className={`driver-radio-inner ${paymentMethod === 'CASH' ? 'checked' : ''}`} />
                  </div>
                  <div>
                    <span className="driver-method-name">Cash Payment</span>
                    <span className="driver-method-desc">Collect physical cash directly from customer</span>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  className={`driver-method-card ${paymentMethod === 'ONLINE' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('ONLINE')}
                  onKeyDown={(e) => e.key === 'Enter' && setPaymentMethod('ONLINE')}
                >
                  <div className="driver-method-radio">
                    <span className={`driver-radio-inner ${paymentMethod === 'ONLINE' ? 'checked' : ''}`} />
                  </div>
                  <div>
                    <span className="driver-method-name">Online UPI / QR Payment</span>
                    <span className="driver-method-desc">Customer scans QR code or pays via UPI</span>
                  </div>
                </div>
              </div>

              {/* Cash Collection Option */}
              {paymentMethod === 'CASH' && (
                <div className="driver-method-content-box">
                  <div className="driver-cash-prompt">
                    <p>
                      Collect <strong>₹{trip?.total_fare || displayFare}</strong> in cash from the customer. Once received, click below to confirm.
                    </p>
                    <Button
                      variant="primary"
                      size="large"
                      disabled={submittingPayment}
                      onClick={handleConfirmCashPayment}
                      className="driver-confirm-cash-btn"
                    >
                      {submittingPayment ? 'Processing Settlement...' : 'Confirm Cash Received'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Online QR Option */}
              {paymentMethod === 'ONLINE' && (
                <div className="driver-method-content-box">
                  <div className="driver-qr-display-box">
                    <p className="driver-qr-prompt">
                      Customer can scan the FleetFlow UPI QR code to pay <strong>₹{trip?.total_fare || displayFare}</strong>:
                    </p>

                    {qrSetting?.qr_code_image_url ? (
                      <div className="driver-qr-img-wrapper">
                        <img
                          src={qrSetting.qr_code_image_url}
                          alt="FleetFlow Payment QR"
                          className="driver-qr-image"
                        />
                      </div>
                    ) : (
                      <div className="driver-qr-placeholder">
                        <p>UPI ID: <strong>fleetflow@upi</strong></p>
                      </div>
                    )}

                    <div className="driver-utr-input-box">
                      <Input
                        label="Transaction / UTR Reference Number (Optional)"
                        placeholder="e.g. 234567890123"
                        value={utrReference}
                        onChange={(e) => setUtrReference(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                      <Button
                        variant="primary"
                        size="medium"
                        disabled={submittingPayment}
                        onClick={handleConfirmOnlinePayment}
                      >
                        {submittingPayment ? 'Verifying...' : 'Verify Online Payment'}
                      </Button>
                      <Button
                        variant="outline"
                        size="medium"
                        onClick={() => navigate(`/driver/trips/${id}/payment`)}
                      >
                        Open Full QR Terminal
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* =========================================================================
          STAGE 3: COMPLETED TRIP DIGITAL RECEIPT
          ========================================================================= */}
      {stage === 3 && (
        <div className="driver-receipt-stage-wrap">
          <Card className="driver-receipt-card-container">
            <div className="driver-receipt-action-bar">
              <div>
                <h2 className="driver-receipt-title">Trip Finished & Settled</h2>
                <span className="driver-receipt-sub">Receipt generated from backend verified data.</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="medium"
                  onClick={() => window.print()}
                >
                  Print Receipt
                </Button>
                <Button
                  variant="primary"
                  size="medium"
                  disabled={downloadingPdf}
                  onClick={handleDownloadPdf}
                >
                  {downloadingPdf ? 'Downloading...' : 'Download PDF'}
                </Button>
                <Button
                  variant="outline"
                  size="medium"
                  onClick={() => navigate('/driver/history')}
                >
                  View Trip History
                </Button>
              </div>
            </div>

            <div className="driver-receipt-body">
              <DriverTripReceipt
                trip={completedTripData || trip}
                onDownloadPdf={handleDownloadPdf}
                onPrint={() => window.print()}
                onBackToTrips={() => navigate('/driver/history')}
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
