import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import useApiList from '../../hooks/useApiList';
import apiClient from '../../api/client';
import {
  getPaymentSummaryApi,
  confirmPaymentApi,
  rejectPaymentProofApi,
  refundPaymentApi,
  downloadReceiptPdfApi,
  settleCashPaymentApi,
} from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import ViewSwitch from '../../components/common/ViewSwitch';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import StatCard from '../../components/common/StatCard';
import {
  DownloadIcon,
  PaymentIcon,
  AlertCircleIcon,
} from '../../components/common/Icons';
import { formatMoney, formatDateTime } from '../../utils/formatters';
import './AdminPages.css';

export default function AdminPaymentsPage({ canRefund = true }) {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const openId = searchParams.get('open');

  const [summary, setSummary] = useState(null);
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('fleetflow_view_payments') || 'table'
  );
  const [rejectReason, setRejectReason] = useState('');


  const {
    data,
    totalCount,
    totalPages,
    page,
    loading,
    error,
    search,
    filters,
    setPage,
    setSearch,
    setFilter,
    refresh,
  } = useApiList({
    endpoint: '/payments/',
    initialFilters: { status: '', payment_method: '', cash_to_settle: '' },
  });

  const [selectedPayment, setSelectedPayment] = useState(null);
  const [confirmingPayment, setConfirmingPayment] = useState(null);
  const [rejectingPayment, setRejectingPayment] = useState(null);
  const [refundingPayment, setRefundingPayment] = useState(null);
  const [settlingPayment, setSettlingPayment] = useState(null);

  useEffect(() => {
    if (!openId) return;
    const found = data.find((p) => String(p.id) === String(openId));
    if (found) {
      setSelectedPayment(found);
    } else {
      apiClient
        .get(`/payments/${openId}/`)
        .then((res) => {
          if (res.data) setSelectedPayment(res.data);
        })
        .catch(() => {});
    }
  }, [openId, data]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await getPaymentSummaryApi();
      setSummary(res);
    } catch (err) {
      // Ignore background fetch error
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleConfirmPayment = async () => {
    if (!confirmingPayment) return;
    try {
      await confirmPaymentApi(confirmingPayment.id);
      toast.success(`Payment for ${confirmingPayment.customer_name} confirmed successfully.`);
      setConfirmingPayment(null);
      refresh();
      fetchSummary();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to confirm payment.');
    }
  };

  const handleRejectProof = async (reason) => {
    if (!rejectingPayment) return;
    if (!reason || !reason.trim()) {
      toast.error('Please provide a reason for rejecting the payment proof.');
      return;
    }
    try {
      await rejectPaymentProofApi(rejectingPayment.id, reason.trim());
      toast.success(`Payment proof rejected for ${rejectingPayment.customer_name}.`);
      setRejectingPayment(null);
      refresh();
      fetchSummary();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reject proof.');
    }
  };

  const handleRefund = async () => {
    if (!refundingPayment) return;
    try {
      await refundPaymentApi(refundingPayment.id);
      toast.success(`Refund processed for ${refundingPayment.customer_name}.`);
      setRefundingPayment(null);
      refresh();
      fetchSummary();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to process refund.');
    }
  };

  const handleSettleCash = async () => {
    if (!settlingPayment) return;
    try {
      await settleCashPaymentApi(settlingPayment.id);
      toast.success(`Cash payment #${settlingPayment.id} marked as settled.`);
      setSettlingPayment(null);
      refresh();
      fetchSummary();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to settle cash payment.');
    }
  };

  const handleDownloadPdf = async (p) => {
    try {
      toast.success('Generating receipt PDF...');
      await downloadReceiptPdfApi(p.id, p.receipt_number);
    } catch (err) {
      toast.error('Failed to download receipt PDF.');
    }
  };

  const columns = [
    {
      key: 'customer',
      label: 'Customer / Trip',
      render: (p) => (
        <div>
          <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{p.customer_name || 'Customer'}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            {p.trip_source && p.trip_destination ? `${p.trip_source} → ${p.trip_destination}` : 'Trip Fare'} • Ref: {p.gateway_reference || p.transaction_reference || `TXN-${p.id}`}
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (p) => (
        <span style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
          {formatMoney(p.amount)}
        </span>
      ),
    },
    {
      key: 'payment_method',
      label: 'Method',
      render: (p) => (
        <div>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-medium)',
              background: p.payment_method === 'CASH' ? '#dcfce7' : 'var(--color-surface-hover)',
              color: p.payment_method === 'CASH' ? '#15803d' : 'inherit',
              border: `1px solid ${p.payment_method === 'CASH' ? '#86efac' : 'var(--color-border)'}`,
            }}
          >
            {p.payment_method || 'UPI / QR'}
          </span>
          {p.needs_verification && (
            <span
              style={{
                display: 'block',
                marginTop: '4px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
                width: 'fit-content',
              }}
            >
              Needs Verification
            </span>
          )}
          {p.payment_method === 'CASH' && (
            <span
              style={{
                display: 'block',
                marginTop: '2px',
                fontSize: '11px',
                fontWeight: 600,
                color: p.cash_settled ? '#16a34a' : '#d97706',
              }}
            >
              {p.cash_settled ? '✓ Cash Settled' : 'Waiting Settlement'}
            </span>
          )}
          {p.collected_by_name && (
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              By: {p.collected_by_name}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => <Badge status={p.status} />,
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (p) => formatDateTime(p.paid_at || p.created_at),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (p) => (
        <div className="admin-action-btn-group" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <IconButton
            action="view"
            tooltip="View Details"
            ariaLabel="View Receipt"
            onClick={() => setSelectedPayment(p)}
          />

          {(p.status === 'PAID' || p.receipt_number) && (
            <IconButton
              action="download"
              tooltip="Download PDF Receipt"
              ariaLabel="Download PDF Receipt"
              onClick={() => handleDownloadPdf(p)}
            />
          )}

          {p.status === 'PAID' && p.payment_method === 'CASH' && !p.cash_settled && (
            <Button
              type="button"
              size="small"
              variant="success"
              onClick={() => setSettlingPayment(p)}
            >
              Mark cash settled
            </Button>
          )}

          {p.status === 'PAYMENT_INITIATED' && (
            <>
              <Button
                type="button"
                size="small"
                variant="success"
                onClick={() => setConfirmingPayment(p)}
              >
                Confirm
              </Button>
              <Button
                type="button"
                size="small"
                variant="danger"
                onClick={() => setRejectingPayment(p)}
              >
                Reject Proof
              </Button>
            </>
          )}

          {canRefund && p.status === 'PAID' && (
            <Button
              type="button"
              size="small"
              variant="danger-outline"
              onClick={() => setRefundingPayment(p)}
            >
              Refund
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Payment Management"
        subtitle="Track collections, verify UPI transfer receipts, and manage refunds"
        actions={
          <ViewSwitch
            view={viewMode}
            onChange={setViewMode}
            storageKey="fleetflow_view_payments"
          />
        }
      />

      {/* Summary Cards Row from /payments/summary/ */}
      <div className="dashboard-stats-grid">
        <StatCard
          title="Total Collected"
          value={formatMoney(summary?.total_collected || 0)}
          icon={<PaymentIcon size={24} />}
          description="Gross settled revenue"
        />
        <StatCard
          title="Cash Collected"
          value={formatMoney(summary?.cash_collected || 0)}
          icon={<PaymentIcon size={24} color="#16a34a" />}
          description="Total received via Cash"
        />
        <StatCard
          title="Online Collected"
          value={formatMoney(summary?.online_collected || 0)}
          icon={<PaymentIcon size={24} color="#2563eb" />}
          description="Total received via UPI / Online"
        />
        <StatCard
          title="Cash Waiting Settlement"
          value={formatMoney(summary?.cash_waiting_settlement || 0)}
          icon={<AlertCircleIcon size={24} color="#d97706" />}
          description="Cash held by drivers to hand over"
        />
        <StatCard
          title="Pending Amount"
          value={formatMoney(summary?.pending_amount || 0)}
          icon={<AlertCircleIcon size={24} />}
          description="Unconfirmed UPI / QR submissions"
        />
        <StatCard
          title="Failed Payments"
          value={summary?.failed_count ?? 0}
          icon={<AlertCircleIcon size={24} color="var(--status-red-text)" />}
          description="Incomplete or rejected transactions"
        />
      </div>

      {/* Cash to Settle Totals Per Driver */}
      {summary?.cash_by_driver && summary.cash_by_driver.length > 0 && (
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <strong style={{ color: '#92400e', fontSize: '14px' }}>Cash to Settle by Driver:</strong>
          {summary.cash_by_driver.map((d) => (
            <span
              key={d.driver_id || d.driver_name}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #fcd34d',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '13px',
                color: '#78350f',
              }}
            >
              <strong>{d.driver_name}</strong>: {formatMoney(d.total_cash)} ({d.count} {d.count === 1 ? 'trip' : 'trips'})
            </span>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={() => {
          refresh();
          fetchSummary();
        }}
        viewMode={viewMode}
        searchPlaceholder="Search customer, reference, method..."
        search={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={totalPages}
        count={totalCount}
        onPageChange={setPage}
        filters={[
          {
            key: 'filter_view',
            label: 'All Payments',
            value: filters.cash_to_settle === 'true' ? 'cash_to_settle' : filters.status,
            options: [
              { value: '', label: 'All Payments' },
              { value: 'cash_to_settle', label: 'Cash to Settle' },
              { value: 'PAID', label: 'Paid' },
              { value: 'PAYMENT_INITIATED', label: 'Payment Initiated' },
              { value: 'REFUNDED', label: 'Refunded' },
              { value: 'FAILED', label: 'Failed' },
            ],
            onChange: (val) => {
              if (val === 'cash_to_settle') {
                setFilter('cash_to_settle', 'true');
                setFilter('status', '');
              } else {
                setFilter('cash_to_settle', '');
                setFilter('status', val);
              }
            },
          },
          {
            key: 'payment_method',
            label: 'All Methods',
            value: filters.payment_method || '',
            options: [
              { value: '', label: 'All Methods' },
              { value: 'CASH', label: 'Cash' },
              { value: 'UPI', label: 'UPI' },
              { value: 'CARD', label: 'Card' },
            ],
            onChange: (val) => setFilter('payment_method', val),
          },
        ]}
      />

      {/* Payment Receipt Modal */}
      <Modal
        isOpen={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
        title={`Payment Receipt: TXN-${String(selectedPayment?.id || '')}`}
        size="medium"
      >
        {selectedPayment && (
          <div>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Customer</span>
                <span className="detail-value">{selectedPayment.customer_name}</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  {selectedPayment.customer_email}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Amount Paid</span>
                <span className="detail-value" style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-lg)', fontWeight: 'bold' }}>
                  {formatMoney(selectedPayment.amount)}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Payment Method</span>
                <span className="detail-value">{selectedPayment.payment_method || 'UPI'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Status</span>
                <div>
                  <Badge status={selectedPayment.status} />
                </div>
              </div>

              <div className="detail-item">
                <span className="detail-label">Gateway / Reference</span>
                <span className="detail-value">{selectedPayment.gateway_reference || '—'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Transaction Reference</span>
                <span className="detail-value">{selectedPayment.transaction_reference || '—'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Receipt Number</span>
                <span className="detail-value">{selectedPayment.receipt_number || `REC-${selectedPayment.id}`}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Timestamp</span>
                <span className="detail-value">{formatDateTime(selectedPayment.paid_at || selectedPayment.created_at)}</span>
              </div>
            </div>

            {selectedPayment.proof_screenshot && (
              <div style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
                <span className="detail-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                  Customer Transfer Proof Screenshot
                </span>
                <img
                  src={selectedPayment.proof_screenshot}
                  alt="Proof screenshot"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '260px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-3)',
                marginTop: 'var(--space-6)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <Button
                type="button"
                variant="outline"
                icon={<DownloadIcon size={16} />}
                onClick={() => handleDownloadPdf(selectedPayment)}
              >
                Download PDF Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Payment Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmingPayment)}
        onClose={() => setConfirmingPayment(null)}
        onConfirm={handleConfirmPayment}
        title="Confirm Payment Verification"
        message={`Confirm that the transfer of ${formatMoney(confirmingPayment?.amount || 0)} from ${confirmingPayment?.customer_name} has arrived in the fleet bank account?`}
        confirmLabel="Confirm Payment"
        variant="success"
      />

      {/* Reject Proof Dialog */}
      <ConfirmDialog
        isOpen={Boolean(rejectingPayment)}
        onClose={() => setRejectingPayment(null)}
        onConfirm={() => handleRejectProof(rejectReason)}
        title="Reject Payment Proof"
        message={`State reason for rejecting proof from ${rejectingPayment?.customer_name}:`}
        confirmLabel="Reject Proof"
        inputLabel="Reason for Rejection"
        inputValue={rejectReason}
        onInputChange={setRejectReason}
        inputRequired={true}
        inputPlaceholder="e.g. Invalid reference number or unverified transaction amount"
        variant="danger"
      />

      {/* Refund Dialog */}
      <ConfirmDialog
        isOpen={Boolean(refundingPayment)}
        onClose={() => setRefundingPayment(null)}
        onConfirm={handleRefund}
        title="Issue Customer Refund"
        message={`Are you sure you want to refund ${formatMoney(refundingPayment?.amount || 0)} to ${refundingPayment?.customer_name}? This will mark the payment as REFUNDED.`}
        confirmLabel="Execute Refund"
        variant="danger"
      />

      {/* Settle Cash Dialog */}
      <ConfirmDialog
        isOpen={Boolean(settlingPayment)}
        onClose={() => setSettlingPayment(null)}
        onConfirm={handleSettleCash}
        title="Mark Cash Payment Settled"
        message={`Confirm that the cash amount of ${formatMoney(settlingPayment?.amount || 0)} from Driver ${settlingPayment?.collected_by_name || 'Driver'} has been handed over and settled with the company?`}
        confirmLabel="Mark Cash Settled"
        variant="success"
      />
    </div>
  );
}
