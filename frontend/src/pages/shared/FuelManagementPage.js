import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useApiList from '../../hooks/useApiList';
import {
  listFuelLogsApi,
  getFuelSummaryApi,
  approveFuelLogApi,
  rejectFuelLogApi,
  deleteFuelLogApi,
  getFuelReceiptUrl,
} from '../../api/fuel';
import { listVehiclesApi, listDriversApi } from '../../api/adminManager';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import ViewSwitch from '../../components/common/ViewSwitch';
import StatCard from '../../components/common/StatCard';
import FormModal from '../../components/common/FormModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import ReceiptViewer from '../../components/common/ReceiptViewer';
import ReviewDrawer from '../../components/common/ReviewDrawer';
import { VehiclePlate, StatusDot } from '../../components/common/SignatureDesign';
import {
  FuelIcon,
  TrashIcon,
  ReceiptIcon,
  VehicleIcon,
} from '../../components/common/Icons';
import {
  Select,
  DateInput,
  Textarea,
} from '../../components/forms';
import { normalizeList } from '../../utils/safeHelpers';
import {
  formatRupees,
  formatFuelQuantity,
  getFuelTypeLabel,
  formatDate,
} from '../../utils/formatters';
import './FuelExpensesDocuments.css';

export default function FuelManagementPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState('ALL'); // ALL | PENDING | APPROVED | REJECTED

  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('ff_view_fuel') || 'table'
  );

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('ff_view_fuel', mode);
  };

  // Vehicles & Drivers dropdown options
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    if (typeof listVehiclesApi === 'function') {
      try {
        const res = listVehiclesApi({ page_size: 100 });
        if (res && typeof res.then === 'function') {
          res.then((data) => setVehicles(normalizeList(data).items || [])).catch(() => {});
        }
      } catch (err) {}
    }
    if (typeof listDriversApi === 'function') {
      try {
        const res = listDriversApi({ page_size: 100 });
        if (res && typeof res.then === 'function') {
          res.then((data) => setDrivers(normalizeList(data).items || [])).catch(() => {});
        }
      } catch (err) {}
    }
  }, []);

  // Main Fuel logs list hook
  const {
    data: fuelLogs,
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
    endpoint: '/fuel/',
    fetchFn: listFuelLogsApi,
    initialFilters: {
      review_status: activeTab === 'ALL' ? '' : activeTab,
    },
  });

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setFilter('review_status', newTab === 'ALL' ? '' : newTab);
  };

  // Summary
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await getFuelSummaryApi({
        vehicle: filters.vehicle || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
      });
      setSummary(data);
    } catch {
      // ignore
    } finally {
      setSummaryLoading(false);
    }
  }, [filters.vehicle, filters.start_date, filters.end_date]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Modals & Action States
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [deletingLog, setDeletingLog] = useState(null);
  const [rejectingLog, setRejectingLog] = useState(null);
  const [reviewingLog, setReviewingLog] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const handleApprove = async (log) => {
    setActionLoading(true);
    try {
      await approveFuelLogApi(log.id);
      toast.success(`Fuel log #${log.id} approved!`);
      refresh();
      fetchSummary();
    } catch {
      toast.error('Failed to approve fuel log.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason.');
      return;
    }
    setActionLoading(true);
    try {
      await rejectFuelLogApi(rejectingLog.id, rejectionReason.trim());
      toast.success(`Fuel log #${rejectingLog.id} rejected.`);
      setRejectingLog(null);
      setRejectionReason('');
      refresh();
      fetchSummary();
    } catch {
      toast.error('Failed to reject fuel log.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingLog) return;
    setActionLoading(true);
    try {
      await deleteFuelLogApi(deletingLog.id);
      toast.success('Fuel log deleted.');
      setDeletingLog(null);
      refresh();
      fetchSummary();
    } catch {
      toast.error('Failed to delete fuel log.');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      header: 'Date',
      accessor: 'date',
      width: '110px',
      render: (log) => <span style={{ whiteSpace: 'nowrap' }}>{formatDate(log.date)}</span>,
    },
    {
      header: 'Vehicle',
      accessor: 'vehicle_registration',
      width: '190px',
      render: (log) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <VehiclePlate registrationNumber={log.vehicle_registration || '—'} size="sm" />
          {log.vehicle_name && (
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '170px',
              }}
            >
              {log.vehicle_name}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Driver',
      accessor: 'driver_name',
      width: '160px',
      render: (log) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {log.driver_name || 'Not recorded'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'review_status',
      width: '120px',
      render: (log) => {
        const st = log.review_status || 'PENDING';
        return (
          <div>
            <StatusDot status={st} label={st} />
            {st === 'REJECTED' && log.rejection_reason && (
              <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '2px' }}>
                {log.rejection_reason}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Fuel Type',
      accessor: 'fuel_type',
      width: '90px',
      render: (log) => getFuelTypeLabel(log.fuel_type),
    },
    {
      header: 'Quantity',
      accessor: 'quantity',
      width: '90px',
      render: (log) => formatFuelQuantity(log.quantity, log.fuel_type),
    },
    {
      header: 'Total Cost',
      accessor: 'total_cost',
      width: '120px',
      align: 'right',
      render: (log) => <strong>{formatRupees(log.total_cost)}</strong>,
    },
    {
      header: 'Receipt',
      accessor: 'has_receipt',
      width: '80px',
      align: 'center',
      render: (log) =>
        log.has_receipt ? (
          <IconButton
            variant="ghost"
            title="View Receipt"
            onClick={() =>
              setActiveReceipt({
                url: getFuelReceiptUrl(log.id),
                title: `Receipt - ${log.vehicle_registration || 'Fuel Log'} (${formatDate(log.date)})`,
              })
            }
          >
            <ReceiptIcon size={18} />
          </IconButton>
        ) : (
          <span style={{ color: 'var(--color-text-muted)' }}>-</span>
        ),
    },
    {
      header: 'Actions',
      width: '190px',
      align: 'right',
      render: (log) => (
        <div className="admin-action-btn-group" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          {log.review_status === 'PENDING' && (
            <>
              <Button
                size="small"
                variant="outline"
                onClick={() => setReviewingLog(log)}
                title="Review details"
              >
                Review
              </Button>
              <Button
                size="small"
                variant="primary"
                onClick={() => handleApprove(log)}
                disabled={actionLoading}
              >
                Approve
              </Button>
              <Button
                size="small"
                variant="outline"
                onClick={() => {
                  setRejectingLog(log);
                  setRejectionReason('');
                }}
                disabled={actionLoading}
              >
                Reject
              </Button>
            </>
          )}
          {isAdmin && (
            <IconButton
              size="small"
              variant="danger"
              title="Delete log"
              onClick={() => setDeletingLog(log)}
            >
              <TrashIcon size={16} />
            </IconButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <ErrorBoundary>
      <div className="ff-page-container">
        <PageHeader
          title="Fuel Review & Management"
          subtitle="Review driver fuel submissions and monitor vehicle consumption"
        />

        {/* Summary Stat Cards (Counts only APPROVED logs) */}
        <div className="ff-stat-grid">
          <StatCard
            label="Total Approved Fuel"
            value={
              summary?.total_quantity != null
                ? `${Number(summary.total_quantity).toLocaleString()} L`
                : '0 L'
            }
            icon={<FuelIcon size={24} />}
            loading={summaryLoading}
          />
          <StatCard
            label="Total Approved Cost"
            value={formatRupees(summary?.total_cost || 0)}
            icon={<ReceiptIcon size={24} />}
            loading={summaryLoading}
          />
          <StatCard
            label="Average Price"
            value={`${formatRupees(summary?.average_price || 0)}/unit`}
            icon={<FuelIcon size={24} />}
            loading={summaryLoading}
          />
          <StatCard
            label="Pending Review"
            value={summary?.pending_review_count != null ? summary.pending_review_count : 0}
            icon={<VehicleIcon size={24} />}
            loading={summaryLoading}
          />
        </div>

        {/* Tabs: ALL, PENDING, APPROVED, REJECTED */}
        <div className="ff-tabs-bar" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((t) => (
            <Button
              key={t}
              type="button"
              variant={activeTab === t ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => handleTabChange(t)}
            >
              {t === 'ALL' ? 'All Fuel Logs' : t.charAt(0) + t.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="ff-filters-bar">
          <div className="ff-filters-left">
            <Select
              id="filter-vehicle"
              value={filters.vehicle || ''}
              onChange={(e) => setFilter('vehicle', e.target.value)}
              placeholder="All Vehicles"
            >
              <option value="">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration_number} ({v.brand} {v.model})
                </option>
              ))}
            </Select>

            <Select
              id="filter-driver"
              value={filters.driver || ''}
              onChange={(e) => setFilter('driver', e.target.value)}
              placeholder="All Drivers"
            >
              <option value="">All Drivers</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.full_name || `Driver #${d.id}`}
                </option>
              ))}
            </Select>

            <DateInput
              id="filter-start-date"
              placeholder="From Date"
              value={filters.start_date || ''}
              onChange={(e) => setFilter('start_date', e.target.value)}
            />

            <DateInput
              id="filter-end-date"
              placeholder="To Date"
              value={filters.end_date || ''}
              onChange={(e) => setFilter('end_date', e.target.value)}
            />
          </div>

          <div className="ff-filters-right">
            <ViewSwitch viewMode={viewMode} onChange={handleViewModeChange} />
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={fuelLogs}
          loading={loading}
          error={error}
          onRetry={refresh}
          searchPlaceholder="Search registration or driver..."
          searchValue={search}
          onSearchChange={setSearch}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          viewMode={viewMode}
          emptyTitle="No fuel logs found"
          emptyDescription="Fuel entries entered by drivers for their assigned trips will appear here for review."
        />

        {/* Reject Dialog */}
        <FormModal
          isOpen={Boolean(rejectingLog)}
          title={`Reject Fuel Log #${rejectingLog?.id}`}
          onClose={() => setRejectingLog(null)}
          onSubmit={handleRejectSubmit}
          submitLabel={actionLoading ? 'Rejecting...' : 'Reject Fuel Log'}
          submitting={actionLoading}
        >
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
            Please state why this fuel log is rejected (e.g. illegible receipt, invalid odometer, wrong quantity).
            The driver will receive a notification.
          </p>
          <Textarea
            label="Rejection Reason"
            required
            rows={3}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Enter clear reason for rejection..."
          />
        </FormModal>

        {/* Delete Confirm */}
        {isAdmin && (
          <ConfirmDialog
            isOpen={Boolean(deletingLog)}
            title="Delete Fuel Log"
            message={`Are you sure you want to permanently delete fuel log #${deletingLog?.id}? This action cannot be undone.`}
            confirmLabel="Delete"
            variant="danger"
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeletingLog(null)}
          />
        )}

        {/* Receipt Viewer */}
        {activeReceipt && (
          <ReceiptViewer
            isOpen={Boolean(activeReceipt)}
            onClose={() => setActiveReceipt(null)}
            downloadUrl={activeReceipt.url}
            title={activeReceipt.title}
            fileName={`fuel_receipt_${Date.now()}`}
          />
        )}

        {/* Review Drawer */}
        <ReviewDrawer
          isOpen={Boolean(reviewingLog)}
          onClose={() => setReviewingLog(null)}
          title="Review Fuel Submission"
          type="fuel"
          data={
            reviewingLog
              ? {
                  ...reviewingLog,
                  receipt_url: reviewingLog.has_receipt ? getFuelReceiptUrl(reviewingLog.id) : null,
                }
              : null
          }
          onApprove={async (item) => {
            await handleApprove(item);
            setReviewingLog(null);
          }}
          onReject={async (item, reason) => {
            setActionLoading(true);
            try {
              await rejectFuelLogApi(item.id, reason);
              toast.success(`Fuel log #${item.id} rejected.`);
              setReviewingLog(null);
              refresh();
              fetchSummary();
            } catch {
              toast.error('Failed to reject fuel log.');
            } finally {
              setActionLoading(false);
            }
          }}
          loading={actionLoading}
        />
      </div>
    </ErrorBoundary>
  );
}
