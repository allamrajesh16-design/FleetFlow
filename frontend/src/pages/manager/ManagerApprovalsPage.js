import React, { useState, useMemo } from 'react';
import useApiList from '../../hooks/useApiList';
import useRenderGuard from '../../hooks/useRenderGuard';
import {
  approveBookingApi,
  rejectBookingApi,
  approveUserApi,
  rejectUserApi,
  resendDecisionEmailApi,
} from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/common/DataTable';
import Tabs from '../../components/common/Tabs';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import PageHeader from '../../components/common/PageHeader';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatDateTime } from '../../utils/formatters';
import '../admin/AdminPages.css';
import './ManagerPages.css';

export default function ManagerApprovalsPage() {
  useRenderGuard('ManagerApprovalsPage');
  const { success, error, warning } = useToast();
  const [activeTab, setActiveTab] = useState('bookings');

  // Memoized filter objects so references never change
  const bookingFilters = useMemo(() => ({ status: 'PENDING' }), []);
  const driverFilters = useMemo(() => ({ role: 'DRIVER' }), []);

  // Bookings list (PENDING)
  const bookingsList = useApiList({
    endpoint: '/bookings/',
    initialFilters: bookingFilters,
  });

  // Driver registration list (PENDING DRIVERS)
  const driversList = useApiList({
    endpoint: '/auth/approvals/',
    initialFilters: driverFilters,
  });

  // Action states
  const [approvingItem, setApprovingItem] = useState(null);
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const handleResendEmail = async (userId) => {
    try {
      const res = await resendDecisionEmailApi(userId);
      if (res?.email_sent) {
        success(res.message || 'Decision email sent successfully.');
      } else {
        warning('Decision saved, but the email could not be sent', 8000, {
          label: 'Resend email',
          onClick: () => handleResendEmail(userId),
        });
      }
    } catch (err) {
      error(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to resend decision email.');
    }
  };

  const handleApprove = async () => {
    if (!approvingItem) return;
    const item = approvingItem;
    setActionLoading(true);
    try {
      if (activeTab === 'bookings') {
        await approveBookingApi(item.id);
        success(`Booking BKG-${String(item.id).padStart(4, '0')} approved.`, 6000, {
          label: 'Assign now',
          onClick: () => {
            if (typeof window !== 'undefined') {
              window.location.href = `/manager/assignments?booking=${item.id}`;
            }
          },
        });
        bookingsList.refresh();
      } else {
        const res = await approveUserApi(item.id);
        if (res && res.email_sent === false) {
          warning('Decision saved, but the email could not be sent', 8000, {
            label: 'Resend email',
            onClick: () => handleResendEmail(item.id),
          });
        } else {
          success(`Driver registration for ${item.full_name} approved.`);
        }
        driversList.refresh();
      }
      setApprovingItem(null);
    } catch (err) {
      error(err?.response?.data?.detail || 'Failed to approve item.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingItem) return;
    if (!rejectReason || !rejectReason.trim()) {
      error('Please provide a reason for rejection.');
      return;
    }
    const item = rejectingItem;
    const reason = rejectReason.trim();
    setActionLoading(true);
    try {
      if (activeTab === 'bookings') {
        await rejectBookingApi(item.id, reason);
        success(`Booking BKG-${String(item.id).padStart(4, '0')} rejected.`);
        bookingsList.refresh();
      } else {
        const res = await rejectUserApi(item.id, reason);
        if (res && res.email_sent === false) {
          warning('Decision saved, but the email could not be sent', 8000, {
            label: 'Resend email',
            onClick: () => handleResendEmail(item.id),
          });
        } else {
          success(`Driver registration for ${item.full_name} rejected.`);
        }
        driversList.refresh();
      }
      setRejectingItem(null);
      setRejectReason('');
    } catch (err) {
      error(err?.response?.data?.detail || 'Failed to reject item.');
    } finally {
      setActionLoading(false);
    }
  };

  const bookingColumns = useMemo(
    () => [
      {
        key: 'customer',
        label: 'Customer',
        render: (value, b) => {
          const item = b || value || {};
          const idStr = item.id ? `BKG-${String(item.id).padStart(4, '0')}` : 'Booking';
          const src = item.pickup_location || item.source || '-';
          const dst = item.drop_location || item.destination || '-';
          return (
            <div>
              <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{item.customer_name || 'Customer'}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {idStr} • {src} → {dst}
              </div>
            </div>
          );
        },
      },
      {
        key: 'vehicle_type',
        label: 'Vehicle Type',
        render: (value, b) => {
          const item = b || value || {};
          const vType = item.vehicle_type || 'VEHICLE';
          const isBus = vType === 'BUS';
          return (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                background: isBus ? 'var(--blue-50)' : 'var(--success-bg)',
                color: isBus ? 'var(--blue-700)' : 'var(--success-text)',
              }}
            >
              {vType}
            </span>
          );
        },
      },
      {
        key: 'travel_datetime',
        label: 'Date & Time',
        render: (value, b) => ((b || value)?.travel_datetime ? formatDateTime((b || value).travel_datetime) : '—'),
      },
      {
        key: 'status',
        label: 'Status',
        render: (value, b) => <Badge status={(b || value)?.status || 'PENDING'} />,
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value, b) => {
          const item = b || value || {};
          return (
            <div className="admin-action-btn-group" style={{ display: 'flex', gap: '8px' }}>
              <Button
                type="button"
                size="small"
                variant="success"
                onClick={() => setApprovingItem(item)}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="small"
                variant="danger"
                onClick={() => {
                  setRejectReason('');
                  setRejectingItem(item);
                }}
              >
                Reject
              </Button>
            </div>
          );
        },
      },
    ],
    []
  );

  const driverColumns = useMemo(
    () => [
      {
        key: 'full_name',
        label: 'Driver Name',
        render: (value, u) => {
          const item = u || value || {};
          return (
            <div>
              <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{item.full_name || 'Driver'}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{item.email || '—'}</div>
            </div>
          );
        },
      },
      {
        key: 'phone',
        label: 'Phone',
        render: (value, u) => (u || value)?.phone || '—',
      },
      {
        key: 'created_at',
        label: 'Applied On',
        render: (value, u) => ((u || value)?.created_at ? formatDateTime((u || value).created_at) : '—'),
      },
      {
        key: 'approval_status',
        label: 'Status',
        render: (value, u) => <Badge status={(u || value)?.approval_status || 'PENDING'} />,
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value, u) => {
          const item = u || value || {};
          return (
            <div className="admin-action-btn-group" style={{ display: 'flex', gap: '8px' }}>
              <Button
                type="button"
                size="small"
                variant="success"
                onClick={() => setApprovingItem(item)}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="small"
                variant="danger"
                onClick={() => {
                  setRejectReason('');
                  setRejectingItem(item);
                }}
              >
                Reject
              </Button>
            </div>
          );
        },
      },
    ],
    []
  );

  const tabs = [
    { id: 'bookings', label: 'Vehicle Booking Requests' },
    { id: 'drivers', label: 'Driver Registration Requests' },
  ];

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Pending Approvals"
        subtitle="Review customer ride requests and driver verification requests"
      />

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(tab) => setActiveTab(tab)} />

      {activeTab === 'bookings' ? (
        <DataTable
          columns={bookingColumns}
          data={bookingsList.data}
          loading={bookingsList.loading}
          error={bookingsList.error}
          onRetry={bookingsList.refresh}
          searchPlaceholder="Search booking customer, location..."
          search={bookingsList.search}
          onSearchChange={bookingsList.setSearch}
          page={bookingsList.page}
          totalPages={bookingsList.totalPages}
          count={bookingsList.totalCount}
          onPageChange={bookingsList.setPage}
        />
      ) : (
        <DataTable
          columns={driverColumns}
          data={driversList.data}
          loading={driversList.loading}
          error={driversList.error}
          onRetry={driversList.refresh}
          searchPlaceholder="Search driver applicant..."
          search={driversList.search}
          onSearchChange={driversList.setSearch}
          page={driversList.page}
          totalPages={driversList.totalPages}
          count={driversList.totalCount}
          onPageChange={driversList.setPage}
        />
      )}

      {/* Approve Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(approvingItem)}
        onClose={() => setApprovingItem(null)}
        onConfirm={handleApprove}
        title={activeTab === 'bookings' ? 'Approve Customer Booking' : 'Approve Driver Application'}
        message={
          activeTab === 'bookings'
            ? `Approve booking for ${approvingItem?.customer_name}? Once approved, it can be assigned to an active vehicle and driver.`
            : `Approve driver application for ${approvingItem?.full_name}?`
        }
        confirmLabel="Approve"
        variant="success"
        loading={actionLoading}
      />

      {/* Reject with Reason Dialog */}
      <ConfirmDialog
        isOpen={Boolean(rejectingItem)}
        onClose={() => setRejectingItem(null)}
        onConfirm={handleReject}
        title={activeTab === 'bookings' ? 'Reject Customer Booking' : 'Reject Driver Application'}
        message={`Provide a reason for rejecting this ${activeTab === 'bookings' ? 'booking' : 'application'}:`}
        confirmLabel="Reject"
        inputLabel="Reason for Rejection"
        inputValue={rejectReason}
        onInputChange={setRejectReason}
        inputRequired={true}
        inputPlaceholder="e.g. Incomplete credentials, license expired, or capacity reached"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
