import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Loader';
import {
  ArrowLeftIcon,
  VehicleIcon,
  UserIcon,
  ClockIcon,
  WarningIcon,
  CheckIcon,
} from '../../components/common/Icons';
import { getTripDetailsApi } from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import { useTripLocationSharing } from '../../hooks/useTripLocationSharing';
import './DriverPages.css';

export default function DriverTripDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  // Hook for live location sharing while trip is IN_PROGRESS
  const isTripInProgress = trip?.status === 'IN_PROGRESS';
  const { sharingActive, permissionDenied } = useTripLocationSharing(
    id,
    isTripInProgress
  );

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

  return (
    <div className="driver-page fade-in">
      {/* Top Header with Back Navigation */}
      <div className="driver-page-header">
        <IconButton
          icon={<ArrowLeftIcon size={20} />}
          label="Back"
          ariaLabel="Back to My Trips"
          onClick={() => navigate('/driver/trips')}
          variant="ghost"
          className="driver-back-btn"
        />
        <h1 className="driver-page-title">Trip Details</h1>
        <div style={{ width: 36 }} />
      </div>

      {loading ? (
        <div className="driver-skeletons-wrapper">
          <Skeleton height="120px" borderRadius="12px" />
          <Skeleton height="200px" borderRadius="12px" />
          <Skeleton height="50px" borderRadius="10px" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchTrip} />
      ) : !trip ? (
        <ErrorState message="Trip details could not be found." onRetry={fetchTrip} />
      ) : (
        <>
          {/* Location Status Banners (for IN_PROGRESS trips) */}
          {isTripInProgress && permissionDenied && (
            <div className="driver-location-warning-banner">
              <WarningIcon size={16} />
              <span>
                Location is off. Customers and managers cannot see your live position.
              </span>
            </div>
          )}

          {isTripInProgress && sharingActive && !permissionDenied && (
            <div className="driver-location-active-badge">
              <span className="driver-radar-dot">
                <span className="driver-radar-ring" />
              </span>
              <span>Location sharing ON (live coordinates sending)</span>
            </div>
          )}

          {/* Route and Vehicle Info Side by Side on Desktop */}
          <div className="driver-trip-details-grid">
            {/* Main Route Card */}
            <Card className="driver-details-card">
              <div className="driver-card-top-row">
                <span className="driver-trip-id-tag">Trip #{trip.id}</span>
                <Badge status={trip.status} />
              </div>

              <div className="driver-route-expanded">
                <div className="driver-route-step">
                  <span className="route-dot pickup" />
                  <div className="route-step-info">
                    <span className="step-label">Pickup</span>
                    <span className="step-place">{trip?.source || trip?.pickup_location || '-'}</span>
                  </div>
                </div>

                <div className="driver-route-line" />

                <div className="driver-route-step">
                  <span className="route-dot drop" />
                  <div className="route-step-info">
                    <span className="step-label">Drop</span>
                    <span className="step-place">{trip?.destination || trip?.drop_location || '-'}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Detailed Info Card */}
            <Card className="driver-info-list-card">
              <div className="driver-info-item">
                <div className="info-icon">
                  <ClockIcon size={18} />
                </div>
                <div className="info-text">
                  <span className="info-label">Scheduled Time</span>
                  <span className="info-value">
                    {formatDateTime(trip.scheduled_datetime)}
                  </span>
                </div>
              </div>

              <div className="driver-info-item">
                <div className="info-icon">
                  <VehicleIcon size={18} />
                </div>
                <div className="info-text">
                  <span className="info-label">Assigned Vehicle</span>
                  <span className="info-value">
                    {trip.vehicle_brand_model ? `${trip.vehicle_brand_model} • ` : ''}
                    {trip.vehicle_registration}
                  </span>
                  <span className="info-sub">
                    Type: {trip.vehicle_type || 'Vehicle'}
                  </span>
                </div>
              </div>

              <div className="driver-info-item">
                <div className="info-icon">
                  <UserIcon size={18} />
                </div>
                <div className="info-text">
                  <span className="info-label">
                    {trip.bus_schedule ? 'Bus Passengers' : 'Customer'}
                  </span>
                  <span className="info-value">
                    {trip.bus_schedule
                      ? `${trip.passengers || 0} Passengers Booked`
                      : trip.customer_name || 'Booked Customer'}
                  </span>
                </div>
              </div>

              {trip.start_odometer && (
                <div className="driver-info-item">
                  <div className="info-icon">
                    <CheckIcon size={18} />
                  </div>
                  <div className="info-text">
                    <span className="info-label">Start Odometer</span>
                    <span className="info-value">{trip.start_odometer} km</span>
                  </div>
                </div>
              )}

              {trip.end_odometer && (
                <div className="driver-info-item">
                  <div className="info-icon">
                    <CheckIcon size={18} />
                  </div>
                  <div className="info-text">
                    <span className="info-label">End Odometer</span>
                    <span className="info-value">{trip.end_odometer} km</span>
                  </div>
                </div>
              )}

              {trip.status === 'COMPLETED' && (
                <>
                  <div className="driver-info-item highlighted">
                    <span className="info-label">Total Distance:</span>
                    <span className="info-value font-bold">
                      {trip.distance_km ?? (trip.end_odometer - trip.start_odometer)} km
                    </span>
                  </div>
                  <div className="driver-info-item highlighted">
                    <span className="info-label">Final Fare:</span>
                    <span className="info-value font-bold fare-text">
                      ₹{trip.total_fare || '0.00'}
                    </span>
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Action Area */}
          <div className="driver-action-container">
            {trip.status === 'SCHEDULED' && (
              <Button
                variant="primary"
                size="large"
                fullWidth
                onClick={() => navigate(`/driver/trips/${trip.id}/start`)}
              >
                Start Trip
              </Button>
            )}

            {trip.status === 'IN_PROGRESS' && (
              <Button
                variant="primary"
                size="large"
                fullWidth
                onClick={() => navigate(`/driver/trips/${trip.id}/complete`)}
              >
                Complete Trip
              </Button>
            )}

            {trip.status === 'COMPLETED' && (
              <Button
                variant="primary"
                size="large"
                fullWidth
                onClick={() => navigate(`/driver/trips/${trip.id}/payment`)}
              >
                View Payment
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
