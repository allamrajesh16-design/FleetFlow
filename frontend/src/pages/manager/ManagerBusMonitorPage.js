import React, { useState, useEffect, useMemo, useContext } from 'react';
import useApiList from '../../hooks/useApiList';
import useRenderGuard from '../../hooks/useRenderGuard';
import { ToastContext } from '../../context/ToastContext';
import { createBusScheduleApi, listVehiclesApi } from '../../api/adminManager';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import FormModal from '../../components/common/FormModal';
import { BusIcon, AlertCircleIcon, PlusIcon } from '../../components/common/Icons';
import { Select, TextInput, DateTimeInput, NumberInput } from '../../components/forms';
import { formatDateTime } from '../../utils/formatters';
import '../admin/AdminPages.css';
import './ManagerPages.css';

// Helper to format countdown duration from a stored deadline timestamp and current time
function getRemainingTime(deadlineStr, currentTime) {
  if (!deadlineStr) return { text: '—', isExpired: false, isWarning: false };
  const deadline = new Date(deadlineStr).getTime();
  const diff = deadline - (currentTime || Date.now());

  if (diff <= 0) {
    return { text: 'Cutoff Reached', isExpired: true, isWarning: false };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours < 4) {
    return {
      text: `${hours}h ${minutes}m ${seconds}s left`,
      isExpired: false,
      isWarning: true,
    };
  }
  return {
    text: `${hours}h ${minutes}m remaining`,
    isExpired: false,
    isWarning: false,
  };
}

export default function ManagerBusMonitorPage() {
  useRenderGuard('ManagerBusMonitorPage');

  const {
    rows,
    count,
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
    pageSize: 10,
  });

  const toastContext = useContext(ToastContext);
  const toast = toastContext || {
    success: (m) => console.log(m),
    error: (m) => console.error(m),
    warning: (m) => console.warn(m),
  };

  const [buses, setBuses] = useState([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
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
        const list = res?.results || res;
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

  const handleSaveAdd = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
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

  // Single shared 1-second countdown timer for all cards
  // Pauses automatically when tab is hidden to save CPU
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        setNow(Date.now());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const columns = useMemo(() => [
    {
      key: 'vehicle',
      label: 'Bus No.',
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
        <div>
          <span style={{ fontWeight: 'var(--font-weight-medium)' }}>
            {s.source} <span style={{ color: 'var(--color-primary)' }}>→</span> {s.destination}
          </span>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Departure: {formatDateTime(s.departure_datetime)}
          </div>
        </div>
      ),
    },
    {
      key: 'passengers',
      label: 'Passengers / Seats',
      render: (s) => {
        const booked = s.booked_seats || 0;
        const total = s.total_seats || 1;
        const minReq = s.min_passengers || 0;
        const percent = Math.min(100, Math.round((booked / total) * 100));
        const underMin = booked < minReq;

        return (
          <div className="bus-capacity-bar-container">
            <div className="bus-capacity-bar-track">
              <div
                className="bus-capacity-bar-fill"
                style={{
                  width: `${percent}%`,
                  background: underMin ? 'var(--status-orange-text)' : 'var(--status-green-text)',
                }}
              />
            </div>
            <div className="bus-capacity-bar-text">
              <span style={{ fontWeight: underMin ? 'bold' : 'normal', color: underMin ? 'var(--status-orange-text)' : 'inherit' }}>
                {booked} / {total} Booked
              </span>
              <span>Min: {minReq}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'deadline',
      label: 'Booking Deadline (Cutoff)',
      render: (s) => {
        const countdown = getRemainingTime(s.booking_deadline, now);
        return (
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: '3px' }}>
              {formatDateTime(s.booking_deadline)}
            </div>
            <span
              className={`countdown-tag ${
                countdown.isExpired ? 'expired' : countdown.isWarning ? 'warning' : ''
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" className="countdown-ring-svg" aria-hidden="true">
                <circle cx="10" cy="10" r="8" className="countdown-ring-bg" />
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  className="countdown-ring-progress"
                  stroke={countdown.isExpired ? 'var(--danger)' : countdown.isWarning ? 'var(--amber-500)' : 'var(--success)'}
                  strokeDasharray="50.2"
                  strokeDashoffset={countdown.isExpired ? 50.2 : countdown.isWarning ? 35 : 12}
                />
              </svg>
              {countdown.text}
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (s) => {
        const booked = s.booked_seats || 0;
        const minReq = s.min_passengers || 0;
        if (s.status === 'EXPIRED') return <Badge status="EXPIRED" label="Expired" />;
        if (s.status === 'CONFIRMED') return <Badge status="CONFIRMED" />;
        if (s.status === 'CANCELLED') return <Badge status="CANCELLED" />;
        if (s.status === 'COMPLETED') return <Badge status="COMPLETED" />;

        if (booked >= minReq) {
          return <Badge status="CONFIRMED" label="Quota Reached" />;
        }
        return <Badge status="PENDING" label="Under Quota" />;
      },
    },
  ], [now]);

  const filterOptions = useMemo(() => [
    {
      key: 'status',
      label: 'All Status',
      value: filters?.status || '',
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
  ], [filters?.status, setFilter]);

  return (
    <div className="admin-page-container fade-in">
      <div className="admin-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1>Bus Passenger Monitor</h1>
          <p>Real-time passenger quota tracking, countdown timers, and minimum passenger rule enforcement</p>
        </div>
        <Button
          type="button"
          variant="primary"
          icon={<PlusIcon size={18} />}
          onClick={handleOpenAdd}
        >
          Schedule Bus
        </Button>
      </div>

      {/* Prominent Info Card Banner */}
      <div className="info-card-banner">
        <div style={{ marginTop: '2px' }}>
          <AlertCircleIcon size={24} />
        </div>
        <div>
          <h3>Booking Deadline: 10 Hours Before Departure</h3>
          <p>
            If minimum passengers are not reached, trip will be cancelled and customers will be notified. All affected bookings will be processed for immediate fare refund.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        searchPlaceholder="Search bus registration, source, destination..."
        search={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={totalPages}
        count={count}
        onPageChange={setPage}
        filters={filterOptions}
      />

      {/* Schedule Bus Modal */}
      <FormModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Schedule New Bus Departure"
        onSubmit={handleSaveAdd}
        submitLabel="Schedule Departure"
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
    </div>
  );
}
