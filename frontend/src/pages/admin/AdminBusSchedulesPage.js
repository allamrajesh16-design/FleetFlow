import React, { useState, useEffect } from 'react';
import useApiList from '../../hooks/useApiList';
import {
  createBusScheduleApi,
  updateBusScheduleApi,
  deleteBusScheduleApi,
  listVehiclesApi,
} from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import FormModal from '../../components/common/FormModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { PlusIcon, BusIcon } from '../../components/common/Icons';
import { formatMoney, formatDateTime } from '../../utils/formatters';
import { Select, TextInput, DateTimeInput, NumberInput } from '../../components/forms';
import './AdminPages.css';

export default function AdminBusSchedulesPage() {
  const toast = useToast();

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
    endpoint: '/bus-schedules/',
    initialFilters: { status: '' },
  });

  const [buses, setBuses] = useState([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [deletingSchedule, setDeletingSchedule] = useState(null);

  const initialForm = {
    vehicle: '',
    source: '',
    destination: '',
    departure_datetime: '',
    fare_per_seat: '',
  };

  const [formData, setFormData] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listVehiclesApi({ vehicle_type: 'BUS', page_size: 100 })
      .then((res) => {
        const list = res.results || res;
        setBuses(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, []);

  const handleOpenAdd = () => {
    setFormData({
      ...initialForm,
      vehicle: buses[0]?.id || '',
    });
    setFieldErrors({});
    setIsAddOpen(true);
  };

  const handleOpenEdit = (s) => {
    setEditingSchedule(s);
    setFormData({
      vehicle: s.vehicle,
      source: s.source,
      destination: s.destination,
      departure_datetime: s.departure_datetime ? s.departure_datetime.substring(0, 16) : '',
      fare_per_seat: s.fare_per_seat,
    });
    setFieldErrors({});
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      await createBusScheduleApi(formData);
      toast.success(`Bus schedule for "${formData.source} → ${formData.destination}" created.`);
      setIsAddOpen(false);
      refresh();
    } catch (err) {
      const errors = err?.response?.data || {};
      if (typeof errors === 'object') {
        setFieldErrors(errors);
      }
      toast.error(errors.detail || errors.non_field_errors?.[0] || 'Failed to create bus schedule.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingSchedule) return;
    setSubmitting(true);
    setFieldErrors({});
    try {
      await updateBusScheduleApi(editingSchedule.id, formData);
      toast.success('Bus schedule updated successfully.');
      setEditingSchedule(null);
      refresh();
    } catch (err) {
      const errors = err?.response?.data || {};
      if (typeof errors === 'object') {
        setFieldErrors(errors);
      }
      toast.error(errors.detail || errors.non_field_errors?.[0] || 'Failed to update bus schedule.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingSchedule) return;
    try {
      await deleteBusScheduleApi(deletingSchedule.id);
      toast.success('Bus schedule deleted successfully.');
      setDeletingSchedule(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete bus schedule.');
    }
  };

  const columns = [
    {
      key: 'vehicle',
      label: 'Bus',
      render: (s) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <BusIcon size={18} color="var(--color-primary)" />
          <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{s.vehicle_registration}</span>
        </div>
      ),
    },
    {
      key: 'route',
      label: 'Route',
      render: (s) => (
        <span style={{ fontWeight: 'var(--font-weight-medium)' }}>
          {s.source} <span style={{ color: 'var(--color-primary)' }}>→</span> {s.destination}
        </span>
      ),
    },
    {
      key: 'departure_datetime',
      label: 'Departure & Deadline',
      render: (s) => (
        <div>
          <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{formatDateTime(s.departure_datetime)}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Cutoff: {formatDateTime(s.booking_deadline)}
          </div>
        </div>
      ),
    },
    {
      key: 'occupancy',
      label: 'Occupancy / Minimum',
      render: (s) => {
        const total = s.total_seats || 1;
        const booked = s.booked_seats || 0;
        const minReq = s.min_passengers || 0;
        const percent = Math.min(100, Math.round((booked / total) * 100));
        const meetsMin = booked >= minReq;

        return (
          <div className="bus-capacity-bar-container">
            <div className="bus-capacity-bar-track">
              <div
                className="bus-capacity-bar-fill"
                style={{
                  width: `${percent}%`,
                  background: meetsMin ? 'var(--status-green-text)' : 'var(--status-orange-text)',
                }}
              />
            </div>
            <div className="bus-capacity-bar-text">
              <span>{booked} / {total} Seats</span>
              <span>Min: {minReq}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'fare_per_seat',
      label: 'Fare / Seat',
      render: (s) => (
        <span style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary)' }}>
          {formatMoney(s.fare_per_seat)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (s) => <Badge status={s.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (s) => (
        <div className="admin-action-btn-group" style={{ display: 'flex', gap: '6px' }}>
          <IconButton
            action="edit"
            tooltip="Edit Schedule"
            ariaLabel="Edit Schedule"
            onClick={() => handleOpenEdit(s)}
          />
          <IconButton
            action="delete"
            tooltip="Delete Schedule"
            ariaLabel="Delete Schedule"
            onClick={() => setDeletingSchedule(s)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Bus Schedules"
        subtitle="Schedule intercity bus departures, set ticket fares, and monitor seat occupancy"
        actions={
          <Button
            variant="primary"
            icon={<PlusIcon size={18} />}
            onClick={handleOpenAdd}
          >
            New Schedule
          </Button>
        }
      />

      <div className="info-card-banner">
        <div>
          <h3>Booking Cutoff Policy (10 Hours Before Departure)</h3>
          <p>
            Passengers can reserve seats up to 10 hours prior to departure. If the minimum required passenger quota is not reached by the deadline, trips are automatically flagged for cancellation and refunds.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={refresh}
        searchPlaceholder="Search by route, bus registration..."
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
              { value: 'OPEN', label: 'Open' },
              { value: 'CONFIRMED', label: 'Confirmed' },
              { value: 'CANCELLED', label: 'Cancelled' },
              { value: 'COMPLETED', label: 'Completed' },
            ],
            onChange: (val) => setFilter('status', val),
          },
        ]}
      />

      {/* Add / Edit Bus Schedule Modal */}
      <FormModal
        isOpen={isAddOpen || Boolean(editingSchedule)}
        onClose={() => {
          setIsAddOpen(false);
          setEditingSchedule(null);
        }}
        title={editingSchedule ? 'Edit Bus Schedule' : 'Schedule New Bus Departure'}
        onSubmit={editingSchedule ? handleSaveEdit : handleSaveAdd}
        submitLabel={editingSchedule ? 'Save Changes' : 'Schedule Departure'}
        loading={submitting}
      >
        <Select
          label="Select Bus"
          required
          value={formData.vehicle}
          onChange={(e) => setFormData({ ...formData, vehicle: e.target.value })}
          error={fieldErrors.vehicle}
          placeholder="Select an available bus"
          options={buses.map((b) => ({
            value: b.id,
            label: `${b.registration_number} - ${b.brand} ${b.model} (${b.seating_capacity} Seats)`,
          }))}
        />

        <div className="form-grid-2">
          <TextInput
            label="Origin / Source"
            required
            placeholder="e.g. Kakinada"
            value={formData.source}
            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
            error={fieldErrors.source}
          />

          <TextInput
            label="Destination"
            required
            placeholder="e.g. Rajahmundry"
            value={formData.destination}
            onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
            error={fieldErrors.destination}
          />
        </div>

        <div className="form-grid-2">
          <DateTimeInput
            label="Departure Date & Time"
            required
            value={formData.departure_datetime}
            onChange={(e) => setFormData({ ...formData, departure_datetime: e.target.value })}
            error={fieldErrors.departure_datetime}
          />

          <NumberInput
            label="Fare Per Seat (₹)"
            required
            step="0.01"
            min={0}
            placeholder="e.g. 150.00"
            value={formData.fare_per_seat}
            onChange={(e) => setFormData({ ...formData, fare_per_seat: e.target.value })}
            error={fieldErrors.fare_per_seat}
          />
        </div>
      </FormModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingSchedule)}
        onClose={() => setDeletingSchedule(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Bus Schedule"
        message={`Are you sure you want to delete the schedule for ${deletingSchedule?.source} → ${deletingSchedule?.destination}?`}
        confirmLabel="Delete Schedule"
        isDanger={true}
      />
    </div>
  );
}
