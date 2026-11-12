import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import { Skeleton } from '../../components/common/Loader';
import DriverTripReceipt from '../../components/driver/DriverTripReceipt';
import {
  ArrowLeftIcon,
  VehicleIcon,
  UserIcon,
  CheckIcon,
} from '../../components/common/Icons';
import { getTripDetailsApi, startTripApi, downloadTripReceiptPdfApi } from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import './DriverPages.css';

// Live ticking timer for elapsed trip duration
function LiveElapsedTimer({ startTime }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startTime) return;
    const start = new Date(startTime).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diffMs = Math.max(0, now - start);
      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      const pad = (n) => String(n).padStart(2, '0');
      if (hours > 0) {
        setElapsed(`${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`);
      } else {
        setElapsed(`${pad(minutes)}m ${pad(seconds)}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span>{elapsed || 'Calculating...'}</span>;
}

export default function DriverTripDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Start Trip Confirmation Modal State
  const [showStartModal, setShowStartModal] = useState(false);
  const [startingTrip, setStartingTrip] = useState(false);
  const [modalError, setModalError] = useState('');

  // Receipt Modal State
  const [showReceipt, setShowReceipt] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fetchTrip = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getTripDetailsApi(id);
      setTrip(data);
    } catch (err) {
      if (err.response?.status === 403) {
        setError('You are not authorized to view this trip.');
      } else if (err.response?.status === 404) {
        setError('Trip not found or does not belong to your account.');
      } else {
        setError(getApiErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleString([], {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateDuration = (startStr, endStr) => {
    if (!startStr || !endStr) return 'N/A';
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    const diffMin = Math.max(0, Math.round((end - start) / 60000));
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    if (hours > 0) return `${hours} hr ${mins} min`;
    return `${mins} min`;
  };

  const handleConfirmStartTrip = async () => {
    setModalError('');
    setStartingTrip(true);
    try {
      await startTripApi(id);
      success(`Trip #${id} started successfully!`);
      setShowStartModal(false);
      fetchTrip();
    } catch (err) {
      const resp = err.response?.data;
      if (resp?.message) {
        setModalError(resp.message);
      } else if (resp?.detail) {
        setModalError(resp.detail);
      } else {
        setModalError(getApiErrorMessage(err));
      }
    } finally {
      setStartingTrip(false);
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
      toastError(getApiErrorMessage(err) || 'Failed to download receipt PDF.');
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
          <Skeleton height="20px" width="70%" />
          <div style={{ marginTop: '16px' }}>
            <Skeleton height="80px" />
          </div>
          <div style={{ marginTop: '16px' }}>
            <Skeleton height="120px" />
          </div>
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
            ariaLabel="Back to My Trips"
            onClick={() => navigate('/driver/trips')}
            variant="ghost"
          />
        </div>
        <ErrorState message={error} onRetry={fetchTrip} />
      </div>
    );
  }

  if (!trip) return null;

  const isScheduled = trip.status === 'SCHEDULED';
  const isInProgress = trip.status === 'IN_PROGRESS';
  const isCompleted = trip.status === 'COMPLETED';
  const isCancelled = trip.status === 'CANCELLED';

  return (
    <div className="driver-page driver-trip-details-page fade-in">
      {/* Top Header */}
      <div className="driver-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <IconButton
            icon={<ArrowLeftIcon size={20} />}
            label="Back"
            ariaLabel="Back to My Trips"
            onClick={() => navigate('/driver/trips')}
            variant="ghost"
          />
          <div>
            <h1 className="driver-page-title">Trip #{trip.id}</h1>
            <span className="driver-header-subtitle">
              {trip.booking_id ? `Booking #${trip.booking_id}` : 'Direct Dispatch'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge status={trip.status} />
          {trip.payment_status && (
            <span
              className={`driver-payment-badge ${
                trip.payment_status === 'PAID'
                  ? 'paid'
                  : trip.payment_status === 'UNPAID'
                  ? 'unpaid'
                  : 'pending'
              }`}
            >
              {trip.payment_status}
            </span>
          )}
        </div>
      </div>

      {/* Visual Progress Indicator */}
      <div className="driver-lifecycle-stepper">
        <div className={`driver-step ${isScheduled || isInProgress || isCompleted ? 'completed' : ''}`}>
          <div className="driver-step-dot">{isScheduled || isInProgress || isCompleted ? '✓' : '1'}</div>
          <span className="driver-step-title">Assigned</span>
        </div>

        <div className={`driver-step-line ${isInProgress || isCompleted ? 'active' : ''}`} />

        <div className={`driver-step ${isInProgress ? 'active' : isCompleted ? 'completed' : ''}`}>
          <div className="driver-step-dot">{isCompleted ? '✓' : '2'}</div>
          <span className="driver-step-title">Started</span>
        </div>

        <div className={`driver-step-line ${isCompleted ? 'active' : ''}`} />

        <div className={`driver-step ${isCompleted ? 'completed' : ''}`}>
          <div className="driver-step-dot">{isCompleted ? '✓' : '3'}</div>
          <span className="driver-step-title">Completed</span>
        </div>

        <div className={`driver-step-line ${trip.payment_status === 'PAID' ? 'active' : ''}`} />

        <div className={`driver-step ${trip.payment_status === 'PAID' ? 'completed' : ''}`}>
          <div className="driver-step-dot">{trip.payment_status === 'PAID' ? '✓' : '4'}</div>
          <span className="driver-step-title">Payment</span>
        </div>
      </div>

      {/* STAGE 3: TRIP IN PROGRESS PANEL */}
      {isInProgress && (
        <Card className="driver-active-trip-banner">
          <div className="driver-active-banner-header">
            <div className="driver-active-tag">
              <span className="driver-live-dot" />
              <span>Trip is Currently In Progress</span>
            </div>
            <div className="driver-live-timer-box">
              <span className="driver-timer-label">ELAPSED DURATION:</span>
              <span className="driver-timer-digits">
                <LiveElapsedTimer startTime={trip.started_at} />
              </span>
            </div>
          </div>

          <div className="driver-banner-action-row">
            <p className="driver-banner-instruction">
              Drive safely to destination. Once passengers have reached their destination, click Complete Trip to enter final details and process payment.
            </p>
            <Button
              variant="primary"
              size="large"
              onClick={() => navigate(`/driver/trips/${trip.id}/complete`)}
              className="driver-complete-trip-banner-btn"
            >
              Complete Trip
            </Button>
          </div>
        </Card>
      )}

      {/* STAGE 1 & 2: ASSIGNED / UPCOMING TRIP BANNER */}
      {isScheduled && (
        <Card className="driver-upcoming-banner">
          <div className="driver-upcoming-banner-content">
            <div>
              <h3 className="driver-upcoming-title">Ready to Start This Trip?</h3>
              <p className="driver-upcoming-text">
                Verify vehicle and passenger details before departing. You will be prompted to confirm trip start.
              </p>
            </div>
            <Button
              variant="primary"
              size="large"
              disabled={!trip.can_start}
              onClick={() => setShowStartModal(true)}
              className="driver-start-trip-banner-btn"
            >
              {trip.can_start ? 'Start Trip' : 'Starts on Scheduled Date'}
            </Button>
          </div>
        </Card>
      )}

      {/* SECTION 4: COMPLETED TRIP OVERVIEW BANNER */}
      {isCompleted && (
        <Card className="driver-completed-overview-card">
          <div className="driver-completed-header-row">
            <div className="driver-completed-title-group">
              <div className="driver-completed-badge-icon">
                <CheckIcon size={24} />
              </div>
              <div>
                <h3 className="driver-completed-title">Trip Completed Successfully</h3>
                <span className="driver-completed-time">
                  Completed on {formatDateTime(trip.completed_at)}
                </span>
              </div>
            </div>

            <div className="driver-completed-actions">
              <Button
                variant="outline"
                size="medium"
                onClick={() => setShowReceipt(!showReceipt)}
              >
                {showReceipt ? 'Hide Receipt' : 'View Receipt'}
              </Button>
              <Button
                variant="primary"
                size="medium"
                disabled={downloadingPdf}
                onClick={handleDownloadPdf}
              >
                {downloadingPdf ? 'Downloading...' : 'Download PDF'}
              </Button>
              {trip.unpaid_payment_id && (
                <Button
                  variant="primary"
                  size="medium"
                  style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                  onClick={() => navigate(`/driver/trips/${trip.id}/complete`)}
                >
                  Collect Payment
                </Button>
              )}
            </div>
          </div>

          {/* Embedded Digital Receipt if toggled */}
          {showReceipt && (
            <div className="driver-embedded-receipt-wrap">
              <DriverTripReceipt
                trip={trip}
                onDownloadPdf={handleDownloadPdf}
                onPrint={() => window.print()}
                onBackToTrips={() => navigate('/driver/history')}
              />
            </div>
          )}
        </Card>
      )}

      {/* CANCELLED TRIP BANNER */}
      {isCancelled && (
        <Card className="driver-completed-overview-card" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
          <div className="driver-completed-header-row">
            <div className="driver-completed-title-group">
              <div>
                <h3 className="driver-completed-title" style={{ color: '#b91c1c' }}>This Trip Was Cancelled</h3>
                <span className="driver-completed-time" style={{ color: '#dc2626' }}>
                  {trip.dispatch_note || 'This trip has been cancelled by fleet manager or customer.'}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Detailed Trip Info Cards Grid */}
      <div className="driver-details-grid">
        {/* Route Details Card */}
        <Card className="driver-detail-card">
          <h3 className="driver-card-heading">Route & Location Details</h3>
          <div className="driver-route-visual-vertical">
            <div className="driver-route-node origin">
              <span className="driver-route-dot green" />
              <div className="driver-node-content">
                <span className="driver-node-label">PICKUP LOCATION</span>
                <span className="driver-node-address">
                  {trip.pickup_location || trip.source || 'Pickup point'}
                </span>
              </div>
            </div>

            <div className="driver-route-line-v" />

            <div className="driver-route-node destination">
              <span className="driver-route-dot red" />
              <div className="driver-node-content">
                <span className="driver-node-label">DROP-OFF LOCATION</span>
                <span className="driver-node-address">
                  {trip.drop_location || trip.destination || 'Destination point'}
                </span>
              </div>
            </div>
          </div>

          <div className="driver-stats-inline">
            <div className="driver-stat-inline-item">
              <span className="driver-inline-label">Scheduled Date</span>
              <span className="driver-inline-val">{formatDateTime(trip.scheduled_datetime)}</span>
            </div>
            {trip.distance_km && (
              <div className="driver-stat-inline-item">
                <span className="driver-inline-label">Distance Travelled</span>
                <span className="driver-inline-val">{trip.distance_km} KM</span>
              </div>
            )}
          </div>
        </Card>

        {/* Customer & Booking Details Card */}
        <Card className="driver-detail-card">
          <h3 className="driver-card-heading">Customer & Booking</h3>
          <div className="driver-kv-list">
            <div className="driver-kv-row">
              <span className="driver-k">Customer Name</span>
              <span className="driver-v font-bold primary">
                <UserIcon size={14} />
                {trip.customer_name || 'Customer'}
              </span>
            </div>

            <div className="driver-kv-row">
              <span className="driver-k">Contact Phone</span>
              <span className="driver-v">
                {trip.customer_phone && trip.customer_phone !== 'N/A'
                  ? trip.customer_phone
                  : 'Available on booking'}
              </span>
            </div>

            <div className="driver-kv-row">
              <span className="driver-k">Contact Email</span>
              <span className="driver-v">{trip.customer_email || 'N/A'}</span>
            </div>

            <div className="driver-kv-row">
              <span className="driver-k">Passengers</span>
              <span className="driver-v">{trip.passengers || 1} Person</span>
            </div>

            {trip.booking_id && (
              <div className="driver-kv-row">
                <span className="driver-k">Booking ID</span>
                <span className="driver-v font-bold">#{trip.booking_id}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Vehicle Information Card */}
        <Card className="driver-detail-card">
          <h3 className="driver-card-heading">Assigned Vehicle</h3>
          <div className="driver-kv-list">
            <div className="driver-kv-row">
              <span className="driver-k">Registration Number</span>
              <span className="driver-v font-bold primary">
                <VehicleIcon size={14} />
                {trip.vehicle_registration || 'Vehicle'}
              </span>
            </div>

            <div className="driver-kv-row">
              <span className="driver-k">Vehicle Type</span>
              <span className="driver-v">{trip.vehicle_type || 'Car'}</span>
            </div>

            {trip.vehicle_brand_model && (
              <div className="driver-kv-row">
                <span className="driver-k">Model / Make</span>
                <span className="driver-v">{trip.vehicle_brand_model}</span>
              </div>
            )}

            {trip.rate_per_km && (
              <div className="driver-kv-row">
                <span className="driver-k">Rate per KM</span>
                <span className="driver-v">₹{trip.rate_per_km}/km</span>
              </div>
            )}

            {trip.vehicle_previous_odometer ? (
              <div className="driver-kv-row">
                <span className="driver-k">Last Recorded Odometer</span>
                <span className="driver-v">
                  {Number(trip.vehicle_previous_odometer).toLocaleString()} KM
                </span>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Timestamps & Fare Breakdown Card */}
        <Card className="driver-detail-card">
          <h3 className="driver-card-heading">Schedule & Fare Breakdown</h3>
          <div className="driver-kv-list">
            <div className="driver-kv-row">
              <span className="driver-k">Scheduled Departure</span>
              <span className="driver-v">{formatDateTime(trip.scheduled_datetime)}</span>
            </div>

            {trip.started_at && (
              <div className="driver-kv-row">
                <span className="driver-k">Actual Start Time</span>
                <span className="driver-v">{formatDateTime(trip.started_at)}</span>
              </div>
            )}

            {trip.completed_at && (
              <div className="driver-kv-row">
                <span className="driver-k">Completion Time</span>
                <span className="driver-v">{formatDateTime(trip.completed_at)}</span>
              </div>
            )}

            {trip.started_at && trip.completed_at && (
              <div className="driver-kv-row">
                <span className="driver-k">Total Duration</span>
                <span className="driver-v">{calculateDuration(trip.started_at, trip.completed_at)}</span>
              </div>
            )}

            {trip.start_odometer && (
              <div className="driver-kv-row">
                <span className="driver-k">Starting Odometer</span>
                <span className="driver-v">{trip.start_odometer} KM</span>
              </div>
            )}

            {trip.end_odometer && (
              <div className="driver-kv-row">
                <span className="driver-k">Ending Odometer</span>
                <span className="driver-v">{trip.end_odometer} KM</span>
              </div>
            )}

            <div className="driver-kv-row fare-highlight">
              <span className="driver-k">Total Fare</span>
              <span className="driver-v fare-val">
                ₹{trip.total_fare || trip.booking_amount || '0.00'}
              </span>
            </div>

            <div className="driver-kv-row">
              <span className="driver-k">Payment Status</span>
              <span className="driver-v">
                <span
                  className={`driver-payment-badge ${
                    trip.payment_status === 'PAID'
                      ? 'paid'
                      : trip.payment_status === 'UNPAID'
                      ? 'unpaid'
                      : 'pending'
                  }`}
                >
                  {trip.payment_status || 'PENDING'}
                </span>
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Start This Trip Confirmation Modal */}
      {showStartModal && (
        <Modal
          isOpen={true}
          onClose={() => !startingTrip && setShowStartModal(false)}
          title="Start This Trip?"
          maxWidth="520px"
          footer={
            <div className="driver-modal-actions">
              <Button
                variant="outline"
                size="medium"
                disabled={startingTrip}
                onClick={() => setShowStartModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="medium"
                disabled={startingTrip}
                onClick={handleConfirmStartTrip}
              >
                {startingTrip ? 'Starting Trip...' : 'Confirm & Start'}
              </Button>
            </div>
          }
        >
          <div className="driver-start-modal-content">
            <p className="driver-start-modal-msg">
              Are you ready to begin this assigned trip?
            </p>

            <div className="driver-modal-trip-summary">
              <div className="driver-summary-row">
                <span className="driver-summary-key">Trip:</span>
                <span className="driver-summary-val font-bold">#{trip.id}</span>
              </div>
              <div className="driver-summary-row">
                <span className="driver-summary-key">Route:</span>
                <span className="driver-summary-val">
                  {trip.pickup_location || trip.source} → {trip.drop_location || trip.destination}
                </span>
              </div>
              <div className="driver-summary-row">
                <span className="driver-summary-key">Customer:</span>
                <span className="driver-summary-val">{trip.customer_name || 'Customer'}</span>
              </div>
              <div className="driver-summary-row">
                <span className="driver-summary-key">Vehicle:</span>
                <span className="driver-summary-val">
                  {trip.vehicle_registration} ({trip.vehicle_type || 'Car'})
                </span>
              </div>
            </div>

            {modalError && (
              <div className="driver-form-error-banner" style={{ marginTop: '14px' }}>
                {modalError}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
