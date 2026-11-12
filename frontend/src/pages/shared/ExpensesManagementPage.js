import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useApiList from '../../hooks/useApiList';
import {
  listExpensesApi,
  getExpenseSummaryApi,
  createExpenseApi,
  deleteExpenseApi,
  approveExpenseApi,
  rejectExpenseApi,
  getExpenseReceiptUrl,
} from '../../api/expenses';
import { listVehiclesApi } from '../../api/adminManager';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import ViewSwitch from '../../components/common/ViewSwitch';
import StatusBadge from '../../components/common/StatusBadge';
import FormModal from '../../components/common/FormModal';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import ReceiptViewer from '../../components/common/ReceiptViewer';
import { VehiclePlate } from '../../components/common/SignatureDesign';
import {
  ReceiptIcon,
  TrashIcon,
  CheckIcon,
} from '../../components/common/Icons';
import {
  NumberInput,
  Select,
  DateInput,
  FileInput,
  Textarea,
} from '../../components/forms';
import { normalizeList } from '../../utils/safeHelpers';
import { formatRupees, formatDate } from '../../utils/formatters';
import './FuelExpensesDocuments.css';

const EXPENSE_CATEGORIES = [
  { value: 'TOLL', label: 'Toll & Fastag' },
  { value: 'PARKING', label: 'Parking Charges' },
  { value: 'MAINTENANCE_REPAIR', label: 'Minor Repair & Maintenance' },
  { value: 'CHALLAN_FINE', label: 'Challan & Traffic Fines' },
  { value: 'CLEANING', label: 'Washing & Cleaning' },
  { value: 'ACCOMMODATION', label: 'Driver Accommodation' },
  { value: 'OTHER', label: 'Other Operational Cost' },
];

const DONUT_COLORS = [
  'var(--chart-1)', // Blue
  'var(--chart-3)', // Green
  'var(--chart-4)', // Amber
  'var(--chart-6)', // Red
  'var(--chart-5)', // Purple
  'var(--chart-2)', // Cyan
  'var(--text-muted)', // Slate
];

