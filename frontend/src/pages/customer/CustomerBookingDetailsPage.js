import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getBookingDetailsApi,
  getBookingTrackingApi,
  cancelBookingApi,
  respondToBusOptionApi,
} from '../../api/customer';
import StatusBadge from '../../components/common/StatusBadge';
import { SkeletonCard } from '../../components/common/Skeleton';
import ErrorState from '../../components/common/ErrorState';
import Toast from '../../components/common/Toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { Textarea } from '../../components/forms';
import { formatDateTime, formatCurrency, formatPayableAmount } from '../../utils/formatters';
import './CustomerPages.css';

export default function CustomerBookingDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Cancel dialog
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Bus response modal/action
  const [respondingBus, setRespondingBus] = useState(false);
  const [confirmBusChoice, setConfirmBusChoice] = useState(null); // 'ALTERNATIVE_VEHICLE' | 'CANCEL' | 'REFUND'

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const bookingData = await getBookingDetailsApi(id);
      setBooking(bookingData);

      // Attempt to load tracking info for timeline steps
      try {
        const trackingData = await getBookingTrackingApi(id);
        setTracking(trackingData);
      } catch (trackErr) {
        // Tracking might be 403/404 if not available yet
        setTracking(null);
      }
    } catch (err) {
      console.error('Failed to load booking details', err);
      if (err.response?.status === 403 || err.response?.status === 404) {
        setError('You are not authorized to view this booking or it does not exist.');
      } else {
        setError('Unable to load booking details. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCancelBooking = async (e) => {
    e.preventDefault();
    setCancelling(true);
    try {
      const res = await cancelBookingApi(id, cancelReason || 'Cancelled by customer');
      setBooking(res);
      setShowCancelModal(false);
      setToast({
        type: 'success',
        message: 'Booking cancelled successfully.',
      });
      loadData();
    } catch (err) {
      console.error('Cancellation failed', err);
      const msg = err.response?.data?.detail || 'Failed to cancel booking.';
      setToast({ type: 'error', message: msg });
    } finally {
      setCancelling(false);
    }
  };

  const handleBusResponse = async (choice) => {
    setRespondingBus(true);
    try {
      const res = await respondToBusOptionApi(id, choice);
      setBooking(res);
      setConfirmBusChoice(null);
      setToast({
        type: 'success',
        message: `Your option preference (${choice.replace('_', ' ')}) has been saved.`,
      });
      loadData();
    } catch (err) {
      console.error('Bus response failed', err);
      const msg = err.response?.data?.detail || 'Failed to submit response choice.';
      setToast({ type: 'error', message: msg });
    } finally {
      setRespondingBus(false);
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
        <ErrorState message={error} onRetry={loadData} />
      </div>
    );
  }

  if (!booking) return null;

  const isBus = booking.booking_type === 'BUS_SEAT';
  const pickup = isBus ? (booking.bus_schedule_detail?.source || booking.pickup_location || '-') : (booking.pickup_location || '-');
  const drop = isBus ? (booking.bus_schedule_detail?.destination || booking.drop_location || '-') : (booking.drop_location || '-');
  const travelDate = isBus
    ? booking.bus_schedule_detail?.departure_datetime || booking.travel_datetime
    : booking.travel_datetime;

  const travelTimeObj = new Date(travelDate);
  const now = new Date();
  const canCancel =
    travelTimeObj > now &&
    ['PENDING', 'APPROVED', 'ASSIGNED'].includes(booking.status);

  // Timeline step active logic
  const currentStep = tracking?.step || (
    booking.status === 'COMPLETED'
      ? 'COMPLETED'
      : booking.status === 'IN_PROGRESS'
      ? 'IN_PROGRESS'
      : booking.status === 'ASSIGNED'
      ? 'ASSIGNED'
      : ['APPROVED', 'PENDING'].includes(booking.status)
      ? 'BOOKED'
      : 'BOOKED'
  );

  const stepsList = [
    { key: 'BOOKED', label: 'Booked' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'ASSIGNED', label: 'Assigned' },
    { key: 'IN_PROGRESS', label: 'In Progress' },
    { key: 'COMPLETED', label: 'Completed' },
  ];

  const getStepIndex = (st) => {
    switch (st) {
      case 'BOOKED':
        return 0;
      case 'APPROVED':
        return 1;
      case 'ASSIGNED':
        return 2;
      case 'IN_PROGRESS':
        return 3;
      case 'COMPLETED':
        return 4;
      default:
        return 0;
    }
  };

  const activeIndex = getStepIndex(currentStep);

  // Bus cancellation option card condition
  const showBusOptions =
    isBus &&
    booking.status === 'CANCELLED' &&
    (booking.refund_status === 'REFUND_PENDING' || !booking.bus_option_choice);

  return (
    <div className="customer-page">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Top Header */}
      <div className="customer-page-header">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() => navigate('/customer/bookings')}
            style={{ marginBottom: '8px' }}
          >
            ← Back to My Bookings
          </Button>
          <div className="booking-title-row">
            <h1 className="customer-page-title">Booking #{String(booking.id)}</h1>
            <StatusBadge status={booking.status} />
          </div>
        </div>

        <div className="booking-actions-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {booking.status === 'IN_PROGRESS' && (
            <Button
              type="button"
              variant="primary"
              size="medium"
              onClick={() => navigate(`/customer/bookings/${booking.id}/track`)}
            >
              📍 Track Trip Live
            </Button>
          )}

          {booking.payment_id && booking.payment_status === 'UNPAID' && (
            <Button
              type="button"
              variant="success"
              size="medium"
              onClick={() => navigate(`/customer/payments/${booking.payment_id}/pay`)}
            >
              💳 Pay Now
            </Button>
          )}

          {canCancel && (
            <Button
              type="button"
              variant="danger"
              size="medium"
              onClick={() => setShowCancelModal(true)}
            >
              Cancel Booking
            </Button>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      {booking.status !== 'CANCELLED' && booking.status !== 'REJECTED' && (
        <div className="booking-timeline-card">
          <h3 className="timeline-title">Trip Progression</h3>
          <div className="timeline-steps-track">
            {stepsList.map((st, idx) => {
              const isPassed = idx <= activeIndex;
              const isCurrent = idx === activeIndex;
              return (
                <div
                  key={st.key}
                  className={`timeline-step-item ${isPassed ? 'passed' : ''} ${
                    isCurrent ? 'current' : ''
                  }`}
                >
                  <div className="step-node">
                    {isPassed ? '✓' : idx + 1}
                  </div>
                  <div className="step-label">{st.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cancellation / Rejection Alerts */}
      {booking.status === 'CANCELLED' && (
        <div className="booking-alert-box alert-cancelled">
          <strong>Booking Cancelled:</strong> {booking.cancel_reason || 'This booking has been cancelled.'}
        </div>
      )}

      {booking.status === 'REJECTED' && (
        <div className="booking-alert-box alert-rejected">
          <strong>Booking Rejected:</strong> {booking.rejection_reason || 'This booking was rejected.'}
        </div>
      )}

      {/* Bus Option Choices Card (If cancelled due to minimum passengers) */}
      {showBusOptions && (
        <div className="bus-response-card">
          <div className="bus-response-header">
            <h3>⚠️ Bus Schedule Notice</h3>
            <p>
              Your scheduled bus was cancelled because the passenger threshold was not reached.
              Please select one of the following alternatives:
            </p>
          </div>

          {booking.bus_option_choice ? (
            <div className="bus-response-selected">
              <span>You selected:</span>
              <strong>{booking.bus_option_choice.replace('_', ' ')}</strong>
            </div>
          ) : (
            <div className="bus-response-options" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="secondary"
                size="medium"
                onClick={() => setConfirmBusChoice('ALTERNATIVE_VEHICLE')}
                disabled={respondingBus}
              >
                🚗 Take an Alternative Vehicle
              </Button>
              <Button
                type="button"
                variant="danger"
                size="medium"
                onClick={() => setConfirmBusChoice('CANCEL')}
                disabled={respondingBus}
              >
                ✕ Cancel Trip
              </Button>
              <Button
                type="button"
                variant="primary"
                size="medium"
                onClick={() => setConfirmBusChoice('REFUND')}
                disabled={respondingBus}
              >
                💰 Request Full Refund
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Booking Details Card */}
      <div className="booking-details-grid">
        <div className="booking-main-card">
          <h2 className="card-section-title">Trip Information</h2>

          <div className="details-table-grid">
            <div className="detail-item">
              <span className="detail-lbl">Booking Type</span>
              <span className="detail-val">
                {isBus ? 'Bus Seat Reservation' : `${booking.vehicle_type || 'Vehicle'} Hire`}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-lbl">Scheduled Date & Time</span>
              <span className="detail-val">{formatDateTime(travelDate)}</span>
            </div>

            <div className="detail-item">
              <span className="detail-lbl">Pickup Location</span>
              <span className="detail-val">{pickup || '—'}</span>
            </div>

            <div className="detail-item">
              <span className="detail-lbl">Dropoff Location</span>
              <span className="detail-val">{drop || '—'}</span>
            </div>

            <div className="detail-item">
              <span className="detail-lbl">
                {isBus ? 'Seats Booked' : 'Passengers'}
              </span>
              <span className="detail-val">{booking.passengers || 1}</span>
            </div>

            {booking.vehicle_registration && (
              <div className="detail-item">
                <span className="detail-lbl">Assigned Vehicle</span>
                <span className="detail-val">{booking.vehicle_registration}</span>
              </div>
            )}

            {booking.estimated_distance_km && (
              <div className="detail-item">
                <span className="detail-lbl">Estimated Distance</span>
                <span className="detail-val">{booking.estimated_distance_km} km</span>
              </div>
            )}
          </div>
        </div>

        {/* Fare and Payment Summary */}
        <div className="booking-side-card">
          <h2 className="card-section-title">Fare & Payment</h2>

          <div className="fare-summary-box">
            <div className="fare-row">
              <span>Estimated Fare</span>
              <strong>
                {booking.estimated_fare ? formatCurrency(booking.estimated_fare) : '—'}
              </strong>
            </div>

            {booking.final_fare && (
              <div className="fare-row final-fare">
                <span>Final Fare</span>
                <strong>{formatPayableAmount(booking.final_fare, { paymentStatus: booking.payment_status })}</strong>
              </div>
            )}

            <div className="fare-note">
              * Final fare is calculated upon trip completion.
            </div>

            <div className="payment-status-row">
              <span>Payment Status:</span>
              <StatusBadge status={booking.payment_status || 'UNPAID'} />
            </div>

            {booking.payment_id && booking.payment_status === 'UNPAID' && (
              <div style={{ marginTop: '16px' }}>
                <Button
                  type="button"
                  variant="success"
                  size="large"
                  fullWidth
                  onClick={() => navigate(`/customer/payments/${booking.payment_id}/pay`)}
                >
                  Proceed to Pay
                </Button>
              </div>
            )}

            {booking.payment_id && booking.payment_status === 'PAID' && (
              <div style={{ marginTop: '16px' }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="large"
                  fullWidth
                  onClick={() => navigate(`/customer/payments/${booking.payment_id}/receipt`)}
                >
                  View Payment Receipt
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Bus Choice Dialog */}
      {confirmBusChoice && (
        <Modal
          isOpen={Boolean(confirmBusChoice)}
          onClose={() => setConfirmBusChoice(null)}
          title="Confirm Option"
          size="small"
          footer={
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
              <Button
                type="button"
                variant="outline"
                size="medium"
                onClick={() => setConfirmBusChoice(null)}
                disabled={respondingBus}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                size="medium"
                onClick={() => handleBusResponse(confirmBusChoice)}
                loading={respondingBus}
                disabled={respondingBus}
              >
                Yes, Confirm Choice
              </Button>
            </div>
          }
        >
          <p style={{ margin: '8px 0' }}>
            Are you sure you want to select{' '}
            <strong>"{confirmBusChoice.replace('_', ' ')}"</strong> for this cancelled bus booking?
          </p>
        </Modal>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <Modal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          title="Cancel Booking"
          size="small"
          footer={
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
              <Button
                type="button"
                variant="outline"
                size="medium"
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
              >
                Keep Booking
              </Button>
              <Button
                type="button"
                variant="danger"
                size="medium"
                onClick={handleCancelBooking}
                loading={cancelling}
                disabled={cancelling}
              >
                Confirm Cancellation
              </Button>
            </div>
          }
        >
          <p style={{ margin: '0 0 16px 0' }}>
            Are you sure you want to cancel this booking? This action cannot be reversed.
          </p>
          <Textarea
            id="cancelReasonInput"
            label="Cancellation Reason (Optional)"
            rows={3}
            placeholder="Let us know why you need to cancel..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </Modal>
      )}
    </div>
  );
}
