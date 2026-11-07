import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Pagination from '../../components/common/Pagination';
import { Skeleton } from '../../components/common/Loader';
import { RefreshIcon } from '../../components/common/Icons';
import { getTripHistoryApi } from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import './DriverPages.css';

export default function DriverTripHistoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter chips: 'all' | 'COMPLETED' | 'CANCELLED'
  const filterChip = searchParams.get('status') || 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('size') || '10', 10);

  const [trips, setTrips] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const setFilterChip = (status) => {
    setSearchParams({ status, page: '1', size: String(pageSize) });
  };

  const handlePageChange = (newPage) => {
    setSearchParams({ status: filterChip, page: String(newPage), size: String(pageSize) });
  };

  const handlePageSizeChange = (newSize) => {
    setSearchParams({ status: filterChip, page: '1', size: String(newSize) });
  };

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, page_size: pageSize };
      if (filterChip !== 'all') {
        params.status = filterChip;
      }

      const data = await getTripHistoryApi(params);
      const results = Array.isArray(data) ? data : data.results || [];
      setTrips(results);
      setTotalCount(data.count !== undefined ? data.count : results.length);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filterChip, page, pageSize]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="driver-page fade-in">
      {/* Top Header */}
      <div className="driver-page-header">
        <h1 className="driver-page-title">Trip History</h1>
        <IconButton
          icon={<RefreshIcon size={18} />}
          tooltip="Refresh History"
          ariaLabel="Refresh History"
          variant="secondary"
          size="medium"
          onClick={() => fetchHistory(1, false)}
        />
      </div>

      {/* Filter Chips */}
      <div className="driver-filter-chips-row">
        <Button
          variant={filterChip === 'all' ? 'primary' : 'outline'}
          size="small"
          onClick={() => setFilterChip('all')}
        >
          All
        </Button>
        <Button
          variant={filterChip === 'COMPLETED' ? 'primary' : 'outline'}
          size="small"
          onClick={() => setFilterChip('COMPLETED')}
        >
          Completed
        </Button>
        <Button
          variant={filterChip === 'CANCELLED' ? 'primary' : 'outline'}
          size="small"
          onClick={() => setFilterChip('CANCELLED')}
        >
          Cancelled
        </Button>
      </div>

      {/* History List */}
      <div className="driver-history-list">
        {loading ? (
          <div className="driver-skeletons-wrapper">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="driver-history-card">
                <Skeleton height="20px" width="70%" />
                <div style={{ marginTop: '8px' }}>
                  <Skeleton height="14px" width="40%" />
                </div>
              </Card>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchHistory(1, false)} />
        ) : trips.length === 0 ? (
          <EmptyState
            title="No past trips found"
            description="Your completed and cancelled trips will be archived here."
          />
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="driver-history-table-container">
              <div className="data-table-wrapper" style={{ margin: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Trip ID</th>
                      <th style={{ textAlign: 'left' }}>Route</th>
                      <th style={{ textAlign: 'left' }}>Vehicle</th>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th style={{ textAlign: 'left' }}>Status</th>
                      <th style={{ textAlign: 'right' }}>Total Fare</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>#{item.id}</td>
                        <td style={{ fontWeight: 600 }}>
                          {item.source} → {item.destination}
                        </td>
                        <td>{item.vehicle_registration || 'N/A'}</td>
                        <td>{formatDate(item.scheduled_datetime || item.created_at)}</td>
                        <td>
                          <Badge status={item.status} />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          ₹{item.total_fare || '0'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <IconButton
                            action="view"
                            tooltip="View Trip"
                            ariaLabel="View Trip Details"
                            onClick={() => navigate(`/driver/trips/${item.id}`)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards View (< 768px) */}
            <div className="driver-history-mobile-cards">
              {trips.map((item) => (
                <Card key={item.id} className="driver-history-card">
                  <div className="driver-history-top-row">
                    <div className="driver-history-route">
                      <span className="route-from">{item.source}</span>
                      <span className="route-arrow">→</span>
                      <span className="route-to">{item.destination}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => navigate(`/driver/trips/${item.id}`)}
                    >
                      View
                    </Button>
                  </div>

                  <div className="driver-history-meta-row">
                    <span className="driver-history-date">
                      {formatDate(item.scheduled_datetime || item.created_at)}
                    </span>
                    <Badge status={item.status} />
                    {item.total_fare && (
                      <span className="driver-history-fare">
                        ₹{item.total_fare}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination footer on both table and cards */}
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