export default function ExpensesManagementPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('ff_view_expenses') || 'table'
  );

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('ff_view_expenses', mode);
  };

  const [vehicles, setVehicles] = useState([]);
  useEffect(() => {
    listVehiclesApi({ page_size: 100 })
      .then((data) => setVehicles(normalizeList(data).items || []))
      .catch(() => {});
  }, []);

  const {
    data: expenses,
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
    endpoint: '/expenses/',
    fetchFn: listExpensesApi,
    initialFilters: {
      category: '',
      vehicle: '',
      status: '',
      start_date: '',
      end_date: '',
    },
  });

  // Pending count for tab badge
  const [pendingCount, setPendingCount] = useState(0);

  // Summary state
  const [summary, setSummary] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      const params = {};
      if (filters.vehicle) params.vehicle = filters.vehicle;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      const data = await getExpenseSummaryApi(params);
      setSummary(data);
    } catch (err) {
      // ignore
    }
  }, [filters.vehicle, filters.start_date, filters.end_date]);

  // Fetch pending count separately
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await listExpensesApi({ status: 'PENDING', page_size: 1 });
      setPendingCount(res.count || 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchPendingCount();
  }, [fetchSummary, fetchPendingCount]);

  // Tab switch updates status filter
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setFilter('status', tab === 'ALL' ? '' : tab);
  };

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [approvingExpense, setApprovingExpense] = useState(null);
  const [rejectingExpense, setRejectingExpense] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [activeReceipt, setActiveReceipt] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const initialForm = {
    category: 'TOLL',
    vehicle: '',
    trip: '',
    amount: '',
    date: todayStr,
    description: '',
    receipt_image: null,
  };

  const [formData, setFormData] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // eslint-disable-next-line no-unused-vars
  const handleOpenAdd = () => {
    setFormData(initialForm);
    setFieldErrors({});
    setIsAddOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});

    try {
      const payload = new FormData();
      payload.append('category', formData.category);
      if (formData.vehicle) payload.append('vehicle', formData.vehicle);
      if (formData.trip) payload.append('trip', formData.trip);
      payload.append('amount', formData.amount);
      payload.append('date', formData.date);
      payload.append('description', formData.description || '');
      if (formData.receipt_image) {
        payload.append('receipt_image', formData.receipt_image);
      }

      await createExpenseApi(payload);
      toast.success('Expense recorded and automatically approved.');
      setIsAddOpen(false);
      refresh();
      fetchSummary();
      fetchPendingCount();
    } catch (err) {
      if (err.response?.data && typeof err.response.data === 'object') {
        const errors = {};
        for (const [k, v] of Object.entries(err.response.data)) {
          errors[k] = Array.isArray(v) ? v[0] : String(v);
        }
        setFieldErrors(errors);
        if (errors.non_field_errors || errors.detail) {
          toast.error(errors.non_field_errors || errors.detail);
        }
      } else {
        toast.error('Failed to submit expense.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!approvingExpense) return;
    setSubmitting(true);
    try {
      await approveExpenseApi(approvingExpense.id);
      toast.success(`Expense #${approvingExpense.id} approved successfully.`);
      setApprovingExpense(null);
      refresh();
      fetchSummary();
      fetchPendingCount();
    } catch (err) {
      toast.error('Failed to approve expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectingExpense) return;
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection.');
      return;
    }
    setSubmitting(true);
    try {
      await rejectExpenseApi(rejectingExpense.id, rejectionReason.trim());
      toast.success(`Expense #${rejectingExpense.id} rejected.`);
      setRejectingExpense(null);
      setRejectionReason('');
      refresh();
      fetchSummary();
      fetchPendingCount();
    } catch (err) {
      toast.error('Failed to reject expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingExpense) return;
    setSubmitting(true);
    try {
      await deleteExpenseApi(deletingExpense.id);
      toast.success('Expense deleted successfully.');
      setDeletingExpense(null);
      refresh();
      fetchSummary();
      fetchPendingCount();
    } catch (err) {
      toast.error('Failed to delete expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryLabel = (cat) => {
    const found = EXPENSE_CATEGORIES.find((c) => c.value === cat);
    return found ? found.label : cat;
  };

  const columns = [
    {
      header: 'Date',
      accessor: 'date',
      render: (item) => formatDate(item.date),
    },
    {
      header: 'Category',
      accessor: 'category',
      render: (item) => (
        <span style={{ fontWeight: 600 }}>{getCategoryLabel(item.category)}</span>
      ),
    },
    {
      header: 'Vehicle',
      accessor: 'vehicle_registration',
      render: (item) => item.vehicle_registration || '-',
    },
    {
      header: 'Trip',
      accessor: 'trip',
      render: (item) => (item.trip ? `#${item.trip}` : '-'),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (item) => <strong>{formatRupees(item.amount)}</strong>,
    },
    {
      header: 'Submitted By',
      accessor: 'submitted_by_name',
      render: (item) => (
        <div>
          <div>{item.submitted_by_name || '-'}</div>
          <small style={{ color: 'var(--color-text-muted)' }}>
            {item.submitted_by_role}
          </small>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      header: 'Receipt',
      accessor: 'has_receipt',
      render: (item) =>
        item.has_receipt ? (
          <IconButton
            variant="ghost"
            title="View Receipt"
            onClick={() =>
              setActiveReceipt({
                url: getExpenseReceiptUrl(item.id),
                title: `Expense Receipt #${item.id} - ${getCategoryLabel(
                  item.category
                )}`,
              })
            }
          >
            <ReceiptIcon size={18} color="var(--color-primary)" />
          </IconButton>
        ) : (
          <span style={{ color: 'var(--color-text-muted)' }}>-</span>
        ),
    },
    {
      header: 'Actions',
      render: (item) => (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {item.status === 'PENDING' && (
            <>
              <Button
                size="small"
                variant="success"
                onClick={() => setApprovingExpense(item)}
              >
                <CheckIcon size={14} /> Approve
              </Button>
              <Button
                size="small"
                variant="danger"
                onClick={() => {
                  setRejectingExpense(item);
                  setRejectionReason('');
                }}
              >
                Reject
              </Button>
            </>
          )}
          {isAdmin && (
            <IconButton
              size="small"
              variant="danger"
              title="Delete expense"
              onClick={() => setDeletingExpense(item)}
            >
              <TrashIcon size={16} />
            </IconButton>
          )}
        </div>
      ),
    },
  ];

  const renderCard = (item) => (
    <div key={item.id} className="ff-expense-card">
      <div className="ff-expense-card-top">
        <div>
          <div className="ff-expense-card-cat">
            {getCategoryLabel(item.category)}
          </div>
          <div className="ff-expense-card-veh">
            {item.vehicle_registration ? `Vehicle: ${item.vehicle_registration}` : 'General expense'}
          </div>
        </div>
        <div className="ff-expense-card-right">
          <StatusBadge status={item.status} />
          <div className="ff-expense-card-amount">
            {formatRupees(item.amount)}
          </div>
        </div>
      </div>

      <div className="ff-expense-card-details">
        <div>
          <span>Date:</span> <strong>{formatDate(item.date)}</strong>
        </div>
        <div>
          <span>Submitted by:</span> {item.submitted_by_name} ({item.submitted_by_role})
        </div>
        {item.trip && (
          <div>
            <span>Trip:</span> #{item.trip}
          </div>
        )}
        {item.description && (
          <div className="ff-expense-card-desc">
            "{item.description}"
          </div>
        )}
        {item.status === 'REJECTED' && item.rejection_reason && (
          <div className="ff-expense-card-rejection">
            <strong>Rejection Reason:</strong> {item.rejection_reason}
          </div>
        )}
      </div>

      <div className="ff-expense-card-footer">
        {item.has_receipt && (
          <Button
            size="small"
            variant="ghost"
            onClick={() =>
              setActiveReceipt({
                url: getExpenseReceiptUrl(item.id),
                title: `Expense Receipt #${item.id} - ${getCategoryLabel(
                  item.category
                )}`,
              })
            }
          >
            <ReceiptIcon size={16} /> View Receipt
          </Button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {item.status === 'PENDING' && (
            <>
              <Button
                size="small"
                variant="success"
                onClick={() => setApprovingExpense(item)}
              >
                Approve
              </Button>
              <Button
                size="small"
                variant="danger"
                onClick={() => {
                  setRejectingExpense(item);
                  setRejectionReason('');
                }}
              >
                Reject
              </Button>
            </>
          )}
          {isAdmin && (
            <IconButton
              size="small"
              variant="danger"
              title="Delete expense"
              onClick={() => setDeletingExpense(item)}
            >
              <TrashIcon size={16} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );

  // Donut SVG Generator
  const renderDonutChart = () => {
    const list = summary?.by_category || [];
    const totalAmount =
      Number(summary?.total_approved_amount) ||
      list.reduce((acc, it) => acc + (Number(it.total_amount) || 0), 0);

    if (list.length === 0 || totalAmount === 0) {
      return (
        <div style={{ color: 'var(--neutral-text)', textAlign: 'center', padding: '32px 16px' }}>
          No approved expenses in selected range.
        </div>
      );
    }

    let cumulativePercent = 0;
    return (
      <div className="ff-donut-wrapper">
        <div className="ff-donut-svg-container">
          <svg
            width="170"
            height="170"
            viewBox="0 0 42 42"
            className="ff-donut-svg"
            role="img"
            aria-label={`Donut chart of expenses by category. Total: ${formatRupees(totalAmount)}`}
          >
            {list.map((item, idx) => {
              const amount = Number(item.total_amount) || 0;
              const percent = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
              const strokeDasharray = `${percent} ${100 - percent}`;
              const strokeDashoffset = 100 - cumulativePercent + 25; // 25 to start at 12 o'clock
              cumulativePercent += percent;
              return (
                <circle
                  key={item.category}
                  className="ff-donut-ring"
                  cx="21"
                  cy="21"
                  r="15.91549430918954"
                  fill="transparent"
                  stroke={DONUT_COLORS[idx % DONUT_COLORS.length]}
                  strokeWidth="5"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                />
              );
            })}
          </svg>
          <div className="ff-donut-center-info">
            <span className="ff-donut-center-val">{formatRupees(totalAmount)}</span>
            <span className="ff-donut-center-lbl">Total</span>
          </div>
        </div>
        <div className="ff-donut-legend">
          {list.map((item, idx) => {
            const amount = Number(item.total_amount) || 0;
            const pct = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
            const pctFormatted = pct.toFixed(1);
            return (
              <div key={item.category} className="ff-donut-legend-item">
                <div className="ff-donut-legend-left">
                  <span
                    className="ff-donut-color-dot"
                    style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                  />
                  <span className="ff-donut-legend-label">
                    {item.category_display || getCategoryLabel(item.category)}
                  </span>
                </div>
                <strong className="ff-donut-legend-val">
                  {formatRupees(amount)} ({pctFormatted}%)
                </strong>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <div className="ff-page-container">
        <PageHeader
          title="Expense Management"
          subtitle="Track, audit, and approve operational, toll, and maintenance expenses"
        />

        {/* Top Summary Section */}
        <div className="ff-expense-summary-grid">
          <div className="ff-expense-summary-left">
            <div className="stat-card ff-expense-kpi-card">
              <div className="stat-card-header">
                <div
                  className="stat-card-icon-box motion-pop-in"
                  style={{ backgroundColor: 'var(--blue-50)', color: 'var(--primary)' }}
                >
                  <ReceiptIcon size={24} />
                </div>
                <span className="stat-card-label">Total Approved Expenses</span>
              </div>
              <div className="stat-card-body">
                <h3 className="stat-card-value">
                  {formatRupees(summary?.total_approved_amount || 0)}
                </h3>
              </div>
            </div>

            <div className="ff-card ff-chart-card">
              <h4 className="ff-card-title">Top Vehicle Expenses</h4>
              <div className="ff-bar-list">
                {(summary?.by_vehicle || []).length === 0 ? (
                  <div style={{ color: 'var(--neutral-text)', padding: '16px 0' }}>
                    No vehicle expenses in this range.
                  </div>
                ) : (
                  (() => {
                    const vehiclesList = summary.by_vehicle.slice(0, 5);
                    const maxVehAmount = Math.max(
                      ...vehiclesList.map((v) => Number(v.total_amount) || 0),
                      1
                    );
                    return vehiclesList.map((bv) => {
                      const vehAmt = Number(bv.total_amount) || 0;
                      const barWidth = Math.min(100, Math.max(8, (vehAmt / maxVehAmount) * 100));
                      return (
                        <div key={bv.vehicle_id} className="ff-bar-item">
                          <div className="ff-bar-info">
                            <VehiclePlate registrationNumber={bv.registration_number} size="sm" />
                            <span className="ff-bar-val">{formatRupees(bv.total_amount)}</span>
                          </div>
                          <div className="ff-bar-track">
                            <div
                              className="ff-bar-fill"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </div>
          </div>

          <div className="ff-card ff-chart-card">
            <h4 className="ff-card-title">Expenses by Category</h4>
            {renderDonutChart()}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="ff-tabs-bar">
          <Button
            type="button"
            variant="ghost"
            className={`ff-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
            onClick={() => handleTabChange('ALL')}
          >
            All
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={`ff-tab-btn ${activeTab === 'PENDING' ? 'active' : ''}`}
            onClick={() => handleTabChange('PENDING')}
          >
            Pending
            {pendingCount > 0 && (
              <span className="ff-tab-badge">{pendingCount}</span>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={`ff-tab-btn ${activeTab === 'APPROVED' ? 'active' : ''}`}
            onClick={() => handleTabChange('APPROVED')}
          >
            Approved
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={`ff-tab-btn ${activeTab === 'REJECTED' ? 'active' : ''}`}
            onClick={() => handleTabChange('REJECTED')}
          >
            Rejected
          </Button>
        </div>

        {/* Filters */}
        <div className="ff-filters-bar">
          <div className="ff-filters-left">
            <Select
              id="filter-category"
              value={filters.category}
              onChange={(e) => setFilter('category', e.target.value)}
              placeholder="All Categories"
            >
              <option value="">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>

            <Select
              id="filter-vehicle"
              value={filters.vehicle}
              onChange={(e) => setFilter('vehicle', e.target.value)}
              placeholder="All Vehicles"
            >
              <option value="">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration_number}
                </option>
              ))}
            </Select>

            <DateInput
              id="filter-start-date"
              placeholder="From Date"
              value={filters.start_date}
              onChange={(e) => setFilter('start_date', e.target.value)}
            />

            <DateInput
              id="filter-end-date"
              placeholder="To Date"
              value={filters.end_date}
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
          data={expenses}
          loading={loading}
          error={error}
          onRetry={refresh}
          searchPlaceholder="Search description or submitted by..."
          searchValue={search}
          onSearchChange={setSearch}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          viewMode={viewMode}
          renderCard={renderCard}
          emptyTitle="No expenses found"
          emptyDescription="Operational expenses will show up here as they are filed."
        />

        {/* Add Expense Modal */}
        <FormModal
          isOpen={isAddOpen}
          title="Add Expense"
          onClose={() => setIsAddOpen(false)}
          onSubmit={handleCreateSubmit}
          submitText="Save Expense"
          loading={submitting}
        >
          <Select
            label="Category"
            id="exp-category"
            required
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            error={fieldErrors.category}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>

          <Select
            label="Vehicle (Optional)"
            id="exp-vehicle"
            value={formData.vehicle}
            onChange={(e) => setFormData({ ...formData, vehicle: e.target.value })}
            error={fieldErrors.vehicle}
          >
            <option value="">General (No vehicle)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.registration_number} - {v.brand} {v.model}
              </option>
            ))}
          </Select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <NumberInput
              label="Amount (₹)"
              id="exp-amount"
              required
              min="0.01"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              error={fieldErrors.amount}
            />

            <DateInput
              label="Date"
              id="exp-date"
              required
              max={todayStr}
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              error={fieldErrors.date}
            />
          </div>

          <Textarea
            label="Description / Purpose"
            id="exp-description"
            rows={3}
            placeholder="Describe what this expense was for..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            error={fieldErrors.description}
          />

          <FileInput
            label="Receipt Proof (Optional)"
            id="exp-receipt"
            accept="image/*,application/pdf"
            maxSizeMB={5}
            onChange={(file) => setFormData({ ...formData, receipt_image: file })}
            error={fieldErrors.receipt_image}
            hint="Upload receipt photo or PDF (max 5 MB)"
          />
        </FormModal>

        {/* Approve Confirm Dialog */}
        <ConfirmDialog
          isOpen={Boolean(approvingExpense)}
          title="Approve Expense"
          message={`Are you sure you want to approve this expense of ${formatRupees(
            approvingExpense?.amount || 0
          )} (${getCategoryLabel(approvingExpense?.category)}) submitted by ${
            approvingExpense?.submitted_by_name
          }?`}
          confirmLabel="Approve"
          confirmVariant="primary"
          loading={submitting}
          onConfirm={handleApprove}
          onCancel={() => setApprovingExpense(null)}
        />

        {/* Reject Dialog with required reason */}
        <Modal
          isOpen={Boolean(rejectingExpense)}
          onClose={() => setRejectingExpense(null)}
          title="Reject Expense"
        >
          <form onSubmit={handleReject}>
            <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
              Rejecting expense #{rejectingExpense?.id} for{' '}
              <strong>{formatRupees(rejectingExpense?.amount || 0)}</strong>. Please
              provide a clear reason to the submitter.
            </p>
            <Textarea
              label="Rejection Reason"
              id="reject-reason"
              required
              rows={3}
              placeholder="e.g. Invalid receipt attached / Duplicate expense submission"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <Button
                variant="outline"
                type="button"
                onClick={() => setRejectingExpense(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="submit"
                loading={submitting}
                disabled={submitting || !rejectionReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirm Dialog (Admin only) */}
        <ConfirmDialog
          isOpen={Boolean(deletingExpense)}
          title="Delete Expense"
          message={`Are you sure you want to permanently delete expense #${deletingExpense?.id}?`}
          confirmLabel="Delete"
          confirmVariant="danger"
          loading={submitting}
          onConfirm={handleDelete}
          onCancel={() => setDeletingExpense(null)}
        />

        {/* Authenticated Receipt Viewer */}
        {activeReceipt && (
          <ReceiptViewer
            isOpen={Boolean(activeReceipt)}
            onClose={() => setActiveReceipt(null)}
            downloadUrl={activeReceipt.url}
            title={activeReceipt.title}
            fileName={`expense_receipt_${Date.now()}`}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
