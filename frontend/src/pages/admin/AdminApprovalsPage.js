import React, { useState, useMemo } from 'react';
import useApiList from '../../hooks/useApiList';
import { approveUserApi, rejectUserApi, resendDecisionEmailApi } from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/common/DataTable';
import Tabs from '../../components/common/Tabs';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import PageHeader from '../../components/common/PageHeader';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatDateTime } from '../../utils/formatters';
import './AdminPages.css';

export default function AdminApprovalsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('FLEET_MANAGER');

  const {
    data,
    totalCount,
    totalPages,
    page,
    loading,
    error,
    search,
    setPage,
    setSearch,
    setFilter,
    refresh,
  } = useApiList({
    endpoint: '/auth/approvals/',
    initialFilters: { role: 'FLEET_MANAGER' },
  });

  const [approvingUser, setApprovingUser] = useState(null);
  const [rejectingUser, setRejectingUser] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const handleTabChange = (role) => {
    setActiveTab(role);
    setFilter('role', role);
  };

  const handleResendEmail = async (userId) => {
    try {
      const res = await resendDecisionEmailApi(userId);
      if (res?.email_sent) {
        toast.success(res.message || 'Decision email sent successfully.');
      } else {
        toast.warning('Decision saved, but the email could not be sent', 8000, {
          label: 'Resend email',
          onClick: () => handleResendEmail(userId),
        });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to resend decision email.');
    }
  };

  const handleConfirmApprove = async () => {
    if (!approvingUser) return;
    const targetUserId = approvingUser.id;
    const targetUserName = approvingUser.full_name;
    setActionLoading(true);
    try {
      const res = await approveUserApi(targetUserId);
      if (res && res.email_sent === false) {
        toast.warning('Decision saved, but the email could not be sent', 8000, {
          label: 'Resend email',
          onClick: () => handleResendEmail(targetUserId),
        });
      } else {
        toast.success(`Approved account request for ${targetUserName}.`);
      }
      setApprovingUser(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to approve request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingUser) return;
    if (!rejectReason || !rejectReason.trim()) {
      toast.error('Please provide a reason for rejection.');
      return;
    }
    const targetUserId = rejectingUser.id;
    const targetUserName = rejectingUser.full_name;
    setActionLoading(true);
    try {
      const res = await rejectUserApi(targetUserId, rejectReason.trim());
      if (res && res.email_sent === false) {
        toast.warning('Decision saved, but the email could not be sent', 8000, {
          label: 'Resend email',
          onClick: () => handleResendEmail(targetUserId),
        });
      } else {
        toast.success(`Rejected request for ${targetUserName}.`);
      }
      setRejectingUser(null);
      setRejectReason('');
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reject request.');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'full_name',
        label: 'Applicant Name',
        render: (value, u) => {
          const item = u || value || {};
          return (
            <div>
              <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{item.full_name || 'Applicant'}</div>
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
        key: 'role',
        label: 'Role Requested',
        render: (value, u) => {
          const item = u || value || {};
          const roleStr = item.role ? String(item.role).replace('_', ' ') : 'USER';
          return (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                background: item.role === 'FLEET_MANAGER' ? 'var(--purple-bg)' : 'var(--warning-bg)',
                color: item.role === 'FLEET_MANAGER' ? 'var(--purple-text)' : 'var(--warning-text)',
              }}
            >
              {roleStr}
            </span>
          );
        },
      },
      {
        key: 'created_at',
        label: 'Requested Date',
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
        width: '200px',
        minWidth: '200px',
        render: (value, u) => {
          const item = u || value || {};
          return (
            <div className="admin-action-btn-group" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
              <Button
                type="button"
                size="small"
                variant="success"
                onClick={() => setApprovingUser(item)}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="small"
                variant="danger"
                onClick={() => {
                  setRejectReason('');
                  setRejectingUser(item);
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

  const tabItems = [
    { id: 'FLEET_MANAGER', label: 'Fleet Manager Requests' },
    { id: 'DRIVER', label: 'Driver Requests' },
  ];

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Registration Approvals"
        subtitle="Review and verify staff and driver onboarding applications"
      />

      <Tabs
        tabs={tabItems}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={refresh}
        searchPlaceholder="Search applicant by name, email, phone..."
        search={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={totalPages}
        count={totalCount}
        onPageChange={setPage}
      />

      {/* Approve Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(approvingUser)}
        onClose={() => setApprovingUser(null)}
        onConfirm={handleConfirmApprove}
        title="Approve Registration"
        message={`Are you sure you want to approve ${approvingUser?.full_name} as a ${approvingUser?.role?.replace('_', ' ')}? They will gain access to the system.`}
        confirmLabel="Approve Request"
        variant="success"
        loading={actionLoading}
      />

      {/* Reject with Reason Dialog */}
      <ConfirmDialog
        isOpen={Boolean(rejectingUser)}
        onClose={() => setRejectingUser(null)}
        onConfirm={handleConfirmReject}
        title="Reject Registration"
        message={`Please provide a reason for rejecting the registration request from ${rejectingUser?.full_name}:`}
        confirmLabel="Reject Request"
        inputLabel="Reason for Rejection"
        inputValue={rejectReason}
        onInputChange={setRejectReason}
        inputRequired={true}
        inputPlaceholder="e.g. Incomplete credentials or unverified identity"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
