import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import useApiList from '../../hooks/useApiList';
import apiClient from '../../api/client';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import ViewSwitch from '../../components/common/ViewSwitch';
import Modal from '../../components/common/Modal';
import { formatMoney, formatDateTime } from '../../utils/formatters';
import './AdminPages.css';

export default function AdminTripsPage() {
  const [searchParams] = useSearchParams();
  const openId = searchParams.get('open');

  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('fleetflow_view_trips') || 'table'
  );

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

  const [selectedTrip, setSelectedTrip] = useState(null);

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
              <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{item.driver_name || 'Assigned Driver'}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Lic: {item.driver_license || '-'}
              </div>
            </div>
          );
        },
      },
      {
        key: 'route',
        label: 'Source → Destination',
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
            <IconButton
              action="view"
              tooltip="View Trip Details"
              ariaLabel="View Trip Details"
              onClick={() => setSelectedTrip(item)}
            />
          );
        },
      },
    ],
    []
  );

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Trip Management"
        subtitle="Monitor completed, active, and dispatched journeys across the fleet"
        actions={
          <ViewSwitch
            view={viewMode}
            onChange={setViewMode}
            storageKey="fleetflow_view_trips"
          />
        }
      />

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={refresh}
        viewMode={viewMode}
        searchPlaceholder="Search by vehicle, driver, route..."
        search={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={totalPages}
        count={totalCount}
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
                  License: {selectedTrip.driver_license}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Route Origin</span>
                <span className="detail-value">{selectedTrip.source}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Route Destination</span>
                <span className="detail-value">{selectedTrip.destination}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Scheduled Time</span>
                <span className="detail-value">{formatDateTime(selectedTrip.scheduled_datetime)}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Trip Status</span>
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
                <span className="detail-label">Distance Travelled</span>
                <span className="detail-value">
                  {selectedTrip.distance_km ? `${selectedTrip.distance_km} km` : '—'}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Total Trip Fare</span>
                <span className="detail-value" style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
                  {formatMoney(selectedTrip.total_fare || 0)}
                </span>
              </div>
            </div>

            {selectedTrip.last_known_location && (
              <div className="info-card-banner" style={{ marginTop: 'var(--space-2)' }}>
                <div>
                  <h3>Last Known Telemetry Position</h3>
                  <p>
                    Latitude: {selectedTrip.last_known_location.latitude}, Longitude:{' '}
                    {selectedTrip.last_known_location.longitude} (
                    {formatDateTime(selectedTrip.last_known_location.timestamp)})
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
