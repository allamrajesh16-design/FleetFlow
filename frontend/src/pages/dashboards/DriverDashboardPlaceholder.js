import React, { useState, useEffect } from 'react';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Loader from '../../components/common/Loader';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import {
  TripIcon,
  VehicleIcon,
  FuelIcon,
  ReceiptIcon,
} from '../../components/common/Icons';
import { getDriverDashboardApi } from '../../api/driver';
import { useAuth } from '../../context/AuthContext';
import './Dashboards.css';
import '../shared/FuelExpensesDocuments.css';

export default function DriverDashboardPlaceholder() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDriverDashboardApi()
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <ErrorBoundary>
      <div className="dashboard-page-container fade-in">
        {/* Mobile-styled Welcome Card */}
        <div
          className="dashboard-welcome-banner"
          style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
              alignItems: 'center',
            }}
          >
            <Badge status="Active" text="On Duty" />
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Driver Portal
            </span>
          </div>
          <div className="dashboard-welcome-text">
            <h1 style={{ fontSize: '20px' }}>Hi, {user?.full_name || 'Driver'}!</h1>
            <p>Active route assignments, trip logs, fuel tracking, and expense claims.</p>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Loader text="Loading your dashboard..." />
          </div>
        ) : (
          <>
            {/* Driver Mobile StatCards Grid */}
            <div
              className="dashboard-stats-grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
            >
              <StatCard
                icon={<TripIcon size={20} />}
                value={String(data?.total_assigned_trips ?? 0)}
                label="Assigned Trips"
                iconColor="var(--primary)"
                iconBg="var(--blue-50)"
              />

              <StatCard
                icon={<VehicleIcon size={20} />}
                value={data?.distance_travelled_km != null ? `${data.distance_travelled_km} km` : '0 km'}
                label="Total Distance"
                iconColor="var(--success-text)"
                iconBg="var(--success-bg)"
              />

              {/* Stage 13+ Fuel logs this month */}
              <StatCard
                icon={<FuelIcon size={20} />}
                value={String(data?.own_fuel_logs_this_month ?? 0)}
                label="Fuel Logs This Month"
                iconColor="var(--primary)"
                iconBg="var(--blue-50)"
              />

              {/* Stage 13+ Pending expenses */}
              <StatCard
                icon={<ReceiptIcon size={20} />}
                value={String(data?.own_pending_expenses_count ?? 0)}
                label="Pending Expenses"
                iconColor="var(--warning-text)"
                iconBg="var(--warning-bg)"
              />
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
