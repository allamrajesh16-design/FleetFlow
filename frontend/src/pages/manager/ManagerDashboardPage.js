import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getFleetManagerDashboardApi } from '../../api/adminManager';
import DashboardHeaderStrip from "../../components/common/DashboardHeaderStrip";
import StatCard from '../../components/common/StatCard';
import { DonutChart } from '../../components/common/Charts';
import Loader from '../../components/common/Loader';
import ErrorState from '../../components/common/ErrorState';
import ExpiryBadge from '../../components/common/ExpiryBadge';
import { VehiclePlate, StatusDot } from '../../components/common/SignatureDesign';
import AssignedTripsTable from '../../components/manager/AssignedTripsTable';
import {
  VehicleIcon,
  TripIcon,
  BookingIcon,
  SettingsIcon,
  FuelIcon,
  ReceiptIcon,
  DocumentIcon,
} from '../../components/common/Icons';
import { formatDate, formatRupees, formatDocType } from '../../utils/formatters';
import '../admin/AdminPages.css';
import './ManagerPages.css';
import '../shared/FuelExpensesDocuments.css';

export default function ManagerDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);
  const [tripRefreshKey] = useState(0);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      const res = await getFleetManagerDashboardApi();
      setData(res);
    } catch (err) {
      console.error('Failed to load fleet manager dashboard:', err);
      setError(err?.response?.data?.detail || 'Unable to load fleet metrics.');
      setErrorStatus(err?.response?.status || null);
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
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Loader text="Loading fleet overview..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page-container fade-in">
        <ErrorState message={error} status={errorStatus} onRetry={fetchDashboard} />
      </div>
    );
  }

  const tripCounts = data?.trip_status_counts || {};
  const activeCount = Number(tripCounts.IN_PROGRESS || tripCounts.ACTIVE || data?.active_trips || 0);
  const completedCount = Number(tripCounts.COMPLETED || 0);
  const scheduledCount = Number(tripCounts.SCHEDULED || 0);
  const cancelledCount = Number(tripCounts.CANCELLED || 0);

  const donutData = [
    { label: 'Active', value: activeCount, color: 'var(--chart-1)' },
    { label: 'Completed', value: completedCount, color: 'var(--chart-3)' },
    { label: 'Scheduled', value: scheduledCount, color: 'var(--chart-4)' },
    { label: 'Cancelled', value: cancelledCount, color: 'var(--chart-6)' },
  ];

  const totalTripsCount = activeCount + completedCount + scheduledCount + cancelledCount;

  return (
    <div className="admin-page-container fade-in">
      <DashboardHeaderStrip role="manager" title="Fleet Overview" defaultSubtitle="Real-time vehicle availability, active missions, and alerts" />
      <div className="admin-header-row">
        <div>
          <h1>Fleet Overview</h1>
          <p>Real-time vehicle availability, active missions, and maintenance alerts</p>
        </div>
      </div>

      {/* 4 Primary Stat Cards */}
      <div className="dashboard-stats-grid">
        <StatCard
          title="Total Vehicles"
          value={data?.total_vehicles ?? 0}
          icon={<VehicleIcon size={24} />}
          iconBg="var(--blue-50)"
          iconColor="var(--primary)"
          description="Operational fleet roster"
        />
        <StatCard
          title="Active Trips"
          value={data?.active_trips ?? 0}
          icon={<TripIcon size={24} />}
          iconBg="var(--blue-100)"
          iconColor="var(--cyan-600)"
          description="Vehicles currently in transit"
        />
        <StatCard
          title="Pending Approvals"
          value={data?.pending_approvals ?? 0}
          icon={<BookingIcon size={24} />}
          iconBg="var(--warning-bg)"
          iconColor="var(--amber-500)"
          description="Bookings needing dispatch approval"
        />
        <StatCard
          title="Bus Bookings Due"
          value={data?.bus_bookings_due ?? 0}
          icon={<SettingsIcon size={24} />}
          iconBg="var(--success-bg)"
          iconColor="var(--success)"
          description="Schedules near 10h cutoff"
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

      {/* Assigned Trips & Driver Roster Table */}
      <AssignedTripsTable
        refreshKey={tripRefreshKey}
        title="Recently Dispatched Trips & Assigned Drivers"
        subtitle="Live roster of trips assigned to drivers and vehicles across the fleet"
        pageSize={5}
      />

      {/* Middle Grid: Upcoming Maintenance Table + Trip Status Donut */}
      <div className="admin-grid-2col" style={{ marginTop: 'var(--space-6)' }}>
        {/* Upcoming Maintenance Table */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Upcoming Maintenance</h2>
              <span className="admin-card-subtitle">Scheduled workshop and servicing logs</span>
            </div>
            <Link to="/manager/maintenance" className="btn btn-outline btn-sm">
              View All
            </Link>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            {(!data?.upcoming_maintenance || data.upcoming_maintenance.length === 0) ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13.5px' }}>
                No maintenance tasks scheduled
              </div>
            ) : (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>Vehicle</th>
                    <th style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>Task</th>
                    <th style={{ minWidth: '140px', whiteSpace: 'nowrap' }}>Scheduled Date</th>
                    <th style={{ minWidth: '110px', whiteSpace: 'nowrap' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcoming_maintenance.map((m) => (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <VehiclePlate registrationNumber={m.vehicle_registration} size="sm" />
                      </td>
                      <td>{m.title}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(m.scheduled_date)}</td>
                      <td>
                        <StatusDot status={m.status} label={m.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Trip Status Donut Chart */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Trip Status Distribution</h2>
              <span className="admin-card-subtitle">Telemetry status breakdown</span>
            </div>
            <Link to="/manager/trips" className="btn btn-ghost btn-sm">
              Live Trips
            </Link>
          </div>

          <div style={{ padding: 'var(--space-2) 0' }}>
            <DonutChart
              data={donutData}
              totalLabel="Total Trips"
              size={180}
              strokeWidth={26}
            />
            {totalTripsCount === 0 && (
              <p style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                Trip metrics will update as journeys are dispatched and executed.
              </p>
            )}
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
            <Link to="/manager/reports" className="btn btn-outline btn-sm">
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
            <Link to="/manager/documents" className="btn btn-ghost btn-sm">
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
                    to="/manager/documents"
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
