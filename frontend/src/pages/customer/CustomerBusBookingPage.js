import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBusSchedulesApi, createBookingApi } from '../../api/customer';
import { BusBookingRulesCard } from '../../components/customer/CustomerRulesCards';
import StatusBadge from '../../components/common/StatusBadge';
import { SkeletonCard } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Toast from '../../components/common/Toast';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { NumberInput } from '../../components/forms';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import './CustomerPages.css';

export default function CustomerBusBookingPage() {
  const navigate = useNavigate();

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Booking modal state
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [seatCount, setSeatCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [toast, setToast] = useState(null);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadSchedules();
    const timer = setInterval(() => {
      if (document.hidden) return;
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getBusSchedulesApi();
      const list = Array.isArray(res) ? res : res?.results || [];
      // Filter out CANCELLED or completed schedules if needed, or show them with closed status
      setSchedules(list);
    } catch (err) {
      console.error('Failed to load bus schedules', err);
      setError('Unable to load bus schedules. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getDeadlineInfo = (deadlineStr) => {
    if (!deadlineStr) return { closed: true, text: 'Deadline passed' };
    const deadline = new Date(deadlineStr);
    const diffMs = deadline - currentTime;
    if (diffMs <= 0) {
      return { closed: true, text: 'Deadline passed' };
    }
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours > 24) {
      const days = Math.floor(diffHours / 24);
      return { closed: false, text: `Closes in ${days}d ${diffHours % 24}h` };
    }
    return { closed: false, text: `Closes in ${diffHours}h ${diffMins}m` };
  };

  const handleOpenBooking = (schedule) => {
    setSelectedSchedule(schedule);
    setSeatCount(1);
    setBookingError('');
  };

  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (!selectedSchedule) return;

    setSubmitting(true);
    setBookingError('');

    try {
      const payload = {
        booking_type: 'BUS_SEAT',
        bus_schedule: selectedSchedule.id,
        passengers: parseInt(seatCount, 10),
      };

      const res = await createBookingApi(payload);
      setToast({
        type: 'success',
        message: 'Bus seat booking confirmed! Seat reserved.',
      });
      setSelectedSchedule(null);
      setTimeout(() => {
        navigate(`/customer/bookings/${res.id}`);
      }, 1200);
    } catch (err) {
      console.error('Bus booking failed', err);
      const data = err.response?.data;
      if (typeof data === 'object') {
        const firstErr = Object.values(data)[0];
        setBookingError(Array.isArray(firstErr) ? firstErr[0] : String(firstErr));
      } else {
        setBookingError('Failed to book bus seat. Please check available seats.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="customer-page">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div className="customer-page-header">
        <div>
          <Button
            type="button"
            variant="ghost"
            className="customer-back-link"
            onClick={() => navigate('/customer/book')}
          >
            ← Back to Vehicle Selection
          </Button>
          <h1 className="customer-page-title">Bus Schedules & Booking</h1>
          <p className="customer-page-subtitle">
            Reserve individual seats on scheduled express bus routes
          </p>
        </div>
      </div>

      {/* Rules Notice Card */}
      <BusBookingRulesCard />

      {/* Content */}
      {loading ? (
        <div className="bus-schedules-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadSchedules} />
      ) : schedules.length === 0 ? (
        <EmptyState
          title="No Bus Schedules Available"
          description="There are currently no scheduled bus trips open for booking."
          actionText="Book Private Vehicle"
          onAction={() => navigate('/customer/book')}
        />
      ) : (
        <div className="bus-schedules-grid">
          {schedules.map((schedule) => {
            const deadlineInfo = getDeadlineInfo(schedule.booking_deadline);
            const isClosed =
              deadlineInfo.closed ||
              schedule.available_seats <= 0 ||
              schedule.status === 'CANCELLED' ||
              schedule.status === 'COMPLETED';

            const minPass = schedule.min_passengers || 1;
            const currentPass = schedule.current_passengers || schedule.booked_seats || 0;
            const progressPct = Math.min(100, Math.round((currentPass / minPass) * 100));
            const minReached = currentPass >= minPass;

            return (
              <div key={schedule.id} className="bus-schedule-card">
                <div className="bus-card-top">
                  <div className="bus-route-badge">
                    <span className="bus-icon">🚌</span>
                    <strong>{schedule.source}</strong>
                    <span className="bus-arrow">➔</span>
                    <strong>{schedule.destination}</strong>
                  </div>
                  <StatusBadge status={schedule.status} />
                </div>

                <div className="bus-card-departure">
                  <span className="departure-label">Departure</span>
                  <span className="departure-val">
                    {formatDateTime(schedule.departure_datetime)}
                  </span>
                </div>

                {schedule.vehicle_registration && (
                  <div className="bus-vehicle-reg">
                    <span>Vehicle:</span>
                    <strong>{schedule.vehicle_registration}</strong>
                  </div>
                )}

                {/* Progress Bar for Minimum Passengers */}
                <div className="bus-progress-section">
                  <div className="bus-progress-header">
                    <span>
                      Passenger Target:{' '}
                      <strong>
                        {currentPass} / {minPass} min
                      </strong>
                    </span>
                    <span className={`target-status ${minReached ? 'reached' : 'pending'}`}>
                      {minReached ? '✓ Target Reached' : 'Requires Minimum'}
                    </span>
                  </div>
                  <div className="bus-progress-bar-bg">
                    <div
                      className={`bus-progress-fill ${minReached ? 'filled-green' : 'filled-blue'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="bus-stats-grid">
                  <div className="bus-stat-box">
                    <span className="bus-stat-num">{schedule.available_seats}</span>
                    <span className="bus-stat-lbl">Available Seats</span>
                  </div>
                  <div className="bus-stat-box">
                    <span className="bus-stat-num">{schedule.total_seats}</span>
                    <span className="bus-stat-lbl">Total Capacity</span>
                  </div>
                  <div className="bus-stat-box">
                    <span className="bus-stat-num">{formatCurrency(schedule.fare_per_seat)}</span>
                    <span className="bus-stat-lbl">Per Seat</span>
                  </div>
                </div>

                {/* Countdown & Deadline Warning */}
                <div className="bus-deadline-notice">
                  <div className="deadline-time">
                    ⏱ {deadlineInfo.text}
                  </div>
                  <div className="deadline-rule">
                    * Booking closes strictly 10 hours before departure.
                  </div>
                </div>

                {/* Action button */}
                <Button
                  type="button"
                  variant={isClosed ? 'secondary' : 'primary'}
                  fullWidth
                  disabled={isClosed}
                  onClick={() => handleOpenBooking(schedule)}
                >
                  {isClosed ? 'Booking Closed' : 'Book Bus Seat'}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Book Seat Modal */}
      {selectedSchedule && (
        <Modal
          isOpen={Boolean(selectedSchedule)}
          onClose={() => setSelectedSchedule(null)}
          title="Reserve Bus Seats"
          size="small"
          footer={
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', width: '100%' }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedSchedule(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmBooking}
                loading={submitting}
                disabled={submitting || selectedSchedule.available_seats <= 0}
              >
                Confirm & Reserve
              </Button>
            </div>
          }
        >
          <div className="modal-summary" style={{ marginBottom: '16px' }}>
            <div className="modal-route">
              <strong>{selectedSchedule.source}</strong> ➔{' '}
              <strong>{selectedSchedule.destination}</strong>
            </div>
            <div className="modal-datetime">
              {formatDateTime(selectedSchedule.departure_datetime)}
            </div>
            <div className="modal-fare">
              Fare: {formatCurrency(selectedSchedule.fare_per_seat)} per seat
            </div>
            <div className="modal-avail">
              Available: {selectedSchedule.available_seats} seats remaining
            </div>
          </div>

          {bookingError && (
            <div className="booking-error-alert" style={{ marginBottom: '16px' }}>{bookingError}</div>
          )}

          <form onSubmit={handleConfirmBooking} className="modal-seat-form">
            <NumberInput
              id="modalSeatCount"
              label="Number of Seats"
              required
              min={1}
              max={selectedSchedule.available_seats}
              value={seatCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (val >= 1 && val <= selectedSchedule.available_seats) {
                  setSeatCount(val);
                }
              }}
              hint={`Max ${selectedSchedule.available_seats} seats available`}
            />

            <div className="modal-total-calc" style={{ marginTop: '16px' }}>
              <span>Total Amount:</span>
              <strong className="total-val">
                {formatCurrency(seatCount * Number(selectedSchedule.fare_per_seat))}
              </strong>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
