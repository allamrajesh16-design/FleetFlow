import DashboardHeaderStrip from "../../components/common/DashboardHeaderStrip";
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import { SkeletonCard } from '../../components/common/Skeleton';
import ErrorState from '../../components/common/ErrorState';
import {
  BookingIcon,
  TripIcon,
  PaymentIcon,
  ClockIcon,
} from '../../components/common/Icons';
import { TicketCard } from '../../components/common/SignatureDesign';
import { useAuth } from '../../context/AuthContext';
import {
  getCustomerDashboardApi,
  getMyBookingsApi,
  getPaymentHistoryApi,
} from '../../api/customer';
import { getApiErrorMessage } from '../../api/client';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import './CustomerPages.css';

export default function CustomerDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState(null);
  const [unpaidPayment, setUnpaidPayment] = useState(null);
  const [cancelledBusBooking, setCancelledBusBooking] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, bookingsRes, paymentsRes] = await Promise.all([
        getCustomerDashboardApi(),
        getMyBookingsApi().catch(() => ({ results: [] })),
        getPaymentHistoryApi().catch(() => ({ results: [] })),
      ]);

      setDashboardData(dashRes);

      // Check for an unpaid payment
      const pList = Array.isArray(paymentsRes) ? paymentsRes : paymentsRes.results || [];
      const pendingPmt = pList.find(
        (p) => p.status === 'UNPAID' || p.status === 'PAYMENT_INITIATED'
      );
      setUnpaidPayment(pendingPmt || null);

      // Check if any bus booking was cancelled because minimum passengers were not reached
      const bList = Array.isArray(bookingsRes) ? bookingsRes : bookingsRes.results || [];
      const cancelledBus = bList.find(
        (b) =>
          b.booking_type === 'BUS_SEAT' &&
          b.status === 'CANCELLED' &&
          b.refund_status === 'REFUND_PENDING' &&
          !b.bus_option_choice
      );
      setCancelledBusBooking(cancelledBus || null);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const firstName = user?.full_name?.split(' ')[0] || user?.name || 'Customer';

  return (
    <div className="customer-page">
      {/* 1. Welcome Card with 4 Quick Action Tiles */}
      <DashboardHeaderStrip role="customer" title="Customer Portal" defaultSubtitle="Bookings, live tracking, and digital payments" />
      <div className="customer-greeting-card">
        <div>
          <h1 className="customer-greeting-title">Welcome, {firstName}</h1>
          <p className="customer-greeting-subtitle">
            Book your next ride, manage reservations, and track active trips in real time
          </p>
        </div>

        <div className="customer-quick-tiles">
          <div
            className="quick-action-tile"
            onClick={() => navigate('/customer/book')}
          >
            <div className="tile-icon">🚗</div>
            <div className="tile-info">
              <span className="tile-label">Book Vehicle</span>
              <span className="tile-desc">Car, Bike or Bus</span>
            </div>
          </div>

          <div
            className="quick-action-tile"
            onClick={() => navigate('/customer/bookings')}
          >
            <div className="tile-icon">📋</div>
            <div className="tile-info">
              <span className="tile-label">My Bookings</span>
              <span className="tile-desc">All past & upcoming</span>
            </div>
          </div>

          <div
            className="quick-action-tile"
            onClick={() => navigate('/customer/bookings')}
          >
            <div className="tile-icon">📍</div>
            <div className="tile-info">
              <span className="tile-label">Trip Tracking</span>
              <span className="tile-desc">Live GPS updates</span>
            </div>
          </div>

          <div
            className="quick-action-tile"
            onClick={() => navigate('/customer/payments')}
          >
            <div className="tile-icon">💳</div>
            <div className="tile-info">
              <span className="tile-label">Payments</span>
              <span className="tile-desc">Receipts & pay</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchDashboard} />
      ) : (
        <>
          {/* Action Alerts */}
          {/* Orange alert if payment is pending */}
          {unpaidPayment && (
            <div className="dashboard-alert-banner banner-warning">
              <div className="banner-left">
                <span className="banner-icon">⚠️</span>
                <div>
                  <div className="banner-title">
                    Payment pending {formatCurrency(unpaidPayment.amount)}
                  </div>
                  <div className="banner-desc">
                    Trip from {unpaidPayment.trip_source || 'Pickup'} to{' '}
                    {unpaidPayment.trip_destination || 'Drop'} has completed. Please complete payment.
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="primary"
                className="btn-banner-action"
                onClick={() => navigate(`/customer/payments/${unpaidPayment.id}/pay`)}
              >
                Pay Now
              </Button>
            </div>
          )}

          {/* Red alert if bus booking was cancelled */}
          {cancelledBusBooking && (
            <div className="dashboard-alert-banner banner-danger">
              <div className="banner-left">
                <span className="banner-icon">🚌</span>
                <div>
                  <div className="banner-title">
                    Your bus trip was cancelled. Choose an option
                  </div>
                  <div className="banner-desc">
                    Minimum passenger requirement was not reached for Booking #{cancelledBusBooking.id}.
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="danger"
                className="btn-banner-action"
                onClick={() => navigate(`/customer/bookings/${cancelledBusBooking.id}`)}
              >
                Choose Option
              </Button>
            </div>
          )}

          {/* Stat Cards */}
          <div className="customer-stats-grid">
            <div className="customer-stat-card">
              <div className="stat-icon-wrapper stat-icon-blue">
                <BookingIcon size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-value">{dashboardData?.total_bookings ?? 0}</span>
                <span className="stat-label">Total Bookings</span>
                <span className="stat-subtext">Lifetime requests</span>
              </div>
            </div>

            <div className="customer-stat-card">
              <div className="stat-icon-wrapper stat-icon-emerald">
                <TripIcon size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-value">{dashboardData?.upcoming_trips ?? 0}</span>
                <span className="stat-label">Upcoming Trips</span>
                <span className="stat-subtext">Scheduled & in-progress</span>
              </div>
            </div>

            <div className="customer-stat-card">
              <div className="stat-icon-wrapper stat-icon-amber">
                <PaymentIcon size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-value">
                  {formatCurrency(dashboardData?.pending_payments?.total_amount || 0)}
                </span>
                <span className="stat-label">Pending Payments</span>
                <span className="stat-subtext">
                  {dashboardData?.pending_payments?.count || 0} unpaid invoices
                </span>
              </div>
            </div>
          </div>

          {/* Recent Bookings List Card */}
          <div className="booking-main-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 className="card-section-title" style={{ margin: 0 }}>Recent Bookings</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="btn-view-booking"
                onClick={() => navigate('/customer/bookings')}
              >
                View All →
              </Button>
            </div>

            {dashboardData?.recent_bookings?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                <p>No recent bookings found. Start by booking a vehicle!</p>
                <Button
                  type="button"
                  variant="primary"
                  className="btn-primary"
                  onClick={() => navigate('/customer/book')}
                >
                  Book a Vehicle
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {dashboardData?.recent_bookings?.map((b) => (
                  <TicketCard
                    key={b.id}
                    bookingId={`BKG-${String(b.id).padStart(4, '0')}`}
                    source={b.pickup_location || 'Pickup'}
                    destination={b.drop_location || 'Dropoff'}
                    travelDate={formatDateTime(b.travel_datetime || b.created_at)}
                    passengerCount={b.passengers || 1}
                    vehicleType={b.vehicle_type || (b.booking_type === 'BUS_SEAT' ? 'BUS' : 'CAR')}
                    fare={b.estimated_fare}
                    status={b.status}
                    actions={
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/customer/bookings/${b.id}`)}
                      >
                        View Pass Details →
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
