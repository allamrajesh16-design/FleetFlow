import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import useApiList from '../../hooks/useApiList';
import {
  listFuelLogsApi,
  getFuelSummaryApi,
  createFuelLogApi,
  getFuelReceiptUrl,
} from '../../api/fuel';
import { getMyTripsApi } from '../../api/driver';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import FormModal from '../../components/common/FormModal';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import ReceiptViewer from '../../components/common/ReceiptViewer';
import {
  FuelIcon,
  PlusIcon,
  ReceiptIcon,
} from '../../components/common/Icons';
import {
  NumberInput,
  Select,
  DateInput,
  FileInput,
  Checkbox,
  TextInput,
} from '../../components/forms';
import { normalizeList } from '../../utils/safeHelpers';
import {
  formatRupees,
  formatFuelQuantity,
  getQuantityUnit,
  formatDate,
} from '../../utils/formatters';
import './DriverPages.css';
import '../shared/FuelExpensesDocuments.css';

export default function DriverFuelPage() {
  const toast = useToast();
  const tripSelectRef = useRef(null);

  // Trips eligible for refuel logging
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
    data: fuelLogs,
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
    endpoint: '/fuel/',
    fetchFn: listFuelLogsApi,
  });

  // Summary
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await getFuelSummaryApi();
      setSummary(data);
    } catch {
      // ignore
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Modal & Receipt viewer state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const initialForm = {
    trip: '',
    vehicle: '',
    vehicle_info: '',
    date: todayStr,
    fuel_type: 'DIESEL',
    quantity: '',
    total_cost: '',
    odometer_km: '',
    is_full_tank: false,
    station_name: '',
    receipt_image: null,
  };

  const [formData, setFormData] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Calculated rate per liter
  const calculatedPricePerLiter =
    Number(formData.quantity) > 0 && Number(formData.total_cost) > 0
      ? (Number(formData.total_cost) / Number(formData.quantity)).toFixed(2)
      : null;

  const priceWarning =
    calculatedPricePerLiter &&
    (Number(calculatedPricePerLiter) < 20 || Number(calculatedPricePerLiter) > 300)
      ? `Rate (₹${calculatedPricePerLiter}/L) seems unusually high or low. Please double-check.`
      : null;

  const handleTripSelect = (tripId) => {
    const selected = trips.find((t) => String(t.id) === String(tripId));
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        trip: selected.id,
        vehicle: selected.vehicle,
        fuel_type: selected.vehicle_type === 'BUS' ? 'DIESEL' : (prev.fuel_type || 'DIESEL'),
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
    setFormData({
      ...initialForm,
      trip: defaultTrip ? defaultTrip.id : '',
      vehicle: defaultTrip ? defaultTrip.vehicle : '',
      fuel_type: defaultTrip && defaultTrip.vehicle_type === 'BUS' ? 'DIESEL' : 'DIESEL',
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
    if (!formData.trip || !formData.vehicle) {
      setFieldErrors({ trip: 'Please select an assigned trip.' });
      return;
    }
    if (!formData.quantity || Number(formData.quantity) <= 0) {
      setFieldErrors((prev) => ({ ...prev, quantity: 'Enter liters filled.' }));
      return;
    }
    if (!formData.total_cost || Number(formData.total_cost) <= 0) {
      setFieldErrors((prev) => ({ ...prev, total_cost: 'Enter amount paid in rupees.' }));
      return;
    }
    if (!formData.odometer_km) {
      setFieldErrors((prev) => ({ ...prev, odometer_km: 'Enter odometer reading.' }));
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    try {
      const payload = new FormData();
      payload.append('trip', formData.trip);
      payload.append('vehicle', formData.vehicle);
      payload.append('date', formData.date || todayStr);
      payload.append('fuel_type', formData.fuel_type);
      payload.append('quantity', formData.quantity);
      payload.append('total_cost', formData.total_cost);
      payload.append('price_per_unit', calculatedPricePerLiter || '0.00');
      payload.append('odometer_km', formData.odometer_km);
      payload.append('is_full_tank', formData.is_full_tank ? 'true' : 'false');
      if (formData.station_name) payload.append('station_name', formData.station_name);
      if (formData.receipt_image) payload.append('receipt_image', formData.receipt_image);

      await createFuelLogApi(payload);
      toast.success('Fuel entry saved! Submitted for review (Pending).');
      setIsAddOpen(false);
      refresh();
      fetchSummary();
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
        toast.error('Failed to submit fuel log.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      header: 'Date',
      accessor: 'date',
      render: (log) => formatDate(log.date),
    },
    {
      header: 'Vehicle',
      accessor: 'vehicle_registration',
      render: (log) => log.vehicle_registration || `Vehicle #${log.vehicle}`,
    },
    {
      header: 'Trip',
      accessor: 'trip',
      render: (log) => (log.trip ? `#${log.trip}` : '-'),
    },
    {
      header: 'Status',
      accessor: 'review_status',
      render: (log) => {
        const st = log.review_status || 'PENDING';
        const color = st === 'APPROVED' ? 'var(--success)' : st === 'REJECTED' ? 'var(--danger)' : 'var(--warning)';
        return (
          <span style={{ fontWeight: 600, color, fontSize: 'var(--font-size-xs)' }}>
            {st}
          </span>
        );
      },
    },
    {
      header: 'Liters',
      accessor: 'quantity',
      render: (log) => formatFuelQuantity(log.quantity, log.fuel_type),
    },
    {
      header: 'Amount Paid',
      accessor: 'total_cost',
      render: (log) => <strong>{formatRupees(log.total_cost)}</strong>,
    },
    {
      header: 'Odometer',
      accessor: 'odometer_km',
      render: (log) => `${log.odometer_km?.toLocaleString()} km`,
    },
    {
      header: 'Receipt',
      accessor: 'has_receipt',
      align: 'right',
      render: (log) =>
        log.has_receipt ? (
          <Button
            size="small"
            variant="ghost"
            onClick={() =>
              setActiveReceipt({
                url: getFuelReceiptUrl(log.id),
                title: `Receipt - ${log.vehicle_registration || 'Fuel Log'} (${formatDate(
                  log.date
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
          title="My Fuel Logs"
          subtitle="Log refuel stops for your assigned trips"
          actions={
            <Button variant="primary" onClick={handleOpenAdd}>
              <PlusIcon size={18} /> Add Fuel
            </Button>
          }
        />

        {/* Small info note when driver has no eligible trip */}
        {!tripsLoading && trips.length === 0 && (
          <div className="driver-no-trips-banner">
            <div className="driver-no-trips-banner-text">
              <span>You currently have no active or recent trips assigned. Ask your Fleet Manager to assign a trip.</span>
            </div>
            <Link to="/driver/trips" className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }}>
              View My Trips
            </Link>
          </div>
        )}

        {/* Stat banner */}
        <div className="ff-stat-grid" style={{ marginBottom: 'var(--space-6)' }}>
          <StatCard
            label="Fuel Quantity This Month"
            value={
              summary?.total_quantity != null
                ? `${Number(summary.total_quantity).toLocaleString()} L`
                : '0 L'
            }
            icon={<FuelIcon size={24} />}
            loading={summaryLoading}
          />
          <StatCard
            label="Fuel Cost This Month"
            value={formatRupees(summary?.total_cost || 0)}
            icon={<ReceiptIcon size={24} />}
            loading={summaryLoading}
          />
        </div>

        {/* List of Fuel logs */}
        <DataTable
          columns={columns}
          data={fuelLogs}
          loading={loading}
          error={error}
          onRetry={refresh}
          searchPlaceholder="Search logs..."
          searchValue={search}
          onSearchChange={setSearch}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          emptyTitle="No fuel logs yet"
          emptyDescription="You haven't added any refuel entries yet. Log fuel stops for your assigned trips."
          emptyAction={
            <Button variant="primary" onClick={handleOpenAdd}>
              <PlusIcon size={16} /> Add Fuel
            </Button>
          }
        />

        {/* Add Fuel Modal for Driver */}
        <FormModal
          isOpen={isAddOpen}
          title="Add Fuel Stop"
          onClose={() => setIsAddOpen(false)}
          onSubmit={handleSubmit}
          submitLabel={submitting ? 'Saving...' : 'Submit Fuel Log'}
          submitting={submitting}
          submitDisabled={trips.length === 0}
        >
          {trips.length === 0 ? (
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
              You need an assigned trip to add this. Ask your Fleet Manager to assign a trip.{' '}
              <Link to="/driver/trips" style={{ fontWeight: 600, textDecoration: 'underline' }}>
                View My Trips
              </Link>
            </div>
          ) : (
            <>
              {/* 1. Trip Selector */}
              <Select
                ref={tripSelectRef}
                label="Assigned Trip"
                id="driver-log-trip"
                required
                value={formData.trip}
                onChange={(e) => handleTripSelect(e.target.value)}
                error={fieldErrors.trip}
                options={trips.map((t) => ({
                  value: t.id,
                  label: `Trip #${t.id}: ${t.pickup_location || 'Origin'} → ${t.drop_location || 'Destination'} (${t.status})`,
                }))}
              />

              {/* 2. Fuel Type pre-filled */}
              <Select
                label="Fuel Type"
                id="driver-log-fuel-type"
                required
                value={formData.fuel_type}
                onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value })}
                error={fieldErrors.fuel_type}
                options={[
                  { value: 'DIESEL', label: 'Diesel' },
                  { value: 'PETROL', label: 'Petrol' },
                  { value: 'CNG', label: 'CNG' },
                  { value: 'ELECTRIC', label: 'Electric' },
                ]}
              />

              {/* 3. Liters and Amount */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <NumberInput
                  label={`Liters Filled (${getQuantityUnit(formData.fuel_type)})`}
                  id="driver-log-quantity"
                  required
                  min="0.1"
                  step="0.01"
                  placeholder="e.g. 45"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  error={fieldErrors.quantity}
                />

                <NumberInput
                  label="Amount Paid (₹)"
                  id="driver-log-total-cost"
                  required
                  min="1"
                  step="1"
                  placeholder="e.g. 4275"
                  value={formData.total_cost}
                  onChange={(e) => setFormData({ ...formData, total_cost: e.target.value })}
                  error={fieldErrors.total_cost}
                />
              </div>

              {calculatedPricePerLiter && (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '-4px', marginBottom: '8px' }}>
                  Calculated rate: <strong>₹{calculatedPricePerLiter} / liter</strong>
                </div>
              )}

              {priceWarning && (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--warning-text)', marginBottom: '8px' }}>
                  ⚠️ {priceWarning}
                </div>
              )}

              {/* 4. Odometer */}
              <NumberInput
                label="Odometer (km)"
                id="driver-log-odometer"
                required
                min="0"
                step="1"
                placeholder="Current vehicle km"
                value={formData.odometer_km}
                onChange={(e) => setFormData({ ...formData, odometer_km: e.target.value })}
                error={fieldErrors.odometer_km}
              />

              {/* 5. Receipt Photo */}
              <FileInput
                label="Receipt Photo (Camera / Bill)"
                id="driver-log-receipt"
                accept="image/*,application/pdf"
                maxSizeMB={5}
                onChange={(file) => setFormData({ ...formData, receipt_image: file })}
                error={fieldErrors.receipt_image}
                hint="Capture photo or upload bill receipt"
              />

              {/* Optional More Details accordion */}
              <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMoreDetails(!showMoreDetails)}
                  style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
                >
                  {showMoreDetails ? '▲ Hide extra details' : '▼ More details (Date, Full Tank, Station)'}
                </Button>

                {showMoreDetails && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <DateInput
                      label="Refuel Date"
                      id="driver-log-date"
                      max={todayStr}
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      error={fieldErrors.date}
                    />

                    <TextInput
                      label="Station Name"
                      id="driver-log-station"
                      placeholder="e.g. Indian Oil, Airport Road"
                      value={formData.station_name}
                      onChange={(e) => setFormData({ ...formData, station_name: e.target.value })}
                    />

                    <Checkbox
                      label="Full tank refuel"
                      id="driver-log-full-tank"
                      checked={formData.is_full_tank}
                      onChange={(e) => setFormData({ ...formData, is_full_tank: e.target.checked })}
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
            fileName={`fuel_receipt_${Date.now()}`}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
