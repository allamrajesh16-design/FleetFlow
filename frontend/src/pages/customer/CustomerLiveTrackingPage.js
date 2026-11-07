import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getBookingTrackingApi } from '../../api/customer';
import StatusBadge from '../../components/common/StatusBadge';
import { SkeletonCard } from '../../components/common/Skeleton';
import ErrorState from '../../components/common/ErrorState';
import Button from '../../components/common/Button';
import { formatDateTime } from '../../utils/formatters';
import './CustomerPages.css';

// Custom Marker for Driver's Vehicle
function createTrackingMarker(regNumber) {
  return L.divIcon({
    className: 'custom-customer-marker',
    html: `
      <div style="
        background: var(--primary);
        color: var(--surface);
        padding: 6px 12px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 4px 12px var(--primary-glow);
        border: 2px solid var(--surface);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
        transform: translate(-50%, -50%);
      ">
        <span style="font-size: 14px;">🚖</span>
        <span>${regNumber || 'Vehicle'}</span>
      </div>
    `,
    iconSize: [110, 32],
    iconAnchor: [55, 16],
  });
}

// Helper component to smoothly pan/recenter map when coordinates update
function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

export default function CustomerLiveTrackingPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const timerRef = useRef(null);

  const fetchTracking = useCallback(async (isInitial = false) => {
    if (!isInitial && document.hidden) return;
    try {
      if (isInitial) setLoading(true);
      setError(null);
      const data = await getBookingTrackingApi(id);
      setTracking(data);
      setLastRefreshed(new Date());
    } catch (err) {
      if (err.response?.status === 403) {
        setError('You are not authorized to track this booking.');
      } else if (err.response?.status === 404) {
        setError('Booking tracking information not found.');
      } else {
        setError('Failed to load tracking data. Please try again.');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTracking(true);
  }, [fetchTracking]);

  // Set up 15-second polling while trip is IN_PROGRESS
  useEffect(() => {
    if (tracking?.step === 'IN_PROGRESS' || tracking?.trip_status === 'IN_PROGRESS') {
      timerRef.current = setInterval(() => {
        fetchTracking(false);
      }, 15000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tracking?.step, tracking?.trip_status, fetchTracking]);

  if (loading) {
    return (
      <div className="customer-page">
        <SkeletonCard />
        <div style={{ marginTop: '1.5rem', height: '400px' }}>
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-page">
        <Button
          type="button"
          variant="ghost"
          size="small"
          onClick={() => navigate(`/customer/bookings/${id}`)}
          style={{ marginBottom: '12px' }}
        >
          ← Back to Booking Details
        </Button>
        <ErrorState message={error} onRetry={() => fetchTracking(true)} />
      </div>
    );
  }

  if (!tracking) return null;

  // Step Bar calculation
  const steps = [
    { key: 'BOOKED', label: 'Booked' },
    { key: 'ASSIGNED', label: 'Assigned' },
    { key: 'IN_PROGRESS', label: 'In Progress' },
    { key: 'COMPLETED', label: 'Completed' },
  ];

  const getStepIndex = (st) => {
    switch (st) {
      case 'BOOKED':
        return 0;
      case 'ASSIGNED':
        return 1;
      case 'IN_PROGRESS':
        return 2;
      case 'COMPLETED':
        return 3;
      default:
        return 0;
    }
  };

  const activeStepIdx = getStepIndex(tracking.step);

  const loc = tracking.last_known_location;
  const hasLocation = Boolean(loc && loc.latitude && loc.longitude);
  const position = hasLocation
    ? [parseFloat(loc.latitude), parseFloat(loc.longitude)]
    : [12.9716, 77.5946]; // Default Bangalore center if pending

  const isInProgress = tracking.step === 'IN_PROGRESS' || tracking.trip_status === 'IN_PROGRESS';

  return (
    <div className="customer-page">
      {/* Header */}
      <div className="customer-page-header">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() => navigate(`/customer/bookings/${id}`)}
            style={{ marginBottom: '8px' }}
          >
            ← Back to Booking Details
          </Button>
          <div className="booking-title-row">
            <h1 className="customer-page-title">Live Trip Tracking</h1>
            <StatusBadge status={tracking.trip_status || tracking.booking_status} />
          </div>
          <p className="customer-page-subtitle">
            {tracking.source} ➔ {tracking.destination}
          </p>
        </div>

        {isInProgress && (
          <div className="live-indicator-pill">
            <span className="live-dot-pulse" />
            <span>Live GPS (Updates every 15s)</span>
          </div>
        )}
      </div>

      {/* Step Bar */}
      <div className="tracking-step-card">
        <div className="tracking-step-bar">
          {steps.map((st, idx) => {
            const isCompleted = idx <= activeStepIdx;
            const isCurrent = idx === activeStepIdx;
            return (
              <div
                key={st.key}
                className={`step-bar-item ${isCompleted ? 'step-done' : ''} ${
                  isCurrent ? 'step-active' : ''
                }`}
              >
                <div className="step-circle">
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <div className="step-label-text">{st.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Driver & Vehicle Card (Note: strictly no phone or email) */}
      <div className="tracking-meta-grid">
        <div className="tracking-info-box">
          <span className="info-box-icon">👤</span>
          <div>
            <div className="info-box-label">Assigned Driver</div>
            <div className="info-box-value">
              {tracking.driver_name || 'Driver assignment in progress'}
            </div>
          </div>
        </div>

        <div className="tracking-info-box">
          <span className="info-box-icon">🚘</span>
          <div>
            <div className="info-box-label">Vehicle Registration</div>
            <div className="info-box-value">
              {tracking.vehicle_registration || 'Vehicle will be assigned shortly'}
            </div>
          </div>
        </div>

        <div className="tracking-info-box">
          <span className="info-box-icon">⏱️</span>
          <div>
            <div className="info-box-label">Scheduled Time</div>
            <div className="info-box-value">
              {tracking.scheduled_datetime
                ? formatDateTime(tracking.scheduled_datetime)
                : 'As scheduled'}
            </div>
          </div>
        </div>
      </div>

      {/* Map Section */}
      <div className="tracking-map-wrapper">
        <div className="map-top-bar">
          <span className="map-title">Route & Vehicle Position</span>
          <span className="map-time-label">
            Last updated: {lastRefreshed.toLocaleTimeString()}
          </span>
        </div>

        <div className="tracking-map-display">
          <MapContainer
            center={position}
            zoom={hasLocation ? 14 : 11}
            scrollWheelZoom={false}
            style={{ width: '100%', height: '420px', borderRadius: '12px' }}
          >
            <ChangeView center={position} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {hasLocation && (
              <Marker
                position={position}
                icon={createTrackingMarker(tracking.vehicle_registration)}
              >
                <Popup>
                  <div style={{ minWidth: '160px', padding: '4px' }}>
                    <strong>{tracking.vehicle_registration || 'Vehicle'}</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Driver: {tracking.driver_name}
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>
                      Status: {tracking.trip_status}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Recorded: {formatDateTime(loc.recorded_at)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>

          {!hasLocation && (
            <div className="map-location-notice">
              <span className="notice-icon">📡</span>
              <div>
                <strong>Waiting for driver's live GPS signal</strong>
                <p>
                  {isInProgress
                    ? 'Trip is in progress. The vehicle telemetry will appear on the map as soon as GPS updates are transmitted.'
                    : 'Live GPS coordinates are transmitted while the trip is IN_PROGRESS.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
