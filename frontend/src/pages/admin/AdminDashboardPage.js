import DashboardHeaderStrip from "../../components/common/DashboardHeaderStrip";
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboardApi } from '../../api/adminManager';
import StatCard from '../../components/common/StatCard';
import { LineChart } from '../../components/common/Charts';
import Loader from '../../components/common/Loader';
import ErrorState from '../../components/common/ErrorState';
import ExpiryBadge from '../../components/common/ExpiryBadge';
import { VehiclePlate, StatusDot } from '../../components/common/SignatureDesign';
import {
  VehicleIcon,
  DriverIcon,
  UsersIcon,
  BookingIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  FuelIcon,
  ReceiptIcon,
  DocumentIcon,
} from '../../components/common/Icons';
import { formatMoney, formatRupees, formatDate, formatDateTime, formatDocType } from '../../utils/formatters';
import './AdminPages.css';
import '../shared/FuelExpensesDocuments.css';

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminDashboardApi();
      setData(res);
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
      setError(err?.response?.data?.detail || 'Unable to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="admin-page-container fade-in">
        <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
          <Loader text="Loading dashboard metrics..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page-container fade-in">
        <ErrorState message={error} onRetry={fetchDashboard} />
      </div>
    );
  }

  const revenueSeries = (data?.revenue_last_6_months || []).map((item) => ({
    label: item.month,
    value: Number(item.amount) || 0,
  }));

  const vehicleCounts = data?.vehicle_status_counts || {};

  return (
    <div className="admin-page-container fade-in">
      {/* Page Header */}
      <DashboardHeaderStrip role="admin" title="Admin Dashboard" defaultSubtitle="Real-time overview of fleet operations, users, and revenue" />
      <div className="admin-header-row">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Real-time overview of fleet operations, users, and revenue</p>
        </div>
      </div>

      {/* 4 Stat Cards Row */}
      <div className="dashboard-stats-grid">
        <StatCard
          title="Total Vehicles"
          value={data?.total_vehicles ?? 0}
          icon={<VehicleIcon size={24} />}
          iconBg="var(--blue-50)"
          iconColor="var(--primary)"
          description="Registered fleet inventory"
        />
        <StatCard
          title="Total Drivers"
          value={data?.total_drivers ?? 0}
          icon={<DriverIcon size={24} />}
          iconBg="var(--blue-100)"
          iconColor="var(--cyan-600)"
          description="Active and verified drivers"
        />
        <StatCard
          title="Total Customers"
          value={data?.total_customers ?? 0}
          icon={<UsersIcon size={24} />}
          iconBg="var(--success-bg)"
          iconColor="var(--success)"
          description="Registered platform users"
        />
        <StatCard
          title="Total Bookings"
          value={data?.total_bookings ?? 0}
          icon={<BookingIcon size={24} />}
          iconBg="var(--warning-bg)"
          iconColor="var(--amber-500)"
          description="Total passenger orders"
        />
      </div>

      {/* Stage 14: Fuel, Expenses, and Document Expiry Cards */}
      <div className="dashboard-stats-grid" style={{ marginTop: 'var(--space-4)' }}>
        <StatCard
          title="Fuel Cost This Month"
          value={formatRupees(data?.fuel_cost_this_month || 0)}
          icon={<FuelIcon size={24} />}
          description="Current month fleet refuels"
        />
        <StatCard
          title="Expenses This Month"
          value={formatRupees(data?.expenses_this_month || 0)}
          icon={<ReceiptIcon size={24} />}
          description="Current month operational spend"
        />
        <StatCard
          title="Expiring Documents"
          value={data?.expiring_documents_count ?? 0}
          icon={<DocumentIcon size={24} />}
          description="Expiring in next 30 days"
        />
        <StatCard
          title="Expired Documents"
          value={data?.expired_documents_count ?? 0}
          icon={<DocumentIcon size={24} />}
          description="Immediate compliance attention"
        />
      </div>

      {/* Middle Grid: Revenue Overview LineChart + Recent Bookings */}
      <div className="admin-grid-2col">
        {/* Revenue Overview Chart */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Revenue Overview</h2>
              <span className="admin-card-subtitle">Last 6 months performance</span>
            </div>
            <Link to="/admin/payments" className="btn btn-outline btn-sm">
              View All
            </Link>
          </div>

          <div className="admin-revenue-display">
            <span className="admin-revenue-val">{formatMoney(data?.revenue || 0)}</span>
            <span className="admin-revenue-label">Total platform revenue</span>
          </div>

          <div style={{ height: '240px', width: '100%' }}>
            {revenueSeries.length > 0 ? (
              <LineChart data={revenueSeries} height={230} color="var(--color-primary)" />
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No revenue history available
              </div>
            )}
          </div>
        </div>

        {/* Recent Bookings Table */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Recent Bookings</h2>
              <span className="admin-card-subtitle">Latest customer reservations</span>
            </div>
            <Link to="/admin/bookings" className="btn btn-ghost btn-sm">
              See All
            </Link>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            {(!data?.recent_bookings || data.recent_bookings.length === 0) ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13.5px' }}>
                No recent bookings recorded
              </div>
            ) : (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>Booking</th>
                    <th style={{ minWidth: '160px', whiteSpace: 'nowrap' }}>Customer</th>
                    <th style={{ minWidth: '110px', whiteSpace: 'nowrap' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_bookings.slice(0, 5).map((b) => (
                    <tr key={b.id}>
                      <td>
                        <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                          BKG-{String(b.id).padStart(4, '0')}
                        </span>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          {b.booking_type === 'BUS_SEAT' ? 'Bus Seat' : 'Private Vehicle'}
                        </div>
                      </td>
                      <td>
                        <div>{b.customer_name || 'Customer'}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          {formatDateTime(b.created_at)}
                        </div>
                      </td>
                      <td>
                        <StatusDot status={b.status} label={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Pending Approvals & Vehicle Status Distribution */}
      <div className="admin-grid-2col">
        {/* Pending Approvals Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Pending Approvals</h2>
              <span className="admin-card-subtitle">Staff and driver onboarding requests</span>
            </div>
            <Link to="/admin/approvals" className="btn btn-outline btn-sm">
              Review Queue
            </Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-2) 0' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-lg)',
                background: (data?.pending_approvals || 0) > 0 ? 'var(--status-orange-bg)' : 'var(--status-green-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: (data?.pending_approvals || 0) > 0 ? 'var(--status-orange-text)' : 'var(--status-green-text)',
              }}
            >
              {(data?.pending_approvals || 0) > 0 ? <AlertCircleIcon size={30} /> : <CheckCircleIcon size={30} />}
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)' }}>
                {data?.pending_approvals || 0}
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                {(data?.pending_approvals || 0) > 0
                  ? 'Accounts waiting for administrator verification'
                  : 'All registration requests processed'}
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle Status Breakdown */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Fleet Availability</h2>
              <span className="admin-card-subtitle">Current vehicle states</span>
            </div>
            <Link to="/admin/vehicles" className="btn btn-ghost btn-sm">
              Manage Fleet
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', textAlign: 'center' }}>
            <div style={{ padding: 'var(--space-3)', background: 'var(--status-green-bg)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--status-green-text)' }}>
                {vehicleCounts.ACTIVE || 0}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--status-green-text)' }}>
                ACTIVE
              </div>
            </div>

            <div style={{ padding: 'var(--space-3)', background: 'var(--status-orange-bg)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--status-orange-text)' }}>
                {vehicleCounts.MAINTENANCE || 0}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--status-orange-text)' }}>
                MAINTENANCE
              </div>
            </div>

            <div style={{ padding: 'var(--space-3)', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)' }}>
                {vehicleCounts.ON_TRIP || 0}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-primary)' }}>
                ON TRIP
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stage 14: Top 5 Cost Vehicles & Next 5 Expiring Documents */}
      <div className="admin-grid-2col" style={{ marginTop: 'var(--space-6)' }}>
        {/* Top 5 Cost Vehicles */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Top 5 Cost Vehicles</h2>
              <span className="admin-card-subtitle">Highest cumulative spend (Fuel + Expenses + Maint.)</span>
            </div>
            <Link to="/admin/reports" className="btn btn-outline btn-sm">
              Full Report
            </Link>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            {(!data?.top_cost_vehicles || data.top_cost_vehicles.length === 0) ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No vehicle cost records logged yet
              </div>
            ) : (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Total Cost</th>
                    <th>Cost / km</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_cost_vehicles.map((v) => (
                    <tr key={v.vehicle_id || v.registration_number}>
                      <td>
                        <VehiclePlate registrationNumber={v.registration_number} size="sm" />
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                          {v.brand} {v.model}
                        </span>
                      </td>
                      <td>
                        <strong>{formatRupees(v.total_cost || 0)}</strong>
                      </td>
                      <td>{formatRupees(v.cost_per_km || 0)}/km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Next 5 Expiring Documents */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Urgent Document Renewals</h2>
              <span className="admin-card-subtitle">Next 5 certificates requiring attention</span>
            </div>
            <Link to="/admin/documents" className="btn btn-ghost btn-sm">
              Documents Console
            </Link>
          </div>

          <div style={{ padding: '0 var(--space-4)' }}>
            {(!data?.next_5_expiring_documents || data.next_5_expiring_documents.length === 0) ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--success-text)', fontWeight: 500 }}>
                ✓ All vehicle and driver documents are valid!
              </div>
            ) : (
              <div className="ff-urgent-list" style={{ marginTop: 'var(--space-2)' }}>
                {data.next_5_expiring_documents.map((doc) => (
                  <Link
                    key={doc.id}
                    to="/admin/documents"
                    className="ff-urgent-item"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="ff-urgent-owner">
                      <strong>{doc.target || doc.entity_name || `Doc #${doc.id}`}</strong>
                      <span className="ff-urgent-type">
                        {formatDocType(doc.doc_type_display || doc.doc_type)} (Expires {formatDate(doc.expiry_date)})
                      </span>
                    </div>
                    <ExpiryBadge status={doc.expiry_status} daysLeft={doc.days_left} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
