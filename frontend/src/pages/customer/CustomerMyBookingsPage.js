import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyBookingsApi } from '../../api/customer';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import ViewSwitch from '../../components/common/ViewSwitch';
import { SkeletonCard } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { formatDateTime, formatCurrency } from '../../utils/formatters';
import { SearchInput } from '../../components/forms';
import './CustomerPages.css';

export default function CustomerMyBookingsPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('fleetflow_view_my_bookings') || 'cards'
  );
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'completed' | 'cancelled' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchBookings = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (!append) setLoading(true);
      setError(null);

      const params = {
        page: pageNum,
        page_size: 10,
      };
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await getMyBookingsApi(params);
      const results = res?.results || (Array.isArray(res) ? res : []);

      if (append) {
        setBookings((prev) => [...prev, ...results]);
      } else {
        setBookings(results);
      }
      setHasMore(Boolean(res?.next));
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to load bookings', err);
      setError('Unable to load bookings. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBookings(1, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchBookings]);

  // Tab categorization
  const filteredBookings = bookings.filter((b) => {
    if (activeTab === 'upcoming') {
      return ['PENDING', 'CONFIRMED', 'APPROVED', 'IN_PROGRESS'].includes(b.status);
    }
    if (activeTab === 'completed') {
      return b.status === 'COMPLETED';
    }
    if (activeTab === 'cancelled') {
      return ['CANCELLED', 'REJECTED'].includes(b.status);
    }
    return true;
  });

  const getVehicleIcon = (type) => {
    switch (type) {
      case 'BUS':
        return '🚌';
      case 'BIKE':
        return '🏍️';
      case 'CAR':
      default:
        return '🚗';
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      fetchBookings(page + 1, true);
    }
  };

  return (
    <div className="customer-page fade-in">
      <div className="customer-page-header">
        <div>
          <h1 className="customer-page-title">My Bookings</h1>
          <p className="customer-page-subtitle">
            Manage your rides, track active trips, and view past history
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ViewSwitch
            view={viewMode}
            onChange={setViewMode}
            storageKey="fleetflow_view_my_bookings"
          />
          <Button
            variant="primary"
            onClick={() => navigate('/customer/book')}
          >
            + Book New Trip
          </Button>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div className="bookings-controls-bar">
        <div className="bookings-tabs" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            type="button"
            size="small"
            variant={activeTab === 'upcoming' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('upcoming')}
          >
            Upcoming
          </Button>
          <Button
            type="button"
            size="small"
            variant={activeTab === 'completed' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('completed')}
          >
            Completed
          </Button>
          <Button
            type="button"
            size="small"
            variant={activeTab === 'cancelled' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('cancelled')}
          >
            Cancelled & Rejected
          </Button>
          <Button
            type="button"
            size="small"
            variant={activeTab === 'all' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('all')}
          >
            All Bookings
          </Button>
        </div>

        <div style={{ minWidth: '240px', flex: '1 1 auto', maxWidth: '360px' }}>
          <SearchInput
            placeholder="Search by location, route..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
          />
        </div>
      </div>

      {/* Content */}
      {loading && bookings.length === 0 ? (
        <div className="bookings-list-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchBookings(1, false)} />
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          title={
            activeTab === 'upcoming'
              ? 'No Upcoming Trips'
              : activeTab === 'completed'
              ? 'No Completed Trips'
              : activeTab === 'cancelled'
              ? 'No Cancelled Bookings'
              : 'No Bookings Found'
          }
          description="You do not have any bookings in this section."
          actionText="Book a Vehicle"
          onAction={() => navigate('/customer/book')}
        />
      ) : viewMode === 'table' ? (
        /* Desktop Table View */
        <div className="datatable-wrapper" style={{ marginTop: '16px' }}>
          <div className="datatable-responsive-table">
            <table className="datatable-table">
              <thead>
                <tr>
                  <th className="datatable-th">Booking ID</th>
                  <th className="datatable-th">Type</th>
                  <th className="datatable-th">Route</th>
                  <th className="datatable-th">Date & Time</th>
                  <th className="datatable-th">Passengers</th>
                  <th className="datatable-th align-right">Fare</th>
                  <th className="datatable-th">Status</th>
                  <th className="datatable-th" style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => {
                  const isBus = b?.booking_type === 'BUS_SEAT';
                  const pickup = isBus ? (b?.bus_schedule_detail?.source || b?.pickup_location || b?.source || 'Pickup') : (b?.pickup_location || b?.source || 'Pickup');
                  const drop = isBus ? (b?.bus_schedule_detail?.destination || b?.drop_location || b?.destination || 'Drop') : (b?.drop_location || b?.destination || 'Drop');
                  const travelDate = isBus
                    ? b?.bus_schedule_detail?.departure_datetime || b?.travel_datetime
                    : b?.travel_datetime;

                  return (
                    <tr key={b?.id} className="datatable-tr">
                      <td className="datatable-td" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                        #{b?.id}
                      </td>
                      <td className="datatable-td">
                        {getVehicleIcon(b?.vehicle_type)} {isBus ? 'Bus Seat' : (b?.vehicle_type || 'Vehicle')}
                      </td>
                      <td className="datatable-td">
                        <span style={{ fontWeight: 500 }}>{pickup}</span> → <span style={{ fontWeight: 500 }}>{drop}</span>
                      </td>
                      <td className="datatable-td">{travelDate ? formatDateTime(travelDate) : '—'}</td>
                      <td className="datatable-td">{b?.passengers || 1}</td>
                      <td className="datatable-td align-right" style={{ fontWeight: 700 }}>
                        {b?.estimated_fare ? formatCurrency(b.estimated_fare) : '—'}
                      </td>
                      <td className="datatable-td">
                        <StatusBadge status={b?.status || 'PENDING'} />
                      </td>
                      <td className="datatable-td" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          {b?.status === 'IN_PROGRESS' && (
                            <Button
                              size="small"
                              variant="primary"
                              onClick={() => navigate(`/customer/bookings/${b.id}/track`)}
                            >
                              Track
                            </Button>
                          )}
                          <IconButton
                            action="view"
                            tooltip="View Details"
                            ariaLabel="View Details"
                            onClick={() => navigate(`/customer/bookings/${b?.id}`)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View */
        <div className="bookings-list-grid">
          {filteredBookings.map((b) => {
            const isBus = b?.booking_type === 'BUS_SEAT';
            const pickup = isBus ? (b?.bus_schedule_detail?.source || b?.pickup_location || b?.source || 'Pickup') : (b?.pickup_location || b?.source || 'Pickup');
            const drop = isBus ? (b?.bus_schedule_detail?.destination || b?.drop_location || b?.destination || 'Drop') : (b?.drop_location || b?.destination || 'Drop');
            const travelDate = isBus
              ? b?.bus_schedule_detail?.departure_datetime || b?.travel_datetime
              : b?.travel_datetime;

            return (
              <div key={b.id} className="booking-card">
                <div className="booking-card-top">
                  <div className="booking-vehicle-info">
                    <span className="booking-vehicle-icon">
                      {getVehicleIcon(b.vehicle_type)}
                    </span>
                    <div>
                      <div className="booking-type-title">
                        {isBus ? 'Bus Seat Reservation' : `${b.vehicle_type || 'Vehicle'} Ride`}
                      </div>
                      <div className="booking-id-tag">ID: #{String(b.id)}</div>
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>

                <div className="booking-route-row">
                  <div className="route-point">
                    <span className="dot dot-green" />
                    <span className="route-text">{pickup || 'Pickup'}</span>
                  </div>
                  <div className="route-arrow">➔</div>
                  <div className="route-point">
                    <span className="dot dot-red" />
                    <span className="route-text">{drop || 'Drop'}</span>
                  </div>
                </div>

                <div className="booking-meta-row">
                  <div className="meta-item">
                    <span className="meta-lbl">Date & Time</span>
                    <strong className="meta-val">{formatDateTime(travelDate)}</strong>
                  </div>
                  <div className="meta-item">
                    <span className="meta-lbl">
                      {isBus ? 'Seats' : 'Passengers'}
                    </span>
                    <strong className="meta-val">{b.passengers || 1}</strong>
                  </div>
                  <div className="meta-item">
                    <span className="meta-lbl">Estimated Fare</span>
                    <strong className="meta-val">
                      {b.estimated_fare ? formatCurrency(b.estimated_fare) : '—'}
                    </strong>
                  </div>
                </div>

                <div className="booking-card-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  {b.status === 'IN_PROGRESS' && (
                    <Button
                      size="small"
                      variant="primary"
                      onClick={() => navigate(`/customer/bookings/${b.id}/track`)}
                    >
                      📍 Live Track
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="outline"
                    onClick={() => navigate(`/customer/bookings/${b.id}`)}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination / Load more */}
      {hasMore && (
        <div className="load-more-container" style={{ marginTop: '20px', textAlign: 'center' }}>
          <Button
            variant="outline"
            size="medium"
            onClick={handleLoadMore}
            loading={loading}
            disabled={loading}
          >
            Load More Bookings
          </Button>
        </div>
      )}
    </div>
  );
}
