import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import SearchInput from '../../components/forms/SearchInput';
import { Skeleton } from '../../components/common/Loader';
import {
  ClockIcon,
  VehicleIcon,
  UserIcon,
  CheckIcon,
  BookingIcon,
} from '../../components/common/Icons';
import { getMyTripsApi, getMyTripsSummaryApi, startTripApi } from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatPayableAmount } from '../../utils/formatters';
import './DriverPages.css';

export default function DriverMyTripsPage() {
  const navigate = useNavigate();
  const { success } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active filter tab: 'all' | 'upcoming' | 'in_progress' | 'completed' | 'cancelled'
  const activeTab = searchParams.get('tab') || 'upcoming';
  const searchQueryParam = searchParams.get('search') || '';

  const [trips, setTrips] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    upcoming: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  });
  const [searchTerm, setSearchTerm] = useState(searchQueryParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Confirmation Modal State for Start Trip
  const [startModalTrip, setStartModalTrip] = useState(null);
  const [startingTrip, setStartingTrip] = useState(false);
  const [startModalError, setStartModalError] = useState('');

  // Format today's date nicely: e.g. "Tuesday, 10 Nov 2026"
  const formattedTodayDate = useMemo(() => {
    return new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  const handleTabChange = (tab) => {
    const params = { tab };
    if (searchTerm.trim()) params.search = searchTerm.trim();
    setSearchParams(params);
  };

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    const params = { tab: activeTab };
    if (searchTerm.trim()) params.search = searchTerm.trim();
    setSearchParams(params);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setSearchParams({ tab: activeTab });
  };

  const isExpiredOrPassed = (t) => {
    if (!t) return false;
    if (t.status === 'EXPIRED') return true;
    if (t.status === 'SCHEDULED' && t.scheduled_datetime) {
      return new Date(t.scheduled_datetime) < new Date();
    }
    return false;
  };

  const fetchTripsAndSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tripsData, summaryData] = await Promise.all([
        getMyTripsApi(activeTab, searchTerm),
        getMyTripsSummaryApi().catch(() => null),
      ]);

      const list = Array.isArray(tripsData) ? tripsData : tripsData?.results || [];
      setTrips(list);

      if (summaryData) {
        setSummary({
          total: summaryData.total || 0,
          upcoming: summaryData.upcoming || 0,
          in_progress: summaryData.in_progress || 0,
          completed: summaryData.completed || 0,
          cancelled: summaryData.cancelled || 0,
        });
      } else {
        // Fallback calculation from list
        setSummary({
          total: list.filter((t) => !isExpiredOrPassed(t)).length,
          upcoming: list.filter((t) => t.status === 'SCHEDULED' && !isExpiredOrPassed(t)).length,
          in_progress: list.filter((t) => t.status === 'IN_PROGRESS').length,
          completed: list.filter((t) => t.status === 'COMPLETED').length,
          cancelled: list.filter((t) => t.status === 'CANCELLED').length,
        });
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchTerm]);

  useEffect(() => {
    fetchTripsAndSummary();
  }, [fetchTripsAndSummary]);

  // Client-side instant filter to ensure instant responsiveness as user types
  const filteredTrips = useMemo(() => {
    let list = trips;
    if (activeTab === 'upcoming') {
      list = list.filter((t) => t.status === 'SCHEDULED' && !isExpiredOrPassed(t));
    } else if (activeTab !== 'history') {
      list = list.filter((t) => !isExpiredOrPassed(t));
    }
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    const cleanDigits = term.replace(/^#/, '');
    return list.filter((trip) => {
      const idMatch = String(trip.id) === cleanDigits;
      const bookingMatch = trip.booking_id && String(trip.booking_id).includes(cleanDigits);
      const customerMatch = trip.customer_name && trip.customer_name.toLowerCase().includes(term);
      const vehicleMatch = trip.vehicle_registration && trip.vehicle_registration.toLowerCase().includes(term);
      const sourceMatch = (trip.source || trip.pickup_location || '').toLowerCase().includes(term);
      const destMatch = (trip.destination || trip.drop_location || '').toLowerCase().includes(term);
      return idMatch || bookingMatch || customerMatch || vehicleMatch || sourceMatch || destMatch;
    });
  }, [trips, searchTerm, activeTab]);

  const formatTripDateOnly = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString([], {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTripTimeOnly = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Open Start Trip Confirmation Modal
  const openStartModal = (trip) => {
    setStartModalTrip(trip);
    setStartModalError('');
  };

  const closeStartModal = () => {
    if (startingTrip) return;
    setStartModalTrip(null);
    setStartModalError('');
  };

  const handleConfirmStartTrip = async () => {
    if (!startModalTrip) return;
    setStartModalError('');
    setStartingTrip(true);
    try {
      await startTripApi(startModalTrip.id);
      success(`Trip #${startModalTrip.id} started successfully!`);
      closeStartModal();
      navigate(`/driver/trips/${startModalTrip.id}`);
    } catch (err) {
      const resp = err.response?.data;
      if (resp?.message) {
        setStartModalError(resp.message);
      } else if (resp?.detail) {
        setStartModalError(resp.detail);
      } else {
        setStartModalError(getApiErrorMessage(err));
      }
    } finally {
      setStartingTrip(false);
    }
  };

  return (
    <div className="driver-page driver-my-trips-page fade-in">
      {/* 1. Page Header */}
      <div className="driver-trips-header-block">
        <div className="driver-trips-header-left">
          <h1 className="driver-trips-main-title">My Trips</h1>
          <p className="driver-trips-subtitle">Manage your assigned trips from start to completion.</p>
        </div>
        <div className="driver-trips-header-right">
          <div className="driver-current-date-badge">
            <ClockIcon size={15} />
            <span>{formattedTodayDate}</span>
          </div>
        </div>
      </div>

      {/* 2. Summary Cards */}
      <div className="driver-summary-cards-grid">
        <div className="driver-summary-card total">
          <div className="driver-summary-icon-wrap total">
            <BookingIcon size={22} />
          </div>
          <div className="driver-summary-content">
            <span className="driver-summary-number">{summary.total}</span>
            <span className="driver-summary-label">Total Assigned Trips</span>
          </div>
        </div>

        <div className="driver-summary-card upcoming">
          <div className="driver-summary-icon-wrap upcoming">
            <ClockIcon size={22} />
          </div>
          <div className="driver-summary-content">
            <span className="driver-summary-number">{summary.upcoming}</span>
            <span className="driver-summary-label">Upcoming Trips</span>
          </div>
        </div>

        <div className="driver-summary-card in-progress">
          <div className="driver-summary-icon-wrap in-progress">
            <span className="driver-live-dot" />
            <VehicleIcon size={22} />
          </div>
          <div className="driver-summary-content">
            <span className="driver-summary-number">{summary.in_progress}</span>
            <span className="driver-summary-label">In Progress</span>
          </div>
        </div>

        <div className="driver-summary-card completed">
          <div className="driver-summary-icon-wrap completed">
            <CheckIcon size={22} />
          </div>
          <div className="driver-summary-content">
            <span className="driver-summary-number">{summary.completed}</span>
            <span className="driver-summary-label">Completed Trips</span>
          </div>
        </div>
      </div>

      {/* 3. Search Bar & Trip Filters */}
      <div className="driver-controls-panel">
        <div className="driver-filter-tabs">
          <Button
            type="button"
            variant={activeTab === 'all' ? 'primary' : 'ghost'}
            size="small"
            className={`driver-filter-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => handleTabChange('all')}
          >
            All Trips
            <span className="driver-tab-count">{summary.total}</span>
          </Button>
          <Button
            type="button"
            variant={activeTab === 'upcoming' ? 'primary' : 'ghost'}
            size="small"
            className={`driver-filter-tab ${activeTab === 'upcoming' ? 'active' : ''}`}
            onClick={() => handleTabChange('upcoming')}
          >
            Upcoming
            <span className="driver-tab-count">{summary.upcoming}</span>
          </Button>
          <Button
            type="button"
            variant={activeTab === 'in_progress' ? 'primary' : 'ghost'}
            size="small"
            className={`driver-filter-tab in-progress ${activeTab === 'in_progress' ? 'active' : ''}`}
            onClick={() => handleTabChange('in_progress')}
          >
            In Progress
            <span className="driver-tab-count active-count">{summary.in_progress}</span>
          </Button>
          <Button
            type="button"
            variant={activeTab === 'completed' ? 'primary' : 'ghost'}
            size="small"
            className={`driver-filter-tab ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => handleTabChange('completed')}
          >
            Completed
            <span className="driver-tab-count">{summary.completed}</span>
          </Button>
          <Button
            type="button"
            variant={activeTab === 'cancelled' ? 'primary' : 'ghost'}
            size="small"
            className={`driver-filter-tab ${activeTab === 'cancelled' ? 'active' : ''}`}
            onClick={() => handleTabChange('cancelled')}
          >
            Cancelled
            <span className="driver-tab-count">{summary.cancelled}</span>
          </Button>
        </div>

        <div className="driver-search-wrapper" style={{ minWidth: '320px' }}>
          <SearchInput
            placeholder="Search by Trip ID, Booking ID, customer name, vehicle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onSearch={(val) => {
              setSearchTerm(val);
              handleSearchSubmit();
            }}
            onClear={handleClearSearch}
          />
        </div>
      </div>

      {/* 4. Trips Cards List */}
      <div className="driver-trips-cards-container">
        {loading ? (
          <div className="driver-trips-skeletons">
            {[1, 2, 3].map((n) => (
              <Card key={n} className="driver-trip-card">
                <Skeleton height="28px" width="55%" />
                <div style={{ marginTop: '12px' }}>
                  <Skeleton height="18px" width="80%" />
                </div>
                <div style={{ marginTop: '8px' }}>
                  <Skeleton height="16px" width="40%" />
                </div>
                <div style={{ marginTop: '16px' }}>
                  <Skeleton height="38px" borderRadius="8px" />
                </div>
              </Card>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchTripsAndSummary} />
        ) : filteredTrips.length === 0 ? (
          <EmptyState
            title={searchTerm ? 'No matching trips found' : 'No trips in this view'}
            description={
              searchTerm
                ? `No trips match "${searchTerm}". Try adjusting your search query.`
                : activeTab === 'upcoming'
                ? 'You do not have any upcoming assigned trips right now.'
                : activeTab === 'in_progress'
                ? 'No trip is currently in progress.'
                : activeTab === 'completed'
                ? 'You have not completed any trips yet.'
                : 'No trips assigned to your driver account.'
            }
          />
        ) : (
          filteredTrips.map((trip) => {
            const isInProgress = trip.status === 'IN_PROGRESS';
            const isScheduled = trip.status === 'SCHEDULED';
            const isCompleted = trip.status === 'COMPLETED';
            const isCancelled = trip.status === 'CANCELLED';

            return (
              <Card
                key={trip.id}
                className={`driver-trip-card ${isInProgress ? 'is-active-trip' : ''}`}
              >
                {/* Card Header */}
                <div className="driver-card-header-row">
                  <div className="driver-card-id-group">
                    <span className="driver-trip-id-pill">Trip #{trip.id}</span>
                    {trip.booking_id ? (
                      <span className="driver-booking-id-pill">Booking #{trip.booking_id}</span>
                    ) : trip.bus_schedule ? (
                      <span className="driver-booking-id-pill bus">Bus Schedule</span>
                    ) : (
                      <span className="driver-booking-id-pill direct">Direct Dispatch</span>
                    )}
                  </div>

                  <div className="driver-card-status-group">
                    {isInProgress && (
                      <span className="driver-active-badge">
                        <span className="driver-live-dot" />
                        In Progress
                      </span>
                    )}
                    {isScheduled && <Badge status="SCHEDULED" />}
                    {isCompleted && <Badge status="COMPLETED" />}
                    {isCancelled && <Badge status="CANCELLED" />}

                    {/* Payment Status Badge */}
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

                {/* Route Section */}
                <div className="driver-card-route-section">
                  <div className="driver-route-stop origin">
                    <span className="driver-route-marker start" />
                    <div className="driver-route-info">
                      <span className="driver-route-label">PICKUP</span>
                      <span className="driver-route-address">
                        {trip.pickup_location || trip.source || 'Pickup point'}
                      </span>
                    </div>
                  </div>

                  <div className="driver-route-connector" />

                  <div className="driver-route-stop destination">
                    <span className="driver-route-marker end" />
                    <div className="driver-route-info">
                      <span className="driver-route-label">DROP-OFF</span>
                      <span className="driver-route-address">
                        {trip.drop_location || trip.destination || 'Destination point'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Trip Details Grid */}
                <div className="driver-card-details-grid">
                  <div className="driver-detail-item">
                    <span className="driver-detail-title">Customer</span>
                    <span className="driver-detail-val primary">
                      <UserIcon size={14} />
                      {trip.customer_name || 'Customer'}
                    </span>
                  </div>

                  <div className="driver-detail-item">
                    <span className="driver-detail-title">Customer Phone</span>
                    <span className="driver-detail-val">
                      {trip.customer_phone && trip.customer_phone !== 'N/A'
                        ? trip.customer_phone
                        : 'Available on assignment'}
                    </span>
                  </div>

                  <div className="driver-detail-item">
                    <span className="driver-detail-title">Vehicle</span>
                    <span className="driver-detail-val primary">
                      <VehicleIcon size={14} />
                      {trip.vehicle_registration || 'Vehicle'}
                    </span>
                  </div>

                  <div className="driver-detail-item">
                    <span className="driver-detail-title">Vehicle Type</span>
                    <span className="driver-detail-val">
                      {trip.vehicle_type || 'Car'}
                      {trip.vehicle_brand_model ? ` • ${trip.vehicle_brand_model}` : ''}
                    </span>
                  </div>

                  <div className="driver-detail-item">
                    <span className="driver-detail-title">Scheduled Date</span>
                    <span className="driver-detail-val">
                      {formatTripDateOnly(trip.scheduled_datetime)}
                      {isScheduled && trip.start_date_label && (
                        <span
                          className={`driver-date-chip ${
                            trip.start_date_status === 'TODAY'
                              ? 'today'
                              : trip.start_date_status === 'PASSED'
                              ? 'passed'
                              : 'future'
                          }`}
                        >
                          {trip.start_date_label}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="driver-detail-item">
                    <span className="driver-detail-title">Scheduled Time</span>
                    <span className="driver-detail-val">
                      <ClockIcon size={13} />
                      {formatTripTimeOnly(trip.scheduled_datetime)}
                    </span>
                  </div>

                  <div className="driver-detail-item">
                    <span className="driver-detail-title">Passengers</span>
                    <span className="driver-detail-val">
                      {trip.passengers || 1} {Number(trip.passengers) === 1 ? 'Passenger' : 'Passengers'}
                    </span>
                  </div>

                  <div className="driver-detail-item">
                    <span className="driver-detail-title">Booking Amount</span>
                    <span className="driver-detail-val fare">
                      {formatPayableAmount(trip.booking_amount || trip.total_fare, {
                        paymentStatus: trip.payment_status,
                        tripStatus: trip.trip_status || trip.status,
                      })}
                    </span>
                  </div>
                </div>

                {/* Card Actions Row */}
                <div className="driver-card-actions-row">
                  {/* Stage 2: Ready to Start */}
                  {isScheduled && (
                    <>
                      <Button
                        variant="primary"
                        size="medium"
                        disabled={!trip.can_start}
                        title={
                          !trip.can_start
                            ? trip.start_date_status === 'PASSED'
                              ? 'The trip date has passed'
                              : `Starts on ${trip.scheduled_date_formatted || 'scheduled day'}`
                            : 'Start this trip'
                        }
                        onClick={() => openStartModal(trip)}
                        className="driver-action-btn start-trip-btn"
                      >
                        {trip.can_start
                          ? 'Start Trip'
                          : trip.start_date_status === 'PASSED'
                          ? 'Date Passed'
                          : `Starts ${trip.scheduled_date_formatted || 'Later'}`}
                      </Button>

                      <Button
                        variant="outline"
                        size="medium"
                        onClick={() => navigate(`/driver/trips/${trip.id}`)}
                        className="driver-action-btn"
                      >
                        View Details
                      </Button>
                    </>
                  )}

                  {/* Stage 3: Trip In Progress */}
                  {isInProgress && (
                    <>
                      <Button
                        variant="primary"
                        size="medium"
                        onClick={() => navigate(`/driver/trips/${trip.id}/complete`)}
                        className="driver-action-btn complete-trip-btn"
                      >
                        Complete Trip
                      </Button>

                      <Button
                        variant="outline"
                        size="medium"
                        onClick={() => navigate(`/driver/trips/${trip.id}`)}
                        className="driver-action-btn"
                      >
                        View Details
                      </Button>
                    </>
                  )}

                  {/* Stage 4/5: Completed Trip */}
                  {isCompleted && (
                    <>
                      <Button
                        variant="outline"
                        size="medium"
                        onClick={() => navigate(`/driver/trips/${trip.id}`)}
                        className="driver-action-btn"
                      >
                        View Details
                      </Button>

                      {trip.unpaid_payment_id ? (
                        <Button
                          variant="primary"
                          size="medium"
                          onClick={() => navigate(`/driver/trips/${trip.id}/complete`)}
                          className="driver-action-btn collect-payment-btn"
                        >
                          Collect Payment
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="medium"
                          onClick={() => navigate(`/driver/trips/${trip.id}`)}
                          className="driver-action-btn receipt-btn"
                        >
                          View Receipt
                        </Button>
                      )}
                    </>
                  )}

                  {/* Cancelled Trip */}
                  {isCancelled && (
                    <Button
                      variant="outline"
                      size="medium"
                      onClick={() => navigate(`/driver/trips/${trip.id}`)}
                      className="driver-action-btn"
                    >
                      View Details
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* 5. Start This Trip Confirmation Modal */}
      {startModalTrip && (
        <Modal
          isOpen={true}
          onClose={closeStartModal}
          title="Start This Trip?"
          maxWidth="520px"
          footer={
            <div className="driver-modal-actions">
              <Button
                variant="outline"
                size="medium"
                disabled={startingTrip}
                onClick={closeStartModal}
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
                <span className="driver-summary-val font-bold">#{startModalTrip.id}</span>
              </div>
              <div className="driver-summary-row">
                <span className="driver-summary-key">Route:</span>
                <span className="driver-summary-val">
                  {startModalTrip.pickup_location || startModalTrip.source} →{' '}
                  {startModalTrip.drop_location || startModalTrip.destination}
                </span>
              </div>
              <div className="driver-summary-row">
                <span className="driver-summary-key">Customer:</span>
                <span className="driver-summary-val">{startModalTrip.customer_name || 'Customer'}</span>
              </div>
              <div className="driver-summary-row">
                <span className="driver-summary-key">Vehicle:</span>
                <span className="driver-summary-val">
                  {startModalTrip.vehicle_registration} ({startModalTrip.vehicle_type || 'Car'})
                </span>
              </div>
            </div>

            {startModalError && (
              <div className="driver-form-error-banner" style={{ marginTop: '14px' }}>
                {startModalError}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
