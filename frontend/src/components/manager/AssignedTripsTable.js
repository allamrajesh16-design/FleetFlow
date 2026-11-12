import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listTripsApi,
  cancelTripApi,
  reassignTripApi,
  listVehiclesApi,
  listDriversApi,
} from '../../api/adminManager';
import DataTable from '../common/DataTable';
import Button from '../common/Button';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import { TextInput, Select } from '../forms';
import { useToast } from '../../context/ToastContext';
import { VehiclePlate, StatusDot, DriverChip } from '../common/SignatureDesign';
import { formatDateTime } from '../../utils/formatters';

export default function AssignedTripsTable({
  refreshKey = 0,
  title = "Assignment History",
  subtitle = "Complete record of driver and vehicle trip assignments",
  pageSize = 10,
  showCardWrapper = true,
  onTripCancelled,
  onTripReassigned,
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelTripTargetId, setCancelTripTargetId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Status counts for grouping tabs
  const [statusCounts, setStatusCounts] = useState({
    SCHEDULED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    ALL: 0,
  });

  // Reassignment Modal State
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignTargetTrip, setReassignTargetTrip] = useState(null);
  const [reassignVehicleId, setReassignVehicleId] = useState('');
  const [reassignDriverId, setReassignDriverId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);

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

      // Fetch status counts for today's board tabs
      try {
        const [schedRes, inProgRes, compRes] = await Promise.all([
          listTripsApi({ status: 'SCHEDULED', page_size: 1 }),
          listTripsApi({ status: 'IN_PROGRESS', page_size: 1 }),
          listTripsApi({ status: 'COMPLETED', page_size: 1 }),
        ]);
        const schedCount = schedRes?.count ?? 0;
        const inProgCount = inProgRes?.count ?? 0;
        const compCount = compRes?.count ?? 0;
        setStatusCounts({
          SCHEDULED: schedCount,
          IN_PROGRESS: inProgCount,
          COMPLETED: compCount,
          ALL: schedCount + inProgCount + compCount,
        });
      } catch {
        // Fallback: count from current results
        const sched = results.filter((t) => t.status === 'SCHEDULED').length;
        const inProg = results.filter((t) => t.status === 'IN_PROGRESS').length;
        const comp = results.filter((t) => t.status === 'COMPLETED').length;
        setStatusCounts({
          SCHEDULED: sched,
          IN_PROGRESS: inProg,
          COMPLETED: comp,
          ALL: results.length,
        });
      }
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

  // Open Reassign Modal
  const handleOpenReassignModal = useCallback(async (trip) => {
    setReassignTargetTrip(trip);
    setReassignVehicleId(trip.vehicle ? String(trip.vehicle) : '');
    setReassignDriverId(trip.driver ? String(trip.driver) : '');
    setReassignReason('');
    setReassignModalOpen(true);
    setLoadingResources(true);

    try {
      const [vRes, dRes] = await Promise.all([
        listVehiclesApi({ page_size: 100 }),
        listDriversApi({ page_size: 100 }),
      ]);
      setAvailableVehicles(vRes?.results || vRes || []);
      setAvailableDrivers(dRes?.results || dRes || []);
    } catch (err) {
      console.error('Failed to load resources for reassignment', err);
      toast.error('Failed to load vehicles or drivers list.');
    } finally {
      setLoadingResources(false);
    }
  }, [toast]);

  // Submit Reassign
  const handleConfirmReassign = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!reassignTargetTrip) return;
    if (!reassignReason.trim()) {
      toast.error('Please enter a reason for reassignment.');
      return;
    }

    setReassignSubmitting(true);
    try {
      const payload = {
        reason: reassignReason.trim(),
      };
      if (reassignVehicleId && Number(reassignVehicleId) !== reassignTargetTrip.vehicle) {
        payload.vehicle_id = Number(reassignVehicleId);
      }
      if (reassignDriverId && Number(reassignDriverId) !== reassignTargetTrip.driver) {
        payload.driver_id = Number(reassignDriverId);
      }

      if (!payload.vehicle_id && !payload.driver_id) {
        toast.info('No changes made to vehicle or driver.');
        setReassignModalOpen(false);
        return;
      }

      await reassignTripApi(reassignTargetTrip.id, payload);
      toast.success(`Trip #${reassignTargetTrip.id} successfully reassigned.`);
      setReassignModalOpen(false);
      fetchTrips(page);
      if (onTripReassigned) onTripReassigned();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to reassign trip. Check resource availability.';
      toast.error(msg);
    } finally {
      setReassignSubmitting(false);
    }
  };

  const handleConfirmCancelTrip = useCallback(async () => {
    if (!cancelTripTargetId) return;
    const tripId = cancelTripTargetId;
    setCancellingId(tripId);
    try {
      await cancelTripApi(tripId, 'Cancelled from Dispatch Board');
      toast.success(`Trip #${tripId} has been cancelled.`);
      setCancelTripTargetId(null);
      fetchTrips(page);
      if (onTripCancelled) onTripCancelled();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel trip.');
    } finally {
      setCancellingId(null);
    }
  }, [cancelTripTargetId, fetchTrips, onTripCancelled, page, toast]);

  const columns = useMemo(
    () => [
      {
        key: 'id',
        label: 'Assignment ID',
        width: '120px',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
              #{item.id}
            </span>
          );
        },
      },
      {
        key: 'booking_id',
        label: 'Booking ID',
        width: '110px',
        render: (value, t) => {
          const item = t || value || {};
          const bkgId = item.booking_id || item.booking;
          const schId = item.bus_schedule_id || item.bus_schedule;
          return (
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {bkgId ? `#B-${bkgId}` : (schId ? `#S-${schId}` : '—')}
            </span>
          );
        },
      },
      {
        key: 'customer',
        label: 'Customer',
        width: '160px',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <div style={{ fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.customer_name || 'Passenger'}
            </div>
          );
        },
      },
      {
        key: 'driver',
        label: 'Driver',
        width: '190px',
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
        width: '170px',
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
        key: 'scheduled',
        label: 'Scheduled Date',
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
        key: 'created_at',
        label: 'Assignment Date',
        width: '150px',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <span style={{ whiteSpace: 'nowrap', fontSize: 'var(--font-size-xs, 12px)', color: 'var(--color-text-muted)' }}>
              {item.created_at ? formatDateTime(item.created_at) : '—'}
            </span>
          );
        },
      },
      {
        key: 'status',
        label: 'Status',
        width: '140px',
        minWidth: '130px',
        render: (value, t) => {
          const item = t || value || {};
          return <StatusDot status={item.status} label={item.status?.replace('_', ' ')} />;
        },
      },
      {
        key: 'actions',
        label: 'Actions',
        width: '280px',
        minWidth: '275px',
        align: 'right',
        render: (value, t) => {
          const item = t || value || {};
          return (
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0, minWidth: '260px' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/manager/assignments/${item.id}`)}
                style={{ whiteSpace: 'nowrap', padding: '4px 8px', fontSize: 'var(--font-size-xs)' }}
              >
                View Assignment
              </Button>
              {item.status === 'SCHEDULED' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenReassignModal(item)}
                    style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', whiteSpace: 'nowrap' }}
                  >
                    Reassign
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={cancellingId === item.id}
                    loading={cancellingId === item.id}
                    onClick={() => setCancelTripTargetId(item.id)}
                    style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', whiteSpace: 'nowrap' }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [cancellingId, handleOpenReassignModal, navigate]
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
    <div>
      {/* Status Grouping Filter Bar */}
      <div
        className="dispatch-board-status-tabs"
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '14px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Button
          variant={statusFilter === 'ALL' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setStatusFilter('ALL')}
          style={{ borderRadius: '20px' }}
        >
          All
        </Button>
        <Button
          variant={statusFilter === 'SCHEDULED' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setStatusFilter('SCHEDULED')}
          style={{ borderRadius: '20px' }}
        >
          Scheduled ({statusCounts.SCHEDULED})
        </Button>
        <Button
          variant={statusFilter === 'IN_PROGRESS' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setStatusFilter('IN_PROGRESS')}
          style={{ borderRadius: '20px' }}
        >
          In progress ({statusCounts.IN_PROGRESS})
        </Button>
        <Button
          variant={statusFilter === 'COMPLETED' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setStatusFilter('COMPLETED')}
          style={{ borderRadius: '20px' }}
        >
          Completed today ({statusCounts.COMPLETED})
        </Button>
      </div>

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
        emptyTitle="No Trips in Dispatch Board"
        emptyDescription="No trips found for the selected status filter."
      />
    </div>
  );

  const confirmDialogElement = (
    <ConfirmDialog
      isOpen={Boolean(cancelTripTargetId)}
      onClose={() => !cancellingId && setCancelTripTargetId(null)}
      onConfirm={handleConfirmCancelTrip}
      title="Cancel Trip"
      message={`Cancel Trip #${cancelTripTargetId}? This will free the assigned vehicle and driver.`}
      confirmLabel="Cancel Trip"
      cancelLabel="Keep Trip"
      confirmVariant="danger"
      loading={Boolean(cancellingId)}
    />
  );

  // Reassign Modal JSX
  const reassignModalElement = reassignTargetTrip && (
    <Modal
      isOpen={reassignModalOpen}
      onClose={() => !reassignSubmitting && setReassignModalOpen(false)}
      title={`Reassign Trip #${reassignTargetTrip.id}`}
      maxWidth="540px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button
            variant="secondary"
            onClick={() => setReassignModalOpen(false)}
            disabled={reassignSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmReassign}
            loading={reassignSubmitting}
            disabled={reassignSubmitting || !reassignReason.trim()}
          >
            Confirm Reassignment
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--color-bg-subtle, #F8FAFC)',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--color-border, #E2E8F0)',
          }}
        >
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            CURRENT ASSIGNMENT
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span>
              <strong>Driver:</strong> {reassignTargetTrip.driver_name || 'Driver'}
            </span>
            <span>
              <strong>Vehicle:</strong> {reassignTargetTrip.vehicle_registration || '—'}
            </span>
          </div>
        </div>

        <Select
          label="Change Vehicle (Optional)"
          value={reassignVehicleId}
          onChange={(e) => setReassignVehicleId(e.target.value)}
          disabled={loadingResources}
          options={[
            { value: '', label: 'Keep current vehicle' },
            ...availableVehicles
              .filter((v) => !reassignTargetTrip?.vehicle_type || v.vehicle_type === reassignTargetTrip.vehicle_type)
              .map((v) => ({
                value: String(v.id),
                label: `${v.registration_number} — ${v.brand} ${v.model} (${v.seating_capacity} seats)`,
              })),
          ]}
        />

        <Select
          label="Change Driver (Optional)"
          value={reassignDriverId}
          onChange={(e) => setReassignDriverId(e.target.value)}
          disabled={loadingResources}
          options={[
            { value: '', label: 'Keep current driver' },
            ...availableDrivers.map((d) => ({
              value: String(d.id),
              label: `${d.user?.full_name || d.name || 'Driver'} (Lic: ${d.license_number})`,
            })),
          ]}
        />

        <TextInput
          label="Reason for Reassignment"
          placeholder="e.g. Driver emergency, vehicle maintenance required..."
          value={reassignReason}
          onChange={(e) => setReassignReason(e.target.value)}
          required
        />
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '-8px' }}>
          * Notifications will be dispatched automatically to the previous driver, new driver, and customer.
        </div>
      </div>
    </Modal>
  );

  if (!showCardWrapper) {
    return (
      <>
        {content}
        {confirmDialogElement}
        {reassignModalElement}
      </>
    );
  }

  return (
    <div className="admin-card card-accent-top assigned-trips-card" style={{ marginTop: 'var(--space-6)' }}>
      <div className="admin-card-header">
        <div>
          <h2 className="admin-card-title">{title}</h2>
          <span className="admin-card-subtitle">{subtitle}</span>
        </div>
      </div>
      <div className="assigned-trips-table-wrapper" style={{ padding: 'var(--space-2) var(--space-4) var(--space-4)' }}>
        {content}
      </div>
      {confirmDialogElement}
      {reassignModalElement}
    </div>
  );
}
