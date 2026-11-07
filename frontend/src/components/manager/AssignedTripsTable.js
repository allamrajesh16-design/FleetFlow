import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { listTripsApi, cancelTripApi } from '../../api/adminManager';
import DataTable from '../common/DataTable';
import Button from '../common/Button';
import { useToast } from '../../context/ToastContext';
import { VehiclePlate, StatusDot, DriverChip, RouteLine } from '../common/SignatureDesign';
import { formatDateTime, formatPlaceName } from '../../utils/formatters';

export default function AssignedTripsTable({
  refreshKey = 0,
  title = 'Recent Trip Assignments',
  subtitle = 'Overview of trips dispatched and assigned to drivers',
  pageSize = 10,
  showCardWrapper = true,
  onTripCancelled,
}) {
  const toast = useToast();
  const [trips, setTrips] = useState([]);
  const [cancellingId, setCancellingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchTrips = useCallback(async (currentPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: currentPage,
        page_size: pageSize,
        ordering: '-created_at',
      };
      if (search.trim()) {
        params.search = search.trim();
      }
      if (statusFilter && statusFilter !== 'ALL') {
        params.status = statusFilter;
      }

      const res = await listTripsApi(params);
      const results = res?.results || (Array.isArray(res) ? res : []);
      const count = res?.count ?? results.length;

      setTrips(results);
      setTotalCount(count);
      setPage(currentPage);
    } catch (err) {
      console.error('Failed to fetch assigned trips', err);
      setError('Unable to load assigned trips log.');
    } finally {
      setLoading(false);
    }
  }, [pageSize, search, statusFilter]);

  useEffect(() => {
    fetchTrips(1);
  }, [fetchTrips, refreshKey]);

  const handleCancelTrip = useCallback(
    async (tripId) => {
      if (
        !window.confirm(
          `Are you sure you want to cancel Trip #${tripId}? This will free the assigned vehicle and driver.`
        )
      ) {
        return;
      }
      setCancellingId(tripId);
      try {
        await cancelTripApi(tripId);
        toast.success(`Trip #${tripId} has been cancelled.`);
        fetchTrips(page);
        if (onTripCancelled) onTripCancelled();
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to cancel trip.');
      } finally {
        setCancellingId(null);
      }
    },
    [fetchTrips, onTripCancelled, page, toast]
  );

  const columns = useMemo(
    () => [
      {
        key: 'id',
        label: 'Trip ID',
        width: '80px',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
              #{item.id}
            </span>
          );
        },
      },
      {
        key: 'driver',
        label: 'Driver',
        width: '220px',
        render: (value, t) => {
          const item = t || value || {};
          const driverName = item.driver_name || 'Driver';
          const driverLic = item.driver_license;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <DriverChip
                name={driverName}
                status={item.status === 'IN_PROGRESS' ? 'on_trip' : 'free'}
                size="sm"
                showName={false}
              />
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={driverName}
                >
                  {driverName}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs, 12px)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  Lic: {driverLic || '—'}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        key: 'vehicle',
        label: 'Vehicle',
        width: '190px',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <div>
              <VehiclePlate registrationNumber={item.vehicle_registration || '—'} size="sm" />
              <div
                style={{
                  fontSize: 'var(--font-size-xs, 12px)',
                  color: 'var(--color-text-muted)',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.vehicle_brand_model || item.vehicle_type || 'Vehicle'}
              </div>
            </div>
          );
        },
      },
      {
        key: 'route',
        label: 'Route',
        width: '260px',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <div style={{ width: '100%', maxWidth: '240px' }}>
              <RouteLine
                source={formatPlaceName(item.source || 'Origin')}
                destination={formatPlaceName(item.destination || 'Destination')}
                compact
              />
            </div>
          );
        },
      },
      {
        key: 'scheduled',
        label: 'Scheduled',
        width: '150px',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <span style={{ whiteSpace: 'nowrap', fontSize: 'var(--font-size-xs, 12px)' }}>
              {item.scheduled_datetime ? formatDateTime(item.scheduled_datetime) : 'Immediate'}
            </span>
          );
        },
      },
      {
        key: 'status',
        label: 'Status',
        width: '120px',
        render: (value, t) => {
          const item = t || value || {};
          return <StatusDot status={item.status} label={item.status?.replace('_', ' ')} />;
        },
      },
      {
        key: 'actions',
        label: 'Actions',
        width: '120px',
        align: 'right',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
              <Link
                to={`/manager/trips?search=${item.id}`}
                className="btn btn-ghost btn-sm"
                style={{ textDecoration: 'none', whiteSpace: 'nowrap', padding: '4px 8px', fontSize: 'var(--font-size-xs)' }}
              >
                View
              </Link>
              {item.status === 'SCHEDULED' && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={cancellingId === item.id}
                  loading={cancellingId === item.id}
                  onClick={() => handleCancelTrip(item.id)}
                  style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', whiteSpace: 'nowrap' }}
                >
                  Cancel
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [cancellingId, handleCancelTrip]
  );

  const filters = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        value: statusFilter,
        options: [
          { value: 'ALL', label: 'All Statuses' },
          { value: 'SCHEDULED', label: 'Scheduled' },
          { value: 'IN_PROGRESS', label: 'In Progress' },
          { value: 'COMPLETED', label: 'Completed' },
          { value: 'CANCELLED', label: 'Cancelled' },
        ],
        onChange: (val) => setStatusFilter(val),
      },
    ],
    [statusFilter]
  );

  const content = (
    <DataTable
      columns={columns}
      data={trips}
      loading={loading}
      error={error}
      onRetry={() => fetchTrips(page)}
      keyField="id"
      search={search}
      onSearchChange={(val) => setSearch(val)}
      searchPlaceholder="Search assigned driver, vehicle or route..."
      filters={filters}
      page={page}
      pageSize={pageSize}
      totalCount={totalCount}
      onPageChange={(p) => fetchTrips(p)}
      viewMode="auto"
      enableViewSwitch={false}
      emptyTitle="No Assigned Trips Found"
      emptyDescription="No trips have been assigned matching your filter criteria."
    />
  );

  if (!showCardWrapper) {
    return content;
  }

  return (
    <div className="admin-card card-accent-top assigned-trips-card" style={{ marginTop: 'var(--space-6)' }}>
      <div className="admin-card-header">
        <div>
          <h2 className="admin-card-title">{title}</h2>
          <span className="admin-card-subtitle">{subtitle}</span>
        </div>
        <Link to="/manager/trips" className="btn btn-outline btn-sm">
          Live Trips Map →
        </Link>
      </div>
      <div className="assigned-trips-table-wrapper" style={{ padding: 'var(--space-2) var(--space-4) var(--space-4)' }}>
        {content}
      </div>
    </div>
  );
}
