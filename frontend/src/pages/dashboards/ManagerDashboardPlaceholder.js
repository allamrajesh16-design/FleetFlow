import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import ExpiryBadge from '../../components/common/ExpiryBadge';
import Button from '../../components/common/Button';
import Loader from '../../components/common/Loader';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import {
  VehicleIcon,
  TripIcon,
  SettingsIcon,
  FuelIcon,
  ReceiptIcon,
  DocumentIcon,
} from '../../components/common/Icons';
import { getFleetManagerDashboardApi } from '../../api/adminManager';
import { useAuth } from '../../context/AuthContext';
import { formatRupees, formatDate, formatDocType } from '../../utils/formatters';
import './Dashboards.css';
import '../shared/FuelExpensesDocuments.css';

export default function ManagerDashboardPlaceholder() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getFleetManagerDashboardApi()
      .then((res) => setData(res))
      .catch((err) => setError('Failed to load fleet dashboard statistics.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ErrorBoundary>
      <div className="dashboard-page-container fade-in">
        {/* Welcome Banner */}
        <div className="dashboard-welcome-banner">
          <div className="dashboard-welcome-text">
            <h1>Welcome, {user?.full_name || 'Fleet Manager'}!</h1>
            <p>Fleet Operations Hub: Dispatch, Vehicle Health, Fuel, Expenses & Compliance</p>
          </div>
          <Badge status="Active" text="Ops Ready" />
        </div>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Loader text="Loading fleet operations..." />
          </div>
        ) : error ? (
          <div className="dashboard-coming-soon-card" style={{ borderColor: 'var(--color-danger)' }}>
            <p style={{ color: 'var(--color-danger)' }}>{error}</p>
          </div>
        ) : (
          <>
            {/* Primary Operations Grid */}
            <div className="dashboard-stats-grid">
              <StatCard
                icon={<VehicleIcon size={22} />}
                value={data?.active_vehicles != null ? `${data.active_vehicles} / ${data.total_vehicles || 0}` : '0'}
                label="Vehicles In Service"
                iconColor="var(--success-text)"
                iconBg="var(--success-bg)"
              />

              <StatCard
                icon={<TripIcon size={22} />}
                value={data?.live_trips != null ? String(data.live_trips) : '0'}
                label="Live Dispatched Trips"
                iconColor="var(--primary)"
                iconBg="var(--blue-50)"
              />

              <StatCard
                icon={<SettingsIcon size={22} />}
                value={data?.maintenance_vehicles != null ? String(data.maintenance_vehicles) : '0'}
                label="Maintenance In Progress"
                iconColor="var(--warning-text)"
                iconBg="var(--warning-bg)"
              />

              <StatCard
                icon={<VehicleIcon size={22} />}
                value={data?.total_vehicles != null ? String(data.total_vehicles) : '0'}
                label="Total Registered Fleet"
                iconColor="var(--neutral-text)"
                iconBg="var(--neutral-bg)"
              />
            </div>

            {/* Stage 13+ Compliance & Fuel/Expense Grid */}
            <div className="dashboard-stats-grid">
              <StatCard
                icon={<FuelIcon size={22} />}
                value={formatRupees(data?.fuel_cost_this_month || 0)}
                label="Fuel Cost This Month"
                iconColor="var(--primary)"
                iconBg="var(--blue-50)"
              />

              <StatCard
                icon={<ReceiptIcon size={22} />}
                value={formatRupees(data?.expenses_this_month || 0)}
                label="Expenses This Month"
                iconColor="var(--purple-text)"
                iconBg="var(--purple-bg)"
              />

              <StatCard
                icon={<DocumentIcon size={22} />}
                value={String(data?.expiring_documents_count ?? 0)}
                label="Expiring Documents (30d)"
                iconColor="var(--warning-text)"
                iconBg="var(--warning-bg)"
              />

              <StatCard
                icon={<DocumentIcon size={22} />}
                value={String(data?.expired_documents_count ?? 0)}
                label="Expired Documents"
                iconColor="var(--danger)"
                iconBg="var(--danger-bg)"
              />
            </div>

            {/* Two Column Section: Top Cost Vehicles & Next Expiring Documents */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--space-6)' }}>
              {/* Top 5 Cost Vehicles */}
              <div className="ff-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 className="ff-card-title">Top 5 Cost Vehicles</h3>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => navigate('/manager/reports')}
                  >
                    View All
                  </Button>
                </div>

                {(!data?.top_cost_vehicles || data.top_cost_vehicles.length === 0) ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No vehicle cost records logged yet.
                  </div>
                ) : (
                  <div className="ff-subtable-responsive">
                    <table className="ff-subtable">
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
                              <strong>{v.registration_number}</strong>
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                  </div>
                )}
              </div>

              {/* Next 5 Expiring Documents */}
              <div className="ff-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 className="ff-card-title">Urgent Document Renewals</h3>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => navigate('/manager/documents')}
                  >
                    Documents Console
                  </Button>
                </div>

                {(!data?.next_5_expiring_documents || data.next_5_expiring_documents.length === 0) ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--success-text)', fontWeight: 500 }}>
                    ✓ All fleet & driver documents are up to date!
                  </div>
                ) : (
                  <div className="ff-urgent-list">
                    {data.next_5_expiring_documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="ff-urgent-item"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate('/manager/documents')}
                        title="Click to view in Documents page"
                      >
                        <div className="ff-urgent-owner">
                          <strong>{doc.target || doc.entity_name || `Doc #${doc.id}`}</strong>
                          <span className="ff-urgent-type">
                            {formatDocType(doc.doc_type_display || doc.doc_type)} (Expires {formatDate(doc.expiry_date)})
                          </span>
                        </div>
                        <ExpiryBadge status={doc.expiry_status} daysLeft={doc.days_left} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
