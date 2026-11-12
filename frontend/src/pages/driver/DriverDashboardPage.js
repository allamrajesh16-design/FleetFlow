import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardHeaderStrip from '../../components/common/DashboardHeaderStrip';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Loader';
import {
  CheckIcon,
  ClockIcon,
  WarningIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  FuelIcon,
  ReceiptIcon,
  BellIcon,
} from '../../components/common/Icons';
import { RouteLine, VehiclePlate, ExpiryRing } from '../../components/common/SignatureDesign';
import { useAuth } from '../../context/AuthContext';
import {
  getDriverDashboardApi,
  getDriverMeApi,
  getTripHistoryApi,
} from '../../api/driver';
import { listDocumentsApi } from '../../api/documents';
import { listFuelLogsApi } from '../../api/fuel';
import { listExpensesApi } from '../../api/expenses';
import { getNotificationsApi } from '../../api/notifications';
import { getApiErrorMessage } from '../../api/client';
import { formatRupees, formatDate, formatDateTime, formatPayableAmount } from '../../utils/formatters';
import './DriverPages.css';

export default function DriverDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [recentFuel, setRecentFuel] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [
        dashRes,
        meRes,
        historyRes,
        docsRes,
        fuelRes,
        expensesRes,
        notifRes,
      ] = await Promise.all([
        getDriverDashboardApi(),
        getDriverMeApi().catch(() => null),
        getTripHistoryApi({ page_size: 5 }).catch(() => null),
        listDocumentsApi().catch(() => null),
        listFuelLogsApi({ page_size: 4 }).catch(() => null),
        listExpensesApi({ page_size: 4 }).catch(() => null),
        getNotificationsApi().catch(() => null),
      ]);

      setDashboardData(dashRes);
      setDriverProfile(meRes);

      if (historyRes?.results) {
        setRecentTrips(historyRes.results);
      } else if (Array.isArray(historyRes)) {
        setRecentTrips(historyRes);
      }

      if (docsRes?.results) {
        setDocuments(docsRes.results);
      } else if (Array.isArray(docsRes)) {
        setDocuments(docsRes);
      }

      if (fuelRes?.results) {
        setRecentFuel(fuelRes.results);
      } else if (Array.isArray(fuelRes)) {
        setRecentFuel(fuelRes);
      }

      if (expensesRes?.results) {
        setRecentExpenses(expensesRes.results);
      } else if (Array.isArray(expensesRes)) {
        setRecentExpenses(expensesRes);
      }

      if (Array.isArray(notifRes)) {
        setNotifications(notifRes.slice(0, 5));
      } else if (notifRes?.results) {
        setNotifications(notifRes.results.slice(0, 5));
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Format greeting date: e.g. "Wednesday, 14 Oct"
  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  const firstName =
    user?.full_name?.split(' ')[0] ||
    driverProfile?.user?.full_name?.split(' ')[0] ||
    'Driver';

  // License expiry calculation
  let daysToLicenseExpiry = null;
  let licenseWarning = false;
  if (driverProfile?.license_expiry) {
    const expiryDate = new Date(driverProfile.license_expiry);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    daysToLicenseExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (daysToLicenseExpiry <= 30) {
      licenseWarning = true;
    }
  }

  // Document expiry inspection
  const expiringDocs = documents.filter((d) => {
    if (!d.expiry_date) return false;
    const diff = Math.ceil((new Date(d.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return diff <= 30;
  });

  const driverStatus = driverProfile?.status || (dashboardData?.current_trip ? 'ON_TRIP' : 'ACTIVE');

  return (
    <div className="driver-page fade-in">
      {/* Top Welcome Bar */}
      <DashboardHeaderStrip role="driver" title="Driver Dashboard" defaultSubtitle="Trip execution and shift status" />

      {dashboardData?.upcoming_trip?.trip_start_rule === 'any' && (
        <div
          className="driver-demo-banner"
          style={{
            backgroundColor: '#eff6ff',
            color: '#1d4ed8',
            border: '1px solid #bfdbfe',
            padding: '10px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontWeight: 600,
          }}
        >
          Demo mode: start rule off
        </div>
      )}

      {/* Greeting Header without manual refresh button */}
      <div className="driver-greeting-header">
        <div>
          <h1 className="driver-greeting-title">Welcome back, {firstName}</h1>
          <p className="driver-greeting-date">📅 {todayFormatted}</p>
        </div>
      </div>

      {loading ? (
        <div className="driver-skeletons-wrapper">
          <Skeleton height="70px" borderRadius="12px" />
          <div className="driver-stats-row">
            <Skeleton height="85px" borderRadius="10px" />
            <Skeleton height="85px" borderRadius="10px" />
            <Skeleton height="85px" borderRadius="10px" />
            <Skeleton height="85px" borderRadius="10px" />
          </div>
          <Skeleton height="150px" borderRadius="12px" />
          <Skeleton height="140px" borderRadius="12px" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchDashboard} />
      ) : (
        <>
          {/* Driver Status & License Info Card */}
          <div className="driver-status-card">
            <div className="driver-status-left">
              <span className="driver-status-label">Operational Status:</span>
              <Badge
                status={driverStatus}
                text={driverStatus === 'ON_TRIP' ? 'On Trip' : 'Active / Ready'}
              />
            </div>
            {driverProfile?.license_expiry && (
              <div className="driver-license-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ExpiryRing
                  daysLeft={daysToLicenseExpiry}
                  size={42}
                  stroke={3.5}
                  label="Licence"
                />
                <div>
                  <span className="driver-license-text">
                    Licence Expiry: {formatDate(driverProfile.license_expiry)}
                  </span>
                  {licenseWarning && (
                    <span className="driver-license-warning" title="License expiring soon!">
                      <WarningIcon size={14} />
                      {daysToLicenseExpiry <= 0
                        ? 'Expired!'
                        : `${daysToLicenseExpiry}d left`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 7 Summary KPI Cards */}
          <div className="driver-stats-row" style={{ marginTop: '16px' }}>
            <div className="driver-stat-box">
              <div className="driver-stat-num">
                {dashboardData?.todays_trips ?? 0}
              </div>
              <div className="driver-stat-label">Today's Trips</div>
            </div>

            <div className="driver-stat-box">
              <div className="driver-stat-num">
                {dashboardData?.upcoming_trip ? 1 : 0}
              </div>
              <div className="driver-stat-label">Upcoming Trips</div>
            </div>

            <div className="driver-stat-box">
              <div className="driver-stat-num">
                {dashboardData?.completed_trips ?? 0}
              </div>
              <div className="driver-stat-label">Completed Trips</div>
            </div>

            <div className="driver-stat-box">
              <div className="driver-stat-num">
                {dashboardData?.total_distance_km ?? 0} km
              </div>
              <div className="driver-stat-label">Total Distance</div>
            </div>

            <div className="driver-stat-box">
              <div className="driver-stat-num" style={{ color: '#16a34a' }}>
                {formatRupees(dashboardData?.cash_to_hand_over || 0)}
              </div>
              <div className="driver-stat-label">Cash to Hand Over</div>
            </div>

            <div className="driver-stat-box">
              <div className="driver-stat-num" style={{ color: 'var(--primary)' }}>
                {dashboardData?.own_fuel_logs_this_month ?? 0}
              </div>
              <div className="driver-stat-label">Fuel Logs (Mo)</div>
            </div>

            <div className="driver-stat-box">
              <div className="driver-stat-num" style={{ color: 'var(--amber-500)' }}>
                {dashboardData?.own_pending_expenses_count ?? 0}
              </div>
              <div className="driver-stat-label">Pending Exp</div>
            </div>
          </div>

          {/* Pending Payment Resumption Card */}
          {dashboardData?.pending_payment_trip && (
            <Card
              className="driver-pending-payment-alert-card"
              style={{
                backgroundColor: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: '12px',
                padding: '16px',
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ color: '#92400e', fontWeight: 700, fontSize: '15px' }}>
                  Payment Pending - Trip #{dashboardData.pending_payment_trip.id}
                </div>
                <div style={{ color: '#78350f', fontSize: '13px', marginTop: '4px' }}>
                  {dashboardData.pending_payment_trip.source} → {dashboardData.pending_payment_trip.destination} • Fare:{' '}
                  {formatPayableAmount(dashboardData.pending_payment_trip.fare)}
                </div>
              </div>
              <Button
                variant="primary"
                size="medium"
                onClick={() => navigate(`/driver/trips/${dashboardData.pending_payment_trip.id}/complete`)}
                style={{ backgroundColor: '#d97706', borderColor: '#d97706', whiteSpace: 'nowrap' }}
              >
                Collect Payment
              </Button>
            </Card>
          )}

          {/* Active and Upcoming Trip Cards Container */}
          <div className="driver-trips-side-by-side" style={{ marginTop: '16px' }}>
            {/* Current Trip Card (Only if IN_PROGRESS) */}
            {dashboardData?.current_trip && (
              <Card className="driver-active-trip-card">
                <div className="driver-card-header">
                  <span className="driver-card-tag current">
                    <span className="live-indicator-dot" /> Current Trip
                  </span>
                  <VehiclePlate registrationNumber={dashboardData.current_trip.vehicle_registration} size="sm" />
                </div>

                <RouteLine
                  source={dashboardData?.current_trip?.source || dashboardData?.current_trip?.pickup_location || 'Origin'}
                  destination={dashboardData?.current_trip?.destination || dashboardData?.current_trip?.drop_location || 'Destination'}
                  progressPercent={dashboardData?.current_trip?.progress_percent ?? 50}
                  vehicleType="CAR"
                />

                <div className="driver-trip-meta">
                  <div className="driver-meta-item">
                    <ClockIcon size={15} />
                    <span>
                      Started:{' '}
                      {dashboardData.current_trip.started_at
                        ? new Date(dashboardData.current_trip.started_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'In Progress'}
                    </span>
                  </div>
                  {dashboardData.current_trip.start_odometer && (
                    <div className="driver-meta-item">
                      <span>Recorded Base: {dashboardData.current_trip.start_odometer} km</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  onClick={() => navigate(`/driver/trips/${dashboardData.current_trip.id}`)}
                >
                  Continue Trip
                </Button>
              </Card>
            )}

            {/* Upcoming Trip Card */}
            {dashboardData?.upcoming_trip ? (
              <Card className="driver-upcoming-trip-card">
                <div className="driver-card-header">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="driver-card-tag upcoming">Upcoming Trip</span>
                    {dashboardData.upcoming_trip.start_date_label && (
                      <span
                        className="driver-date-chip"
                        style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor:
                            dashboardData.upcoming_trip.start_date_status === 'TODAY'
                              ? '#dcfce7'
                              : dashboardData.upcoming_trip.start_date_status === 'PASSED'
                              ? '#fee2e2'
                              : '#f1f5f9',
                          color:
                            dashboardData.upcoming_trip.start_date_status === 'TODAY'
                              ? '#15803d'
                              : dashboardData.upcoming_trip.start_date_status === 'PASSED'
                              ? '#b91c1c'
                              : '#475569',
                          border: `1px solid ${
                            dashboardData.upcoming_trip.start_date_status === 'TODAY'
                              ? '#86efac'
                              : dashboardData.upcoming_trip.start_date_status === 'PASSED'
                              ? '#fca5a5'
                              : '#cbd5e1'
                          }`,
                        }}
                      >
                        {dashboardData.upcoming_trip.start_date_label}
                      </span>
                    )}
                  </div>
                  <VehiclePlate registrationNumber={dashboardData.upcoming_trip.vehicle_registration} size="sm" />
                </div>

                <RouteLine
                  source={dashboardData?.upcoming_trip?.source || dashboardData?.upcoming_trip?.pickup_location || 'Origin'}
                  destination={dashboardData?.upcoming_trip?.destination || dashboardData?.upcoming_trip?.drop_location || 'Destination'}
                  vehicleType="CAR"
                />

                <div className="driver-trip-meta">
                  <div className="driver-meta-item">
                    <ClockIcon size={15} />
                    <span>
                      {dashboardData.upcoming_trip.scheduled_datetime
                        ? new Date(dashboardData.upcoming_trip.scheduled_datetime).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : 'Scheduled'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <div
                    title={
                      !dashboardData.upcoming_trip.can_start
                        ? dashboardData.upcoming_trip.start_date_status === 'PASSED'
                          ? 'The trip date has passed'
                          : `Starts on ${dashboardData.upcoming_trip.scheduled_date_formatted}`
                        : ''
                    }
                    style={{ flex: 1 }}
                  >
                    <Button
                      variant="primary"
                      size="medium"
                      fullWidth
                      disabled={!dashboardData.upcoming_trip.can_start}
                      onClick={() => navigate(`/driver/trips/${dashboardData.upcoming_trip.id}/start`)}
                    >
                      {dashboardData.upcoming_trip.can_start
                        ? 'Start Trip'
                        : dashboardData.upcoming_trip.start_date_status === 'PASSED'
                        ? 'Date passed'
                        : `Starts on ${dashboardData.upcoming_trip.scheduled_date_formatted}`}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="medium"
                    onClick={() => navigate(`/driver/trips/${dashboardData.upcoming_trip.id}`)}
                  >
                    Details
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="driver-no-upcoming-card">
                <CheckIcon size={28} />
                <p>No upcoming trips scheduled for now.</p>
                <Button variant="outline" size="small" onClick={() => navigate('/driver/my-trips')}>
                  View All Trips
                </Button>
              </Card>
            )}
          </div>

          {/* Document Expiry Alerts Banner */}
          <div style={{ marginTop: '20px' }}>
            {expiringDocs.length > 0 ? (
              <div
                style={{
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AlertCircleIcon size={24} color="#d97706" />
                  <div>
                    <h4 style={{ margin: 0, color: '#92400e', fontSize: '15px', fontWeight: 600 }}>
                      Document Compliance Alert ({expiringDocs.length} Attention Required)
                    </h4>
                    <p style={{ margin: '4px 0 0', color: '#b45309', fontSize: '13px' }}>
                      {expiringDocs.map((d) => d.doc_type_display || d.doc_type).join(', ')} expiring soon or expired. Please upload renewed documents to avoid dispatch hold.
                    </p>
                  </div>
                </div>
                <Button variant="primary" size="small" onClick={() => navigate('/driver/documents')}>
                  Manage Documents
                </Button>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircleIcon size={20} color="#16a34a" />
                  <span style={{ color: '#166534', fontSize: '13.5px', fontWeight: 500 }}>
                    All driver verification documents and certificates are verified and compliant.
                  </span>
                </div>
                <Button variant="ghost" size="small" onClick={() => navigate('/driver/documents')}>
                  View Documents →
                </Button>
              </div>
            )}
          </div>

          {/* Driver Profile & Recent Completion History (2 columns on desktop) */}
          <div className="driver-grid-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginTop: '20px' }}>
            {/* Driver Profile Summary Card */}
            <Card className="driver-profile-widget-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary-subtle, #eff6ff)',
                    color: 'var(--primary, #2563eb)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    fontWeight: 700,
                  }}
                >
                  {firstName.charAt(0)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                    {driverProfile?.user?.full_name || user?.full_name || 'Driver Profile'}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    Driver ID: #{driverProfile?.id || user?.id || 'DRV'} • {driverStatus}
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div style={{ padding: '8px 12px', background: 'var(--color-surface-hover, #f8fafc)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', display: 'block' }}>Phone</span>
                  <strong>{driverProfile?.user?.phone_number || user?.phone_number || '—'}</strong>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--color-surface-hover, #f8fafc)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', display: 'block' }}>Email</span>
                  <strong style={{ wordBreak: 'break-all' }}>{driverProfile?.user?.email || user?.email || '—'}</strong>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--color-surface-hover, #f8fafc)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', display: 'block' }}>Driving License</span>
                  <strong>{driverProfile?.license_number || '—'}</strong>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--color-surface-hover, #f8fafc)', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', display: 'block' }}>Assigned Vehicle</span>
                  <strong>{driverProfile?.assigned_vehicle_registration || 'Dispatch Pool'}</strong>
                </div>
              </div>
            </Card>

            {/* Trip Completion History Preview */}
            <Card className="driver-recent-trips-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                  Trip Completion History
                </h3>
                <Button variant="ghost" size="small" onClick={() => navigate('/driver/history')}>
                  See All →
                </Button>
              </div>

              {recentTrips.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                  No completed trips recorded yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {recentTrips.slice(0, 4).map((trip) => (
                    <div
                      key={trip.id}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--color-surface-hover, #f8fafc)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                          {trip.source} → {trip.destination}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          Trip #{trip.id} • {formatDate(trip.completed_at || trip.scheduled_datetime || trip.created_at)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--color-text-primary)' }}>
                          {formatPayableAmount(trip.total_fare, { tripStatus: trip.status })}
                        </div>
                        <Badge status={trip.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Fuel & Expense Activity Preview Row */}
          <div className="driver-grid-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginTop: '20px' }}>
            {/* Fuel History Preview */}
            <Card style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FuelIcon size={18} color="var(--primary)" />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Fuel History</h3>
                </div>
                <Button variant="ghost" size="small" onClick={() => navigate('/driver/fuel')}>
                  Manage Fuel →
                </Button>
              </div>

              {recentFuel.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                  No fuel logs submitted this month.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recentFuel.slice(0, 3).map((f) => (
                    <div
                      key={f.id}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--color-surface-hover, #f8fafc)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                      }}
                    >
                      <div>
                        <strong>{formatDate(f.date)}</strong> • {f.liters || f.quantity} L ({f.fuel_type || 'Fuel'})
                      </div>
                      <div style={{ fontWeight: 600 }}>{formatRupees(f.cost || f.total_cost || 0)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Expense History Preview */}
            <Card style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ReceiptIcon size={18} color="var(--amber-500)" />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Expense History</h3>
                </div>
                <Button variant="ghost" size="small" onClick={() => navigate('/driver/expenses')}>
                  Manage Expenses →
                </Button>
              </div>

              {recentExpenses.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                  No operational expenses logged.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recentExpenses.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--color-surface-hover, #f8fafc)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px',
                      }}
                    >
                      <div>
                        <strong>{e.title || e.category}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{formatDate(e.date || e.created_at)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600 }}>{formatRupees(e.amount || 0)}</div>
                        <Badge status={e.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Recent Notifications Widget */}
          {notifications.length > 0 && (
            <Card style={{ padding: '20px', marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <BellIcon size={18} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Recent Notifications</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notifications.slice(0, 3).map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '10px 14px',
                      background: n.is_read ? 'var(--color-surface-hover, #f8fafc)' : 'var(--blue-50, #eff6ff)',
                      borderLeft: n.is_read ? '3px solid var(--border, #cbd5e1)' : '3px solid var(--primary, #2563eb)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: n.is_read ? 500 : 700 }}>{n.title || n.verb || 'Notification'}</div>
                      <div style={{ color: 'var(--color-text-secondary)', marginTop: '2px' }}>{n.message || n.description}</div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDateTime(n.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
