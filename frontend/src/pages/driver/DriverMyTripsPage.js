import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Table from '../../components/common/Table';
import Pagination from '../../components/common/Pagination';
import ViewSwitch from '../../components/common/ViewSwitch';
import { Skeleton } from '../../components/common/Loader';
import { RefreshIcon, ClockIcon } from '../../components/common/Icons';
import { getMyTripsApi } from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import './DriverPages.css';

export default function DriverMyTripsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tabs: 'upcoming' | 'in_progress' | 'completed'
  const activeTab = searchParams.get('tab') || 'upcoming';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('size') || '10', 10);

  const [trips, setTrips] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [tabCounts, setTabCounts] = useState({ upcoming: 0, in_progress: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const setActiveTab = (tab) => {
    setSearchParams({ tab, page: '1', size: String(pageSize) });
  };

  const handlePageChange = (newPage) => {
    setSearchParams({ tab: activeTab, page: String(newPage), size: String(pageSize) });
  };

  const handlePageSizeChange = (newSize) => {
    setSearchParams({ tab: activeTab, page: '1', size: String(newSize) });
  };

  const fetchTabCounts = useCallback(async () => {
    try {
      const [up, inP, comp] = await Promise.all([
        getMyTripsApi('upcoming'),
        getMyTripsApi('in_progress'),
        getMyTripsApi('completed'),
      ]);
      setTabCounts({
        upcoming: up.count !== undefined ? up.count : (Array.isArray(up) ? up.length : up.results?.length || 0),
        in_progress: inP.count !== undefined ? inP.count : (Array.isArray(inP) ? inP.length : inP.results?.length || 0),
        completed: comp.count !== undefined ? comp.count : (Array.isArray(comp) ? comp.length : comp.results?.length || 0),
      });
    } catch (e) {
      // Ignore count fetch errors
    }
  }, []);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMyTripsApi(activeTab);
      const list = Array.isArray(data) ? data : data.results || [];
      setTotalCount(data.count !== undefined ? data.count : list.length);
      setTrips(list);
      fetchTabCounts();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchTabCounts]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('fleetflow_view_driver_trips') || 'table';
    } catch {
      return 'table';
    }
  });

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('fleetflow_view_driver_trips', mode);
    } catch { }
  };

  const formatTripTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString([], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const columns = [
    {
      title: 'Vehicle',
      key: 'vehicle_registration',
      render: (_, trip) => (
        <div>
          <strong>{trip.vehicle_registration || '-'}</strong>
          {trip.vehicle_type && (
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {trip.vehicle_type}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Route',
      key: 'route',
      render: (_, trip) => (
        <span>
          {trip?.source || trip?.pickup_location || '-'} → {trip?.destination || trip?.drop_location || '-'}
        </span>
      ),
    },
    {
      title: 'Scheduled Time',
      key: 'scheduled_datetime',
      render: (val) => formatTripTime(val),
    },
    {
      title: 'Distance',
      key: 'distance_km',
      render: (val) => (val ? `${val} km` : '-'),
    },
    {
      title: 'Status',
      key: 'status',
      render: (val) => <Badge status={val} />,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, trip) => (
        <Button
          size="sm"
          variant={trip.status === 'SCHEDULED' ? 'primary' : 'outline'}
          onClick={() => navigate(`/driver/trips/${trip.id}`)}
        >
          View Details
        </Button>
      ),
    },
  ];

  return (
    <div className="driver-page fade-in">
      {/* Top Header */}
      <div className="driver-page-header">
        <h1 className="driver-page-title">My Trips</h1>
        <IconButton
          icon={<RefreshIcon size={18} />}
          label="Refresh"
          ariaLabel="Refresh Trips"
          onClick={fetchTrips}
          variant="ghost"
          className="driver-refresh-btn"
        />
      </div>

      {/* Tabs */}
      <div className="driver-tabs-container">
        <Button
          type="button"
          variant={activeTab === 'upcoming' ? 'primary' : 'ghost'}
          className={`driver-tab-button ${activeTab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming ({tabCounts.upcoming})
        </Button>
        <Button
          type="button"
          variant={activeTab === 'in_progress' ? 'primary' : 'ghost'}
          className={`driver-tab-button ${activeTab === 'in_progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('in_progress')}
        >
          In Progress ({tabCounts.in_progress})
        </Button>
        <Button
          type="button"
          variant={activeTab === 'completed' ? 'primary' : 'ghost'}
          className={`driver-tab-button ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          Completed ({tabCounts.completed})
        </Button>
      </div>

      {/* View Switch on Desktop */}
      <div className="driver-viewswitch-wrapper" style={{ display: 'flex', justifyContent: 'flex-end', margin: '0.75rem 0' }}>
        <ViewSwitch viewMode={viewMode} onChange={handleViewModeChange} storageKey="fleetflow_view_driver_trips" />
      </div>

      {/* Trips List Area */}
      <div className="driver-trips-list">
        {loading ? (
          <div className="driver-skeletons-wrapper">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="driver-trip-card">
                <Skeleton height="22px" width="70%" />
                <div style={{ marginTop: '8px' }}>
                  <Skeleton height="16px" width="45%" />
                </div>
                <div style={{ marginTop: '8px' }}>
                  <Skeleton height="16px" width="60%" />
                </div>
                <div style={{ marginTop: '14px' }}>
                  <Skeleton height="40px" borderRadius="8px" />
                </div>
              </Card>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchTrips} />
        ) : trips.length === 0 ? (
          <EmptyState
            title="No trips yet"
            description={
              activeTab === 'upcoming'
                ? 'You do not have any upcoming trips scheduled.'
                : activeTab === 'in_progress'
                  ? 'No trip is currently in progress.'
                  : 'No completed trips recorded yet.'
            }
          />
        ) : viewMode === 'table' ? (
          <div className="driver-trips-table-view">
            <Table
              columns={columns}
              data={trips}
              pagination={{
                page,
                pageSize,
                count: totalCount,
                totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
                onPageChange: handlePageChange,
                onPageSizeChange: handlePageSizeChange,
              }}
            />
          </div>
        ) : (
          <>
            {trips.map((trip) => (
              <Card key={trip.id} className="driver-trip-card">
                <div className="driver-card-top-row">
                  <span className="driver-vehicle-badge">
                    {trip.vehicle_type ? `${trip.vehicle_type} • ` : ''}
                    {trip.vehicle_registration || 'Vehicle'}
                  </span>
                  <Badge status={trip.status} />
                </div>

                <div className="driver-trip-route">
                  <span className="driver-route-point">{trip?.source || trip?.pickup_location || '-'}</span>
                  <span className="driver-route-arrow">→</span>
                  <span className="driver-route-point">{trip?.destination || trip?.drop_location || '-'}</span>
                </div>

                <div className="driver-trip-meta">
                  <div className="driver-meta-item">
                    <ClockIcon size={14} />
                    <span>{formatTripTime(trip.scheduled_datetime)}</span>
                  </div>
                  {trip.distance_km !== null && trip.distance_km !== undefined && (
                    <div className="driver-meta-item">
                      <span>{trip.distance_km} km</span>
                    </div>
                  )}
                  {trip.total_fare && (
                    <div className="driver-meta-item driver-fare-tag">
                      <span>₹{trip.total_fare}</span>
                    </div>
                  )}
                </div>

                <Button
                  variant={trip.status === 'SCHEDULED' ? 'primary' : 'outline'}
                  size="medium"
                  fullWidth
                  onClick={() => navigate(`/driver/trips/${trip.id}`)}
                >
                  View Details
                </Button>
              </Card>
            ))}
            {totalCount > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                totalPages={Math.max(1, Math.ceil(totalCount / pageSize))}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
