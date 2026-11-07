import React, { useState, useEffect, useCallback } from 'react';
import { getReportApi, downloadReportCsvApi } from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import Tabs from '../../components/common/Tabs';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import ExpiryBadge from '../../components/common/ExpiryBadge';
import Button from '../../components/common/Button';
import Loader from '../../components/common/Loader';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import {
  DownloadIcon,
  CheckIcon,
  BookingIcon,
  TripIcon,
  PaymentIcon,
  VehicleIcon,
  FuelIcon,
  ReceiptIcon,
  DocumentIcon,
} from '../../components/common/Icons';
import {
  formatMoney,
  formatRupees,
  formatDateTime,
  formatDate,
  formatFuelQuantity,
  getFuelTypeLabel,
  formatDocType,
} from '../../utils/formatters';
import { DateInput } from '../../components/forms';
import './AdminPages.css';
import '../shared/FuelExpensesDocuments.css';

export default function AdminReportsPage({ isManager = false }) {
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState('bookings');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [error, setError] = useState(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await getReportApi(activeTab, params);
      setReportData(res);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to generate report audit.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateFrom, dateTo, page]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      success(`Downloading ${activeTab} CSV report...`);
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      await downloadReportCsvApi(activeTab, params, `fleetflow_${activeTab}_report.csv`);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2200);
    } catch (err) {
      toastError('Failed to download CSV report.');
    } finally {
      setDownloading(false);
    }
  };

  const baseTabs = [
    { id: 'bookings', label: 'Bookings' },
    { id: 'trips', label: 'Trips' },
    ...(!isManager ? [{ id: 'payments', label: 'Payments' }] : []),
    { id: 'vehicle-utilization', label: 'Vehicle Utilization' },
    { id: 'fuel', label: 'Fuel Report' },
    { id: 'expenses', label: 'Expenses Report' },
    { id: 'documents-expiry', label: 'Documents Expiry' },
    { id: 'vehicle-cost', label: 'Vehicle Cost Analysis' },
  ];

  const summary = reportData?.summary || {};
  const rows = reportData?.rows || [];
  const totalCount = reportData?.count || rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / 10));

  return (
    <div className="admin-page-container fade-in">
      <div className="admin-header-row">
        <div>
          <h1>Operations & Financial Reports</h1>
          <p>Generate detailed audit logs, filter by date ranges, and export datasets to CSV</p>
        </div>

        <div className="admin-header-actions">
          <Button
            type="button"
            variant={downloadSuccess ? 'success' : 'outline'}
            disabled={downloading || loading || rows.length === 0}
            onClick={handleDownloadCsv}
            loading={downloading}
            className={downloading ? 'btn-csv-downloading' : downloadSuccess ? 'btn-csv-success' : ''}
          >
            {downloadSuccess ? (
              <>
                <span className="csv-check-pop"><CheckIcon size={16} /></span>
                Exported!
              </>
            ) : downloading ? (
              <>
                <span className="csv-arrow-drop"><DownloadIcon size={16} /></span>
                Exporting...
              </>
            ) : (
              <>
                <DownloadIcon size={16} />
                Export CSV
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={baseTabs} activeTab={activeTab} onChange={handleTabChange} />

      {/* Date Filter Bar */}
      <div
        className="admin-card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          alignItems: 'center',
          marginBottom: 'var(--space-6)',
          padding: 'var(--space-4) var(--space-6)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Audit Range:
        </span>
        <div style={{ width: '180px' }}>
          <DateInput
            id="report-date-from"
            placeholder="From Date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div style={{ width: '180px' }}>
          <DateInput
            id="report-date-to"
            placeholder="To Date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setPage(1);
            }}
          >
            Reset Dates
          </Button>
        )}
      </div>

      {/* Summary Cards Per Tab */}
      {activeTab === 'bookings' && (
        <div className="dashboard-stats-grid">
          <StatCard
            title="Total Bookings"
            value={summary.total_bookings ?? 0}
            icon={<BookingIcon size={24} />}
            description="All reserved trips"
          />
          <StatCard
            title="Confirmed"
            value={summary.confirmed ?? 0}
            icon={<BookingIcon size={24} />}
            description="Verified reservations"
          />
          <StatCard
            title="Completed"
            value={summary.completed ?? 0}
            icon={<BookingIcon size={24} />}
            description="Finished passenger trips"
          />
          <StatCard
            title="Pending"
            value={summary.pending ?? 0}
            icon={<BookingIcon size={24} />}
            description="Awaiting verification"
          />
        </div>
      )}

      {activeTab === 'trips' && (
        <div className="dashboard-stats-grid">
          <StatCard
            title="Total Trips"
            value={summary.total_trips ?? 0}
            icon={<TripIcon size={24} />}
            description="Executed route journeys"
          />
          <StatCard
            title="Total Distance"
            value={`${summary.total_distance_km ?? 0} km`}
            icon={<TripIcon size={24} />}
            description="Odometer mileage covered"
          />
          <StatCard
            title="Total Trip Fare"
            value={formatMoney(summary.total_fare || 0)}
            icon={<PaymentIcon size={24} />}
            description="Calculated route charges"
          />
          <StatCard
            title="Completed Trips"
            value={summary.completed ?? 0}
            icon={<TripIcon size={24} />}
            description="Successfully closed journeys"
          />
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="dashboard-stats-grid">
          <StatCard
            title="Total Transactions"
            value={summary.total_transactions ?? 0}
            icon={<PaymentIcon size={24} />}
            description="Recorded payments"
          />
          <StatCard
            title="Gross Revenue"
            value={formatMoney(summary.total_revenue || 0)}
            icon={<PaymentIcon size={24} />}
            description="Collected fare amount"
          />
          <StatCard
            title="Paid Count"
            value={summary.paid_count ?? 0}
            icon={<PaymentIcon size={24} />}
            description="Settled transactions"
          />
          <StatCard
            title="Refunded Amount"
            value={formatMoney(summary.total_refunded || 0)}
            icon={<PaymentIcon size={24} />}
            description="Returned customer balances"
          />
        </div>
      )}

      {activeTab === 'vehicle-utilization' && (
        <div className="dashboard-stats-grid">
          <StatCard
            title="Fleet Size"
            value={summary.total_vehicles ?? 0}
            icon={<VehicleIcon size={24} />}
            description="Total registered inventory"
          />
          <StatCard
            title="Trips Executed"
            value={summary.total_trips ?? 0}
            icon={<TripIcon size={24} />}
            description="Total assigned missions"
          />
          <StatCard
            title="Fleet Mileage"
            value={`${summary.total_distance_km ?? 0} km`}
            icon={<TripIcon size={24} />}
            description="Cumulative vehicle usage"
          />
          <StatCard
            title="Generated Revenue"
            value={formatMoney(summary.total_revenue || 0)}
            icon={<PaymentIcon size={24} />}
            description="Fleet earnings contribution"
          />
        </div>
      )}

      {/* NEW TAB: Fuel Summary */}
      {activeTab === 'fuel' && (
        <div className="dashboard-stats-grid">
          <StatCard
            title="Total Fuel Logs"
            value={summary.total_logs ?? 0}
            icon={<FuelIcon size={24} />}
            description="Refuel stops recorded"
          />
          <StatCard
            title="Total Fuel Volume"
            value={`${Number(summary.total_quantity || 0).toLocaleString()} L`}
            icon={<FuelIcon size={24} />}
            description="Fuel dispensed into fleet"
          />
          <StatCard
            title="Total Fuel Expense"
            value={formatRupees(summary.total_cost || 0)}
            icon={<ReceiptIcon size={24} />}
            description="Gross refuel expenditure"
          />
          <StatCard
            title="Average Fuel Rate"
            value={`${formatRupees(summary.average_price_per_unit || 0)}/unit`}
            icon={<FuelIcon size={24} />}
            description="Mean price across fuel types"
          />
        </div>
      )}

      {/* NEW TAB: Expenses Summary */}
      {activeTab === 'expenses' && (
        <div className="dashboard-stats-grid">
          <StatCard
            title="Total Claims"
            value={summary.total_expenses ?? 0}
            icon={<ReceiptIcon size={24} />}
            description="Submitted operational costs"
          />
          <StatCard
            title="Approved Expenses"
            value={formatRupees(summary.total_approved_amount || 0)}
            icon={<ReceiptIcon size={24} />}
            description="Audited and approved"
          />
          <StatCard
            title="Pending Review"
            value={formatRupees(summary.total_pending_amount || 0)}
            icon={<ReceiptIcon size={24} />}
            description="Awaiting manager sign-off"
          />
          <StatCard
            title="Rejected Claims"
            value={formatRupees(summary.total_rejected_amount || 0)}
            icon={<ReceiptIcon size={24} />}
            description="Declined expense entries"
          />
        </div>
      )}

      {/* NEW TAB: Documents Expiry Summary */}
      {activeTab === 'documents-expiry' && (
        <div className="dashboard-stats-grid">
          <StatCard
            title="Total Documents"
            value={summary.total_documents ?? 0}
            icon={<DocumentIcon size={24} />}
            description="Fleet & driver certifications"
          />
          <StatCard
            title="Expired Documents"
            value={summary.expired_count ?? 0}
            icon={<DocumentIcon size={24} />}
            description="Non-compliant / needs renewal"
          />
          <StatCard
            title="Expiring in 30 Days"
            value={summary.expiring_in_30_days_count ?? 0}
            icon={<DocumentIcon size={24} />}
            description="Urgent renewals upcoming"
          />
          <StatCard
            title="Valid Records"
            value={summary.valid_count ?? 0}
            icon={<DocumentIcon size={24} />}
            description="Active compliant records"
          />
        </div>
      )}

      {/* NEW TAB: Vehicle Cost Summary + Horizontal Bar Chart */}
      {activeTab === 'vehicle-cost' && (
        <>
          <div className="dashboard-stats-grid">
            <StatCard
              title="Total Fleet Cost"
              value={formatRupees(summary.grand_total_cost || 0)}
              icon={<ReceiptIcon size={24} />}
              description="Fuel + Expenses + Maintenance"
            />
            <StatCard
              title="Fuel Spend"
              value={formatRupees(summary.total_fuel_cost || 0)}
              icon={<FuelIcon size={24} />}
              description="Fleet refuel expenditure"
            />
            <StatCard
              title="Direct Expenses"
              value={formatRupees(summary.total_expense_cost || 0)}
              icon={<ReceiptIcon size={24} />}
              description="Toll, parking, allowances"
            />
            <StatCard
              title="Overall Cost / km"
              value={`${formatRupees(summary.overall_cost_per_km || 0)}/km`}
              icon={<VehicleIcon size={24} />}
              description={`Across ${Number(summary.total_distance_km || 0).toLocaleString()} km travelled`}
            />
          </div>

          {/* Horizontal Bar Chart for Vehicle Cost & Cost/km */}
          {rows.length > 0 && (
            <div className="ff-card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-6)' }}>
              <h3 className="ff-card-title" style={{ marginBottom: 'var(--space-4)' }}>
                Vehicle Total Cost & Cost per km Comparison
              </h3>
              <div className="ff-bar-list">
                {rows.map((r) => {
                  const maxCost = Math.max(...rows.map((item) => Number(item.total_cost || 0)), 1);
                  const percentage = Math.min(100, Math.max(5, (Number(r.total_cost || 0) / maxCost) * 100));
                  return (
                    <div key={r.vehicle_id || r.registration_number} className="ff-bar-item" style={{ marginBottom: '14px' }}>
                      <div className="ff-bar-info" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div>
                          <strong>{r.registration_number}</strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                            {r.brand} {r.model}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 600 }}>{formatRupees(r.total_cost)}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '10px' }}>
                            ({formatRupees(r.cost_per_km || 0)}/km)
                          </span>
                        </div>
                      </div>
                      <div className="ff-bar-track" style={{ height: '10px', background: 'var(--neutral-bg)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div
                          className="ff-bar-fill"
                          style={{
                            width: `${percentage}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, var(--primary), var(--blue-600))',
                            borderRadius: '5px',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Paginated Report Table */}
      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Loader text="Generating report table..." />
          </div>
        ) : error ? (
          <div style={{ padding: '40px' }}>
            <ErrorState message={error} onRetry={fetchReport} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '40px' }}>
            <EmptyState title="No Records Found" description="Try selecting a different date range or category." />
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                {activeTab === 'bookings' && (
                  <tr>
                    <th>Booking ID</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Route</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                )}
                {activeTab === 'trips' && (
                  <tr>
                    <th>Trip ID</th>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Route</th>
                    <th>Distance</th>
                    <th>Fare</th>
                    <th>Status</th>
                  </tr>
                )}
                {activeTab === 'payments' && (
                  <tr>
                    <th>Payment ID</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                )}
                {activeTab === 'vehicle-utilization' && (
                  <tr>
                    <th>Registration No.</th>
                    <th>Type</th>
                    <th>Trips Run</th>
                    <th>Total Distance</th>
                    <th>Revenue Generated</th>
                    <th>Status</th>
                  </tr>
                )}
                {activeTab === 'fuel' && (
                  <tr>
                    <th>Date</th>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Fuel Type</th>
                    <th>Quantity</th>
                    <th>Price / Unit</th>
                    <th>Total Cost</th>
                    <th>Odometer</th>
                    <th>Mileage</th>
                  </tr>
                )}
                {activeTab === 'expenses' && (
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Vehicle</th>
                    <th>Trip</th>
                    <th>Amount</th>
                    <th>Submitted By</th>
                    <th>Status</th>
                  </tr>
                )}
                {activeTab === 'documents-expiry' && (
                  <tr>
                    <th>Entity Type</th>
                    <th>Owner / Registration</th>
                    <th>Document Type</th>
                    <th>Document No.</th>
                    <th>Issue Date</th>
                    <th>Expiry Date</th>
                    <th>Status</th>
                  </tr>
                )}
                {activeTab === 'vehicle-cost' && (
                  <tr>
                    <th>Vehicle</th>
                    <th>Fuel Cost</th>
                    <th>Approved Expenses</th>
                    <th>Maintenance Cost</th>
                    <th>Total Cost</th>
                    <th>Distance (km)</th>
                    <th>Cost / km</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {activeTab === 'bookings' &&
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>BKG-{String(r.id).padStart(4, '0')}</strong>
                      </td>
                      <td>{r.customer}</td>
                      <td>{r.booking_type}</td>
                      <td>
                        {r.pickup_location} → {r.drop_location}
                      </td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td>{formatDateTime(r.created_at)}</td>
                    </tr>
                  ))}

                {activeTab === 'trips' &&
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>TRP-{String(r.id).padStart(4, '0')}</strong>
                      </td>
                      <td>{r.vehicle}</td>
                      <td>{r.driver}</td>
                      <td>
                        {r.source} → {r.destination}
                      </td>
                      <td>{r.distance_km ? `${r.distance_km} km` : '—'}</td>
                      <td>
                        <strong>{formatMoney(r.total_fare || 0)}</strong>
                      </td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                    </tr>
                  ))}

                {activeTab === 'payments' &&
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>PAY-{String(r.id).padStart(4, '0')}</strong>
                      </td>
                      <td>{r.customer}</td>
                      <td>
                        <strong>{formatMoney(r.amount)}</strong>
                      </td>
                      <td>{r.payment_method}</td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td>{formatDateTime(r.created_at)}</td>
                    </tr>
                  ))}

                {activeTab === 'vehicle-utilization' &&
                  rows.map((r) => (
                    <tr key={r.vehicle_id || r.registration_number}>
                      <td>
                        <strong>{r.registration_number}</strong>
                      </td>
                      <td>{r.vehicle_type}</td>
                      <td>{r.trips_count}</td>
                      <td>{r.total_distance_km} km</td>
                      <td>
                        <strong>{formatMoney(r.total_revenue || 0)}</strong>
                      </td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                    </tr>
                  ))}

                {activeTab === 'fuel' &&
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(r.date)}</td>
                      <td>
                        <strong>{r.vehicle_registration}</strong>
                      </td>
                      <td>{r.driver_name || '-'}</td>
                      <td>{getFuelTypeLabel(r.fuel_type)}</td>
                      <td>{formatFuelQuantity(r.quantity, r.fuel_type)}</td>
                      <td>{formatRupees(r.price_per_unit)}</td>
                      <td>
                        <strong>{formatRupees(r.total_cost)}</strong>
                      </td>
                      <td>{r.odometer_km?.toLocaleString()} km</td>
                      <td>{r.mileage_kmpl != null ? `${Number(r.mileage_kmpl).toFixed(1)} kmpl` : '-'}</td>
                    </tr>
                  ))}

                {activeTab === 'expenses' &&
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(r.date)}</td>
                      <td>
                        <strong>{r.category_display || r.category}</strong>
                      </td>
                      <td>{r.vehicle_registration || '-'}</td>
                      <td>{r.trip_id ? `#${r.trip_id}` : '-'}</td>
                      <td>
                        <strong>{formatRupees(r.amount)}</strong>
                      </td>
                      <td>{r.submitted_by_name || '-'}</td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                    </tr>
                  ))}

                {activeTab === 'documents-expiry' &&
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Badge
                          variant={r.entity_type === 'VEHICLE' ? 'blue' : 'purple'}
                          status={r.entity_type}
                        />
                      </td>
                      <td>
                        <strong>{r.owner_name}</strong>
                      </td>
                      <td>{formatDocType(r.doc_type_display || r.doc_type)}</td>
                      <td>{r.document_number || '-'}</td>
                      <td>{r.issue_date ? formatDate(r.issue_date) : '-'}</td>
                      <td>{formatDate(r.expiry_date)}</td>
                      <td>
                        <ExpiryBadge status={r.expiry_status} daysLeft={r.days_left} />
                      </td>
                    </tr>
                  ))}

                {activeTab === 'vehicle-cost' &&
                  rows.map((r) => (
                    <tr key={r.vehicle_id || r.registration_number}>
                      <td>
                        <strong>{r.registration_number}</strong>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {r.brand} {r.model}
                        </span>
                      </td>
                      <td>{formatRupees(r.fuel_cost)}</td>
                      <td>{formatRupees(r.approved_expenses)}</td>
                      <td>{formatRupees(r.maintenance_cost)}</td>
                      <td>
                        <strong>{formatRupees(r.total_cost)}</strong>
                      </td>
                      <td>{Number(r.distance_travelled || 0).toLocaleString()} km</td>
                      <td>
                        <strong>{formatRupees(r.cost_per_km || 0)}/km</strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-4) var(--space-6)',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                type="button"
                variant="secondary"
                size="small"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="small"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
