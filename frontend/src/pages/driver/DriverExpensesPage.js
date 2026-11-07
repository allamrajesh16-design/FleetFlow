import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import useApiList from '../../hooks/useApiList';
import {
  listExpensesApi,
  createExpenseApi,
  updateExpenseApi,
  getExpenseReceiptUrl,
} from '../../api/expenses';
import { getMyTripsApi } from '../../api/driver';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import FormModal from '../../components/common/FormModal';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import ReceiptViewer from '../../components/common/ReceiptViewer';
import {
  ReceiptIcon,
  PlusIcon,
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
import './DriverPages.css';
import '../shared/FuelExpensesDocuments.css';

const DRIVER_EXPENSE_CATEGORIES = [
  { value: 'TOLL', label: 'Toll & Fastag' },
  { value: 'PARKING', label: 'Parking Charges' },
  { value: 'MAINTENANCE_REPAIR', label: 'Minor Repair' },
  { value: 'CHALLAN_FINE', label: 'Challan & Fine' },
  { value: 'CLEANING', label: 'Washing & Cleaning' },
  { value: 'ACCOMMODATION', label: 'Driver Stay / Food' },
  { value: 'OTHER', label: 'Other Operational Cost' },
];

export default function DriverExpensesPage() {
  const toast = useToast();
  const tripSelectRef = useRef(null);

  const [trips, setTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(true);

  useEffect(() => {
    setTripsLoading(true);
    getMyTripsApi('all')
      .then((data) => {
        const list = normalizeList(data).items || [];
        const filtered = list.filter((t) => {
          const s = String(t.status).toUpperCase();
          if (['SCHEDULED', 'IN_PROGRESS', 'STARTED'].includes(s)) return true;
          if (s === 'COMPLETED') {
            const timeStr = t.end_time || t.completed_at || t.updated_at;
            if (!timeStr) return true;
            const diffHours = (Date.now() - new Date(timeStr).getTime()) / (1000 * 60 * 60);
            return diffHours <= 24;
          }
          return false;
        });
        setTrips(filtered);
      })
      .catch(() => {
        setTrips([]);
      })
      .finally(() => {
        setTripsLoading(false);
      });
  }, []);

  const {
    data: expenses,
    totalCount,
    totalPages,
    page,
    loading,
    error,
    search,
    setPage,
    setSearch,
    refresh,
  } = useApiList({
    endpoint: '/expenses/',
    fetchFn: listExpensesApi,
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [activeReceipt, setActiveReceipt] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const initialForm = {
    trip: '',
    vehicle: '',
    vehicle_info: '',
    category: 'TOLL',
    amount: '',
    date: todayStr,
    description: '',
    receipt_image: null,
  };

  const [formData, setFormData] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleTripSelect = (tripId) => {
    const selected = trips.find((t) => String(t.id) === String(tripId));
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        trip: selected.id,
        vehicle: selected.vehicle,
        vehicle_info: `${selected.vehicle_registration || `Vehicle #${selected.vehicle}`} (${
          selected.vehicle_brand_model || ''
        })`,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        trip: '',
        vehicle: '',
        vehicle_info: '',
      }));
    }
  };

  const handleOpenAdd = () => {
    const defaultTrip = trips.length > 0 ? trips[0] : null;
    setEditingExpense(null);
    setFormData({
      ...initialForm,
      trip: defaultTrip ? defaultTrip.id : '',
      vehicle: defaultTrip ? defaultTrip.vehicle : '',
      vehicle_info: defaultTrip
        ? `${defaultTrip.vehicle_registration || `Vehicle #${defaultTrip.vehicle}`} (${defaultTrip.vehicle_brand_model || ''})`
        : '',
    });
    setFieldErrors({});
    setShowMoreDetails(false);
    setIsAddOpen(true);
    setTimeout(() => {
      if (tripSelectRef.current) tripSelectRef.current.focus();
    }, 100);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.trip) {
      setFieldErrors({ trip: 'Please select an assigned trip.' });
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      setFieldErrors({ amount: 'Enter a valid amount in rupees.' });
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    try {
      const payload = new FormData();
      if (formData.trip) payload.append('trip', formData.trip);
      if (formData.vehicle) payload.append('vehicle', formData.vehicle);
      payload.append('category', formData.category);
      payload.append('amount', formData.amount);
      payload.append('date', formData.date || todayStr);
      if (formData.description) payload.append('description', formData.description.trim());
      if (formData.receipt_image) {
        payload.append('receipt_image', formData.receipt_image);
      }

      if (editingExpense) {
        await updateExpenseApi(editingExpense.id, payload);
        toast.success('Expense updated successfully.');
        setEditingExpense(null);
      } else {
        await createExpenseApi(payload);
        toast.success('Expense claim submitted for approval (Pending).');
        setIsAddOpen(false);
      }
      refresh();
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
        toast.error('Failed to submit expense claim.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryLabel = (cat) => {
    const found = DRIVER_EXPENSE_CATEGORIES.find((c) => c.value === cat);
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
      render: (item) => getCategoryLabel(item.category),
    },
    {
      header: 'Trip / Vehicle',
      accessor: 'trip',
      render: (item) => (
        <div>
          {item.trip ? <div>Trip #{item.trip}</div> : null}
          <small style={{ color: 'var(--color-text-muted)' }}>
            {item.vehicle_registration || '-'}
          </small>
        </div>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (item) => <strong>{formatRupees(item.amount)}</strong>,
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (item) => (
        <div>
          <StatusBadge status={item.status} />
          {item.status === 'REJECTED' && item.rejection_reason && (
            <div className="ff-rejection-note" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--danger)' }}>
              Reason: {item.rejection_reason}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Receipt',
      accessor: 'receipt_image',
      align: 'right',
      render: (item) =>
        item.has_receipt ? (
          <Button
            size="small"
            variant="ghost"
            onClick={() =>
              setActiveReceipt({
                url: getExpenseReceiptUrl(item.id),
                title: `Expense Receipt - ${getCategoryLabel(item.category)} (${formatRupees(
                  item.amount
                )})`,
              })
            }
          >
            <ReceiptIcon size={16} /> Receipt
          </Button>
        ) : (
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>None</span>
        ),
    },
  ];

  return (
    <ErrorBoundary>
      <div className="ff-page-container">
        <PageHeader
          title="Trip Expenses"
          subtitle="Submit and track on-road expenses (tolls, parking, repairs)"
          actions={
            <Button variant="primary" onClick={handleOpenAdd}>
              <PlusIcon size={18} /> Add Expense
            </Button>
          }
        />

        {!tripsLoading && trips.length === 0 && (
          <div className="driver-no-trips-banner">
            <div className="driver-no-trips-banner-text">
              <span>You currently have no active or recent trips assigned. An assigned trip is required to claim expenses.</span>
            </div>
            <Link to="/driver/trips" className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }}>
              View My Trips
            </Link>
          </div>
        )}

        <DataTable
          columns={columns}
          data={expenses}
          loading={loading}
          error={error}
          onRetry={refresh}
          searchPlaceholder="Search category, description..."
          searchValue={search}
          onSearchChange={setSearch}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          emptyTitle="No expenses recorded"
          emptyDescription="You have not submitted any trip expenses yet. Add tolls, parking, or cleaning costs."
          emptyAction={
            <Button variant="primary" onClick={handleOpenAdd}>
              <PlusIcon size={16} /> Add Expense
            </Button>
          }
        />

        {/* Short & Focused Form Modal */}
        <FormModal
          isOpen={isAddOpen}
          title={editingExpense ? 'Edit Expense' : 'Add Trip Expense'}
          onClose={() => {
            setIsAddOpen(false);
            setEditingExpense(null);
          }}
          onSubmit={handleSubmit}
          submitLabel={submitting ? 'Saving...' : 'Submit Claim'}
          submitting={submitting}
          submitDisabled={trips.length === 0 && !editingExpense}
        >
          {trips.length === 0 && !editingExpense ? (
            <div
              style={{
                backgroundColor: 'var(--danger-bg)',
                border: '1px solid var(--danger)',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '16px',
                color: 'var(--danger-text)',
                fontSize: '0.875rem',
              }}
            >
              You need an assigned trip to claim expenses.{' '}
              <Link to="/driver/trips" style={{ fontWeight: 600, textDecoration: 'underline' }}>
                View My Trips
              </Link>
            </div>
          ) : (
            <>
              {/* 1. Trip */}
              <Select
                ref={tripSelectRef}
                label="Assigned Trip"
                id="driver-exp-trip"
                required
                value={formData.trip}
                onChange={(e) => handleTripSelect(e.target.value)}
                error={fieldErrors.trip}
                options={trips.map((t) => ({
                  value: t.id,
                  label: `Trip #${t.id}: ${t.pickup_location || 'Origin'} → ${t.drop_location || 'Destination'} (${t.status})`,
                }))}
              />

              {/* 2. Category */}
              <Select
                label="Expense Category"
                id="driver-exp-category"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                error={fieldErrors.category}
                options={DRIVER_EXPENSE_CATEGORIES}
              />

              {/* 3. Amount */}
              <NumberInput
                label="Amount Paid (₹)"
                id="driver-exp-amount"
                required
                min="1"
                step="1"
                placeholder="e.g. 150"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                error={fieldErrors.amount}
              />

              {/* 4. Receipt Photo */}
              <FileInput
                label="Receipt Photo (Camera / Bill)"
                id="driver-exp-file"
                accept="image/*,application/pdf"
                maxSizeMB={5}
                onChange={(f) => setFormData({ ...formData, receipt_image: f })}
                error={fieldErrors.receipt_image}
                hint="Capture photo or upload bill receipt"
              />

              {/* Optional More Details */}
              <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMoreDetails(!showMoreDetails)}
                  style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
                >
                  {showMoreDetails ? '▲ Hide extra details' : '▼ More details (Date, Description)'}
                </Button>

                {showMoreDetails && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <DateInput
                      label="Expense Date"
                      id="driver-exp-date"
                      max={todayStr}
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      error={fieldErrors.date}
                    />

                    <Textarea
                      label="Description"
                      id="driver-exp-desc"
                      rows={2}
                      placeholder="e.g. Fastag toll deduction at toll plaza"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </FormModal>

        {/* Receipt Viewer */}
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
