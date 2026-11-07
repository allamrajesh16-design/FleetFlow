import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import useApiList from '../../hooks/useApiList';
import { getLiveTripsApi, cancelTripApi } from '../../api/adminManager';
import apiClient from '../../api/client';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { RefreshIcon } from '../../components/common/Icons';
import { formatMoney, formatDateTime } from '../../utils/formatters';
import '../admin/AdminPages.css';
import './ManagerPages.css';


// Custom SVG HTML divIcon for reliable rendering without asset path issues
function createMapMarker(label, isLive = true) {
  return L.divIcon({
    className: 'custom-vehicle-marker',
    html: `
      <div style="
        background: ${isLive ? 'var(--primary)' : 'var(--text-muted)'};
        color: var(--surface);
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        border: 2px solid var(--surface);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        transform: translate(-50%, -50%);
      ">
        <span>🚗</span>
        <span>${label}</span>
      </div>
    `,
    iconSize: [90, 28],
    iconAnchor: [45, 14],
  });
}

export default function ManagerTripsPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const openId = searchParams.get('open');

  // All trips list
  const {
    data,
    totalCount,
    totalPages,
    page,
    loading,
    error,
    search,
    filters,
    setPage,
    setSearch,
    setFilter,
    refresh,
  } = useApiList({
    endpoint: '/trips/',
    initialFilters: { status: '' },
  });

  // Live telemetry trips
  const [liveTrips, setLiveTrips] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [cancellingTrip, setCancellingTrip] = useState(null);

  useEffect(() => {
    if (!openId) return;
    const found = data.find((t) => String(t.id) === String(openId));
    if (found) {
      setSelectedTrip(found);
    } else {
      apiClient
        .get(`/trips/${openId}/`)
        .then((res) => {
          if (res.data) setSelectedTrip(res.data);
        })
        .catch(() => {});
    }
  }, [openId, data]);

  const timerRef = useRef(null);

  const fetchLiveTrips = useCallback(async () => {
    if (document.hidden) return;
    setLiveLoading(true);
    try {
      const res = await getLiveTripsApi();
      setLiveTrips(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load live trips:', err);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  // Poll live telemetry every 15 seconds
  useEffect(() => {
    fetchLiveTrips();
    timerRef.current = setInterval(() => {
      fetchLiveTrips();
    }, 15000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchLiveTrips]);

  const handleCancelTrip = async () => {
    if (!cancellingTrip) return;
    try {
      await cancelTripApi(cancellingTrip.id);
      toast.success(`Trip TRP-${String(cancellingTrip.id).padStart(4, '0')} has been cancelled.`);
      setCancellingTrip(null);
      refresh();
      fetchLiveTrips();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel trip.');
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'vehicle',
        label: 'Vehicle',
        render: (value, t) => {
          const item = t || value || {};
          const reg = item.vehicle_registration || '-';
          const details = [item.vehicle_brand_model, item.vehicle_type ? `(${item.vehicle_type})` : ''].filter(Boolean).join(' ');
          return (
            <div>
              <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{reg}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {details || '-'}
              </div>
            </div>
          );
        },
      },
      {
        key: 'driver',
        label: 'Driver',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <div>
              <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{item.driver_name || 'Driver'}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Lic: {item.driver_license || '-'}
              </div>
            </div>
          );
        },
      },
      {
        key: 'route',
        label: 'Route',
        render: (value, t) => {
          const item = t || value || {};
          const src = item.source || item.pickup_location || '-';
          const dst = item.destination || item.drop_location || '-';
          const typeLabel = item.bus_schedule ? 'Bus trip' : item.booking ? 'Vehicle booking' : '';
          return (
            <div>
              <span style={{ fontWeight: 'var(--font-weight-medium)' }}>
                {src} <span style={{ color: 'var(--color-primary)' }}>→</span> {dst}
              </span>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {item.scheduled_datetime ? formatDateTime(item.scheduled_datetime) : '-'}
                {typeLabel ? ` • ${typeLabel}` : ''}
              </div>
            </div>
          );
        },
      },
      {
        key: 'status',
        label: 'Status',
        render: (value, t) => {
          const item = t || value || {};
          return <Badge status={item.status || 'SCHEDULED'} />;
        },
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <div className="admin-action-btn-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconButton
                action="view"
                tooltip="View Trip Details"
                ariaLabel="View Trip Details"
                onClick={() => setSelectedTrip(item)}
              />
              {item.status === 'SCHEDULED' && (
                <Button
                  type="button"
                  size="small"
                  variant="danger"
                  onClick={() => setCancellingTrip(item)}
                >
                  Cancel
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    []
  );

  // Default coordinate center (Kakinada / Andhra Pradesh coordinates)
  const defaultCenter = [16.9891, 82.2475];

  // Calculate live coordinates
  const activeMarkers = liveTrips
    .filter((t) => t.last_known_location?.latitude && t.last_known_location?.longitude)
    .map((t) => ({
      trip: t,
      position: [Number(t.last_known_location.latitude), Number(t.last_known_location.longitude)],
    }));

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Trip Monitoring"
        subtitle="Real-time telemetry tracking and trip operations (auto-refreshes every 15s)"
        actions={
          <Button
            type="button"
            variant="outline"
            icon={<RefreshIcon size={18} />}
            onClick={() => {
              refresh();
              fetchLiveTrips();
            }}
            disabled={liveLoading}
          >
            Refresh
          </Button>
        }
      />


      {/* Map Panel Row */}
      <div className="admin-card" style={{ padding: 'var(--space-4)' }}>
        <div className="admin-card-header" style={{ marginBottom: 'var(--space-3)' }}>
          <div>
            <h2 className="admin-card-title">Live Telemetry Map</h2>
            <span className="admin-card-subtitle">
              OpenStreetMap Telemetry • {activeMarkers.length} active vehicle(s) transmitting GPS
            </span>
          </div>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-bold)',
              background: liveTrips.length > 0 ? 'var(--status-green-bg)' : 'var(--color-surface-hover)',
              color: liveTrips.length > 0 ? 'var(--status-green-text)' : 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            {liveTrips.length > 0 ? `LIVE (${liveTrips.length})` : 'IDLE'}
          </span>
        </div>

        <div className="manager-map-container">
          <MapContainer
            center={activeMarkers[0]?.position || defaultCenter}
            zoom={11}
            scrollWheelZoom={false}
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {activeMarkers.map(({ trip, position }) => (
              <Marker
                key={trip.id}
                position={position}
                icon={createMapMarker(trip.vehicle_registration, true)}
              >
                <Popup>
                  <div style={{ minWidth: '180px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{trip.vehicle_registration}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Driver: {trip.driver_name}
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>
                      <strong>Route:</strong> {trip.source} → {trip.destination}
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '2px' }}>
                      <strong>Status:</strong> {trip.status}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Telemetry: {formatDateTime(trip.last_known_location?.recorded_at || trip.updated_at)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {activeMarkers.length === 0 && (
            <div className="map-empty-overlay">
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', display: 'block' }}>
                No active in-progress vehicles currently transmitting
              </span>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                When drivers start scheduled trips, live GPS updates will broadcast here every 15 seconds.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Trips Table */}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={() => {
          refresh();
          fetchLiveTrips();
        }}
        enableViewSwitch={true}
        storageKey="fleetflow_view_trips"
        searchPlaceholder="Search by vehicle, driver, route..."
        searchValue={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={setPage}
        filters={[
          {
            key: 'status',
            label: 'All Status',
            value: filters.status,
            options: [
              { value: '', label: 'All Status' },
              { value: 'SCHEDULED', label: 'Scheduled' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
            onChange: (val) => setFilter('status', val),
          },
        ]}
      />

      {/* Trip Details Modal */}
      <Modal
        isOpen={Boolean(selectedTrip)}
        onClose={() => setSelectedTrip(null)}
        title={`Trip Details: TRP-${String(selectedTrip?.id || '').padStart(4, '0')}`}
        size="medium"
      >
        {selectedTrip && (
          <div>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Vehicle</span>
                <span className="detail-value">{selectedTrip.vehicle_registration}</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  {selectedTrip.vehicle_brand_model}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Assigned Driver</span>
                <span className="detail-value">{selectedTrip.driver_name}</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  Lic: {selectedTrip.driver_license}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Route</span>
                <span className="detail-value">
                  {selectedTrip.source} → {selectedTrip.destination}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Status</span>
                <div>
                  <Badge status={selectedTrip.status} />
                </div>
              </div>

              <div className="detail-item">
                <span className="detail-label">Start Odometer</span>
                <span className="detail-value">
                  {selectedTrip.start_odometer ? `${selectedTrip.start_odometer} km` : 'Not recorded'}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Final Odometer</span>
                <span className="detail-value">
                  {selectedTrip.end_odometer ? `${selectedTrip.end_odometer} km` : 'Not recorded'}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Total Distance</span>
                <span className="detail-value">
                  {selectedTrip.distance_km ? `${selectedTrip.distance_km} km` : '—'}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Total Fare</span>
                <span className="detail-value" style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
                  {formatMoney(selectedTrip.total_fare || 0)}
                </span>
              </div>
            </div>

            <div className="info-card-banner">
              <div>
                <h3>GPS Telemetry Status</h3>
                <p>
                  {selectedTrip.last_known_location
                    ? `Lat: ${selectedTrip.last_known_location.latitude}, Lng: ${selectedTrip.last_known_location.longitude}`
                    : 'No location yet'}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel Scheduled Trip Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(cancellingTrip)}
        onClose={() => setCancellingTrip(null)}
        onConfirm={handleCancelTrip}
        title="Cancel Scheduled Trip"
        message={`Are you sure you want to cancel scheduled trip TRP-${String(cancellingTrip?.id || '').padStart(4, '0')} (${cancellingTrip?.source} → ${cancellingTrip?.destination})? The vehicle and driver will be freed.`}
        confirmLabel="Cancel Trip"
        isDanger={true}
      />
    </div>
  );
}
