import DashboardHeaderStrip from "../../components/common/DashboardHeaderStrip";
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Loader';
import {
  CheckIcon,
  RefreshIcon,
  ClockIcon,
  WarningIcon,
} from '../../components/common/Icons';
import { RouteLine, VehiclePlate, ExpiryRing } from '../../components/common/SignatureDesign';
import { useAuth } from '../../context/AuthContext';
import { getDriverDashboardApi, getDriverMeApi } from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import './DriverPages.css';

export default function DriverDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, meRes] = await Promise.all([
        getDriverDashboardApi(),
        getDriverMeApi().catch(() => null),
      ]);
      setDashboardData(dashRes);
      setDriverProfile(meRes);
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

  const driverStatus = driverProfile?.status || 'ACTIVE';

  return (
    <div className="driver-page fade-in">
      {/* Top Welcome Bar */}
      <DashboardHeaderStrip role="driver" title="Driver Dashboard" defaultSubtitle="Trip execution and shift status" />
      <div className="driver-greeting-header">
        <div>
          <h1 className="driver-greeting-title">Today, {firstName}</h1>
          <p className="driver-greeting-date">{todayFormatted}</p>
        </div>
        <IconButton
          icon={<RefreshIcon size={18} />}
          label="Refresh"
          ariaLabel="Refresh Dashboard"
          onClick={fetchDashboard}
          variant="ghost"
          className="driver-refresh-btn"
        />
      </div>

      {loading ? (
        <div className="driver-skeletons-wrapper">
          <Skeleton height="70px" borderRadius="12px" />
          <div className="driver-stats-row">
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
              <span className="driver-status-label">Driver Status:</span>
              <Badge
                status={driverStatus}
                text={driverStatus === 'ON_TRIP' ? 'On Trip' : 'Active'}
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
                    Expiry: {driverProfile.license_expiry}
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

          {/* 3 Stat Cards */}
          <div className="driver-stats-row">
            <div className="driver-stat-box">
              <div className="driver-stat-num">
                {dashboardData?.todays_trips ?? 0}
              </div>
              <div className="driver-stat-label">Today's Trips</div>
            </div>

            <div className="driver-stat-box">
              <div className="driver-stat-num">
                {dashboardData?.completed_trips ?? 0}
              </div>
              <div className="driver-stat-label">Completed</div>
            </div>

            <div className="driver-stat-box">
              <div className="driver-stat-num">
                {dashboardData?.total_distance_km ?? 0}
              </div>
              <div className="driver-stat-label">Total Km</div>
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

          {/* Current and Upcoming Trip Cards Container (Side by side on desktop) */}
          <div className="driver-trips-side-by-side">
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
                        ? new Date(
                            dashboardData.current_trip.started_at
                          ).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'In Progress'}
                    </span>
                  </div>
                  {dashboardData.current_trip.start_odometer && (
                    <div className="driver-meta-item">
                      <span>Odo: {dashboardData.current_trip.start_odometer} km</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  onClick={() =>
                    navigate(`/driver/trips/${dashboardData.current_trip.id}`)
                  }
                >
                  Continue Trip
                </Button>
              </Card>
            )}

            {/* Upcoming Trip Card */}
            {dashboardData?.upcoming_trip ? (
              <Card className="driver-upcoming-trip-card">
                <div className="driver-card-header">
                  <span className="driver-card-tag upcoming">Upcoming Trip</span>
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
                        ? new Date(
                            dashboardData.upcoming_trip.scheduled_datetime
                          ).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : 'Scheduled'}
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="medium"
                  fullWidth
                  onClick={() =>
                    navigate(`/driver/trips/${dashboardData.upcoming_trip.id}`)
                  }
                >
                  View Details
                </Button>
              </Card>
            ) : (
              <Card className="driver-no-upcoming-card">
                <CheckIcon size={28} />
                <p>No upcoming trips scheduled for now.</p>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
