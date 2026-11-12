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
import StatCard from '../../components/common/StatCard';
import {
  PlusIcon,
  BusIcon,
  ClockIcon,
  CalendarIcon,
  UsersIcon,
  CheckCircleIcon,
} from '../../components/common/Icons';
import { VehiclePlate } from '../../components/common/SignatureDesign';
import { formatDate } from '../../utils/formatters';
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

  // Helper to compute estimated arrival time (+3 hours standard duration)
  const getArrivalTime = (departureStr) => {
    if (!departureStr) return '—';
    try {
      const dep = new Date(departureStr);
      if (isNaN(dep.getTime())) return '—';
      const arr = new Date(dep.getTime() + 3 * 60 * 60 * 1000);
      return arr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  // Top Summary Cards metrics
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const schedulesList = data || [];
  const todaysSchedules = schedulesList.filter((s) => s.departure_datetime?.startsWith(todayStr)).length;
  const upcomingSchedules = schedulesList.filter((s) => new Date(s.departure_datetime) >= now && s.status !== 'CANCELLED').length;
  const totalSeats = schedulesList.reduce((acc, s) => acc + (s.total_seats || 0), 0);
  const bookedSeats = schedulesList.reduce((acc, s) => acc + (s.booked_seats || 0), 0);
  const availableSeats = schedulesList.reduce((acc, s) => acc + (s.available_seats || 0), 0);

  // Exact 11 required columns
  const columns = [
    {
      key: 'id',
      label: 'Schedule ID',
      width: '130px',
      minWidth: '110px',
      render: (s) => (
        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
          #SCH-{String(s.id).padStart(4, '0')}
        </span>
      ),
    },
    {
      key: 'vehicle',
      label: 'Bus Number',
      width: '160px',
      minWidth: '140px',
      render: (s) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <VehiclePlate registrationNumber={s.vehicle_registration} size="sm" />
        </div>
      ),
    },
    {
      key: 'route',
      label: 'Route',
      minWidth: '170px',
      render: (s) => (
        <span style={{ fontWeight: 500 }}>
          {s.source} <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>→</span> {s.destination}
        </span>
      ),
    },
    {
      key: 'departure_date',
      label: 'Departure Date',
      minWidth: '130px',
      render: (s) => formatDate(s.departure_datetime),
    },
    {
      key: 'departure_time',
      label: 'Departure Time',
      minWidth: '120px',
      render: (s) => (
        <span style={{ fontWeight: 600 }}>
          {s.departure_datetime
            ? new Date(s.departure_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—'}
        </span>
      ),
    },
    {
      key: 'arrival_time',
      label: 'Arrival Time',
      minWidth: '120px',
      render: (s) => (
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {getArrivalTime(s.departure_datetime)}
        </span>
      ),
    },
    {
      key: 'total_seats',
      label: 'Total Seats',
      align: 'center',
      minWidth: '100px',
      render: (s) => <strong>{s.total_seats || 0}</strong>,
    },
    {
      key: 'booked_seats',
      label: 'Booked Seats',
      align: 'center',
      minWidth: '110px',
      render: (s) => (
        <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          {s.booked_seats || 0}
        </span>
      ),
    },
    {
      key: 'available_seats',
      label: 'Available Seats',
      align: 'center',
      minWidth: '120px',
      render: (s) => (
        <span
          style={{
            color: (s.available_seats || 0) > 0 ? 'var(--status-green-text, #16a34a)' : 'var(--status-red-text, #dc2626)',
            fontWeight: 700,
          }}
        >
          {s.available_seats || 0}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Booking Status',
      minWidth: '120px',
      render: (s) => <Badge status={s.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      minWidth: '110px',
      render: (s) => (
        <div className="admin-action-btn-group" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
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
        subtitle="Manage intercity scheduled bus departures, ticketing, and occupancy tracking."
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

      {/* Top Summary Cards */}
      <div className="dashboard-stats-grid" style={{ marginBottom: '20px' }}>
        <StatCard
          title="Today's Schedules"
          value={todaysSchedules}
          icon={<ClockIcon size={24} />}
          iconBg="var(--blue-50)"
          iconColor="var(--primary)"
          description="Departing today"
        />
        <StatCard
          title="Upcoming Schedules"
          value={upcomingSchedules}
          icon={<CalendarIcon size={24} />}
          iconBg="var(--blue-100)"
          iconColor="var(--cyan-600)"
          description="Future active journeys"
        />
        <StatCard
          title="Total Seats"
          value={totalSeats}
          icon={<BusIcon size={24} />}
          iconBg="var(--purple-50, #f3e8ff)"
          iconColor="var(--purple-600, #9333ea)"
          description="Total fleet capacity"
        />
        <StatCard
          title="Booked Seats"
          value={bookedSeats}
          icon={<UsersIcon size={24} />}
          iconBg="var(--warning-bg)"
          iconColor="var(--amber-500)"
          description="Reserved passenger seats"
        />
        <StatCard
          title="Available Seats"
          value={availableSeats}
          icon={<CheckCircleIcon size={24} />}
          iconBg="var(--success-bg)"
          iconColor="var(--success)"
          description="Open for booking"
        />
      </div>

      <div className="info-card-banner" style={{ marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>Booking Cutoff Policy (10 Hours Before Departure)</h3>
          <p style={{ margin: 0, fontSize: '13px' }}>
            Passengers can reserve seats up to 10 hours prior to departure. If the minimum required passenger quota is not reached by the deadline, trips are automatically flagged for cancellation and refunds.
          </p>
        </div>
      </div>

      <div className="bus-schedules-table-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
                { value: 'EXPIRED', label: 'Expired' },
                { value: 'CANCELLED', label: 'Cancelled' },
                { value: 'COMPLETED', label: 'Completed' },
              ],
              onChange: (val) => setFilter('status', val),
            },
          ]}
        />
      </div>

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
