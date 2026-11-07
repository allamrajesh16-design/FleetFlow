import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPaymentHistoryApi } from '../../api/customer';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import ViewSwitch from '../../components/common/ViewSwitch';
import { SkeletonCard } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import './CustomerPages.css';

export default function CustomerPaymentHistoryPage() {
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('fleetflow_view_payments_history') || 'cards'
  );
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, PAID, PENDING, FAILED, REFUNDED
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchPayments = useCallback(async (pageNum = 1) => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: pageNum,
        page_size: 10,
      };

      if (filterStatus === 'PAID') {
        params.status = 'PAID';
      } else if (filterStatus === 'FAILED') {
        params.status = 'FAILED';
      } else if (filterStatus === 'REFUNDED') {
        params.status = 'REFUNDED';
      } else if (filterStatus === 'PENDING') {
        params.status = 'UNPAID,PAYMENT_INITIATED';
      }

      const res = await getPaymentHistoryApi(params);
      const results = res?.results || (Array.isArray(res) ? res : []);
      const count = res?.count || results.length;

      setPayments(results);
      setTotalCount(count);
      setTotalPages(Math.max(1, Math.ceil(count / 10)));
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to load payment history', err);
      setError('Unable to load payment history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchPayments(1);
  }, [fetchPayments]);

  const filterTabs = [
    { key: 'ALL', label: 'All Payments' },
    { key: 'PAID', label: 'Paid' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'FAILED', label: 'Failed' },
    { key: 'REFUNDED', label: 'Refunded' },
  ];

  return (
    <div className="customer-page fade-in">
      <div className="customer-page-header">
        <div>
          <h1 className="customer-page-title">Payment History</h1>
          <p className="customer-page-subtitle">
            View all trip transactions, receipts, and pending invoices
          </p>
        </div>
        <ViewSwitch
          view={viewMode}
          onChange={setViewMode}
          storageKey="fleetflow_view_payments_history"
        />
      </div>

      {/* Filter Chips */}
      <div className="payment-filter-chips" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {filterTabs.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            size="small"
            variant={filterStatus === tab.key ? 'primary' : 'outline'}
            onClick={() => setFilterStatus(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* List Content */}
      {loading ? (
        <div className="payments-list-container">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchPayments(1)} />
      ) : payments.length === 0 ? (
        <EmptyState
          title="No Payment Records Found"
          description={
            filterStatus === 'ALL'
              ? 'You have not made any payments yet.'
              : `No payments matching the status "${filterStatus}".`
          }
          actionText="View My Bookings"
          onAction={() => navigate('/customer/bookings')}
        />
      ) : viewMode === 'table' ? (
        /* Desktop Table View */
        <div className="datatable-wrapper" style={{ marginTop: '16px' }}>
          <div className="datatable-responsive-table">
            <table className="datatable-table">
              <thead>
                <tr>
                  <th className="datatable-th">Payment ID</th>
                  <th className="datatable-th">Route</th>
                  <th className="datatable-th">Date & Time</th>
                  <th className="datatable-th">Vehicle</th>
                  <th className="datatable-th align-right">Amount</th>
                  <th className="datatable-th">Status</th>
                  <th className="datatable-th" style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const isPaid = p.status === 'PAID';
                  const isUnpaid = p.status === 'UNPAID' || p.status === 'PAYMENT_INITIATED';

                  return (
                    <tr key={p.id} className="datatable-tr">
                      <td className="datatable-td" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                        #{p.id}
                      </td>
                      <td className="datatable-td">
                        {p.trip_source || 'Pickup'} → {p.trip_destination || 'Dropoff'}
                      </td>
                      <td className="datatable-td">{formatDateTime(p.created_at)}</td>
                      <td className="datatable-td">{p.vehicle_registration || '—'}</td>
                      <td className="datatable-td align-right" style={{ fontWeight: 700 }}>
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="datatable-td">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="datatable-td" style={{ textAlign: 'center' }}>
                        {isPaid ? (
                          <IconButton
                            action="view"
                            tooltip="View Receipt"
                            ariaLabel="View Receipt"
                            onClick={() => navigate(`/customer/payments/${p.id}/receipt`)}
                          />
                        ) : isUnpaid ? (
                          <Button
                            size="small"
                            variant="primary"
                            onClick={() => navigate(`/customer/payments/${p.id}/pay`)}
                          >
                            Pay Now
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="outline"
                            onClick={() => navigate(`/customer/payments/${p.id}/receipt`)}
                          >
                            Status
                          </Button>
                        )}
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
        <div className="payments-list-container">
          {payments.map((p) => {
            const isPaid = p.status === 'PAID';
            const isUnpaid = p.status === 'UNPAID' || p.status === 'PAYMENT_INITIATED';

            return (
              <div key={p.id} className="payment-record-card">
                <div className="record-main-col">
                  <div className="record-top-line">
                    <span className="record-id">Payment #{p.id}</span>
                    <StatusBadge status={p.status} />
                  </div>

                  <div className="record-route">
                    <strong>{p.trip_source || 'Pickup'}</strong> ➔{' '}
                    <strong>{p.trip_destination || 'Dropoff'}</strong>
                  </div>

                  <div className="record-meta-line">
                    <span>Date: {formatDateTime(p.created_at)}</span>
                    {p.vehicle_registration && (
                      <span>• Vehicle: {p.vehicle_registration}</span>
                    )}
                    {p.transaction_reference && (
                      <span>• UTR: {p.transaction_reference}</span>
                    )}
                  </div>
                </div>

                <div className="record-side-col">
                  <div className="record-amount">{formatCurrency(p.amount)}</div>

                  <div className="record-action">
                    {isPaid ? (
                      <Button
                        size="small"
                        variant="outline"
                        onClick={() => navigate(`/customer/payments/${p.id}/receipt`)}
                      >
                        View Receipt →
                      </Button>
                    ) : isUnpaid ? (
                      <Button
                        size="small"
                        variant="primary"
                        onClick={() => navigate(`/customer/payments/${p.id}/pay`)}
                      >
                        Pay Now →
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="outline"
                        onClick={() => navigate(`/customer/payments/${p.id}/receipt`)}
                      >
                        View Status →
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pagination-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
          <Button
            type="button"
            size="small"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => fetchPayments(page - 1)}
          >
            ← Previous
          </Button>
          <span className="pagination-info" style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Page {page} of {totalPages} ({totalCount} total)
          </span>
          <Button
            type="button"
            size="small"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => fetchPayments(page + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
