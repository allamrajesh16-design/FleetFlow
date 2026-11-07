import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import useApiList from '../../hooks/useApiList';
import { approveBookingApi, rejectBookingApi } from '../../api/adminManager';
import apiClient from '../../api/client';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import ViewSwitch from '../../components/common/ViewSwitch';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatMoney, formatDateTime } from '../../utils/formatters';
import './AdminPages.css';

export default function AdminBookingsPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const openId = searchParams.get('open');

  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('fleetflow_view_bookings') || 'table'
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
    endpoint: '/bookings/',
    initialFilters: { status: '' },
  });

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [rejectingBooking, setRejectingBooking] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!openId) return;
    const found = data.find((b) => String(b.id) === String(openId));
    if (found) {
      setSelectedBooking(found);
    } else {
      apiClient
        .get(`/bookings/${openId}/`)
        .then((res) => {
          if (res.data) setSelectedBooking(res.data);
        })
        .catch(() => {});
    }
  }, [openId, data]);

  const handleApprove = async (bkg) => {
    setActionLoading(true);
    try {
      await approveBookingApi(bkg.id);
      toast.success(`Booking BKG-${String(bkg.id).padStart(4, '0')} approved.`);
      setSelectedBooking(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to approve booking.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async (reason) => {
    const finalReason = typeof reason === 'string' ? reason : rejectReason;
    if (!rejectingBooking) return;
    if (!finalReason || !finalReason.trim()) {
      toast.error('Please provide a reason for rejecting the booking.');
      return;
    }
    setActionLoading(true);
    try {
      await rejectBookingApi(rejectingBooking.id, finalReason.trim());
      toast.success(`Booking BKG-${String(rejectingBooking.id).padStart(4, '0')} rejected.`);
      setRejectingBooking(null);
      setRejectReason('');
      setSelectedBooking(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reject booking.');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      key: 'customer',
      label: 'Customer',
      width: '260px',
      minWidth: '220px',
      render: (b) => (
        <div>
          <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{b.customer_name || 'Passenger'}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            BKG-{String(b.id).padStart(4, '0')} • {b.customer_email}
          </div>
        </div>
      ),
    },
    {
      key: 'vehicle_type',
      label: 'Vehicle Type',
      width: '120px',
      minWidth: '100px',
      render: (b) => (
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-semibold)',
            background: b.vehicle_type === 'BUS' ? 'var(--blue-50)' : 'var(--success-bg)',
            color: b.vehicle_type === 'BUS' ? 'var(--blue-700)' : 'var(--success-text)',
          }}
        >
          {b.vehicle_type}
        </span>
      ),
    },
    {
      key: 'travel_datetime',
      label: 'Date & Time',
      width: '180px',
      minWidth: '160px',
      render: (b) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {formatDateTime(b.travel_datetime)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      minWidth: '100px',
      render: (b) => <Badge status={b.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '100px',
      minWidth: '80px',
      align: 'right',
      render: (b) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <IconButton
            action="view"
            tooltip="View Booking Details"
            ariaLabel="View Booking Details"
            onClick={() => setSelectedBooking(b)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Booking Management"
        subtitle="Review customer reservations, route departures, and verify booking status"
        actions={
          <ViewSwitch
            view={viewMode}
            onChange={setViewMode}
            storageKey="fleetflow_view_bookings"
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
        searchPlaceholder="Search customer, email, location..."
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
              { value: 'PENDING', label: 'Pending' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'CONFIRMED', label: 'Confirmed' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
            onChange: (val) => setFilter('status', val),
          },
        ]}
      />

      {/* Booking Details Modal / Side Drawer */}
      <Modal
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        title={`Booking Details: BKG-${String(selectedBooking?.id || '').padStart(4, '0')}`}
        size="medium"
      >
        {selectedBooking && (
          <div>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Customer</span>
                <span className="detail-value">{selectedBooking.customer_name}</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  {selectedBooking.customer_email}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Current Status</span>
                <div>
                  <Badge status={selectedBooking.status} />
                </div>
              </div>

              <div className="detail-item">
                <span className="detail-label">Pickup Location</span>
                <span className="detail-value">{selectedBooking.pickup_location || '—'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Drop Location</span>
                <span className="detail-value">{selectedBooking.drop_location || '—'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Scheduled Date & Time</span>
                <span className="detail-value">{formatDateTime(selectedBooking.travel_datetime)}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Booking Type</span>
                <span className="detail-value">
                  {selectedBooking.booking_type === 'BUS_SEAT' ? 'Bus Seat Reservation' : 'Dedicated Vehicle'}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Passengers</span>
                <span className="detail-value">{selectedBooking.passengers} Passenger(s)</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Vehicle Assigned</span>
                <span className="detail-value">{selectedBooking.vehicle_registration || 'Pending Assignment'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Estimated Fare</span>
                <span className="detail-value" style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
                  {selectedBooking.estimated_fare !== null && selectedBooking.estimated_fare !== undefined
                    ? formatMoney(selectedBooking.estimated_fare)
                    : '-'}
                </span>
              </div>

              {selectedBooking.final_fare && (
                <div className="detail-item">
                  <span className="detail-label">Final Fare</span>
                  <span className="detail-value" style={{ color: 'var(--status-green-text)', fontWeight: 'bold' }}>
                    {formatMoney(selectedBooking.final_fare)}
                  </span>
                </div>
              )}
            </div>

            {selectedBooking.rejection_reason && (
              <div className="info-card-banner info-card-warning" style={{ marginBottom: 'var(--space-4)' }}>
                <div>
                  <h3>Rejection Reason</h3>
                  <p>{selectedBooking.rejection_reason}</p>
                </div>
              </div>
            )}

            {/* Approval / Rejection Action Buttons if PENDING */}
            {selectedBooking.status === 'PENDING' && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 'var(--space-3)',
                  paddingTop: 'var(--space-4)',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <Button
                  type="button"
                  variant="danger"
                  disabled={actionLoading}
                  onClick={() => setRejectingBooking(selectedBooking)}
                >
                  Reject Booking
                </Button>
                <Button
                  type="button"
                  variant="success"
                  loading={actionLoading}
                  disabled={actionLoading}
                  onClick={() => handleApprove(selectedBooking)}
                >
                  Approve Booking
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Reject Reason Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(rejectingBooking)}
        onClose={() => setRejectingBooking(null)}
        onConfirm={handleConfirmReject}
        title="Reject Booking"
        message={`State the reason for rejecting booking BKG-${String(rejectingBooking?.id || '').padStart(4, '0')}:`}
        confirmLabel="Confirm Rejection"
        inputLabel="Reason for Rejection"
        inputValue={rejectReason}
        onInputChange={setRejectReason}
        inputRequired={true}
        inputPlaceholder="e.g. Vehicle unavailable or invalid route specification"
        isDanger={true}
      />
    </div>
  );
}
