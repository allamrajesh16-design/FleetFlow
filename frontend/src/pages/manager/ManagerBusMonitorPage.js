import React, { useState, useEffect, useMemo } from 'react';
import useApiList from '../../hooks/useApiList';
import useRenderGuard from '../../hooks/useRenderGuard';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import { BusIcon, AlertCircleIcon } from '../../components/common/Icons';
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
        { value: 'CANCELLED', label: 'Cancelled' },
        { value: 'COMPLETED', label: 'Completed' },
      ],
      onChange: (val) => setFilter('status', val),
    },
  ], [filters?.status, setFilter]);

  return (
    <div className="admin-page-container fade-in">
      <div className="admin-header-row">
        <div>
          <h1>Bus Passenger Monitor</h1>
          <p>Real-time passenger quota tracking, countdown timers, and minimum passenger rule enforcement</p>
        </div>
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
    </div>
  );
}
