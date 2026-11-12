import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import IconButton from './IconButton';
import { VehiclePlate, StatusDot } from './SignatureDesign';
import { Textarea } from '../forms';
import { formatRupees, formatDate } from '../../utils/formatters';
import './ReviewDrawer.css';

export default function ReviewDrawer({
  isOpen,
  onClose,
  title = 'Review Item',
  type = 'fuel', // 'fuel' | 'expense' | 'document'
  data = null,
  onApprove,
  onReject,
  loading = false,
}) {
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');

  // Fixed position body scroll lock
  useEffect(() => {
    if (!isOpen || !data) return;
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;

    const origBodyOverflow = document.body.style.overflow;
    const origBodyPosition = document.body.style.position;
    const origBodyTop = document.body.style.top;
    const origBodyLeft = document.body.style.left;
    const origBodyWidth = document.body.style.width;
    const origBodyHeight = document.body.style.height;
    const origHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = `-${scrollX}px`;
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    return () => {
      document.documentElement.style.overflow = origHtmlOverflow;
      document.body.style.overflow = origBodyOverflow;
      document.body.style.position = origBodyPosition;
      document.body.style.top = origBodyTop;
      document.body.style.left = origBodyLeft;
      document.body.style.width = origBodyWidth;
      document.body.style.height = origBodyHeight;
      if (typeof window.scrollTo === 'function') {
        try {
          window.scrollTo(scrollX, scrollY);
        } catch (_) {}
      }
    };
  }, [isOpen, data]);

  if (!isOpen || !data) return null;

  const handleApprove = async () => {
    if (onApprove) {
      await onApprove(data);
    }
  };

  const handleConfirmReject = async () => {
    if (!reason.trim()) return;
    if (onReject) {
      await onReject(data, reason.trim());
    }
  };

  const renderDetails = () => {
    if (type === 'fuel') {
      return (
        <>
          <div className="review-drawer-grid">
            <div className="review-drawer-item">
              <span className="review-drawer-label">Vehicle</span>
              <div className="review-drawer-val">
                <VehiclePlate registrationNumber={data.vehicle_registration || '—'} size="sm" />
              </div>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Driver</span>
              <span className="review-drawer-val">{data.driver_name || 'Not recorded'}</span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Date</span>
              <span className="review-drawer-val">{formatDate(data.date)}</span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Fuel Station</span>
              <span className="review-drawer-val">{data.station_name || 'Station'}</span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Fuel Type & Quantity</span>
              <span className="review-drawer-val">
                {data.fuel_type} • {data.quantity} {data.fuel_type === 'CNG' ? 'kg' : 'L'}
              </span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Total Amount</span>
              <span className="review-drawer-val" style={{ color: 'var(--color-primary)', fontSize: '16px' }}>
                {formatRupees(data.total_cost || 0)}
              </span>
            </div>
            {data.odometer_km && (
              <div className="review-drawer-item">
                <span className="review-drawer-label">Odometer</span>
                <span className="review-drawer-val">{data.odometer_km} km</span>
              </div>
            )}
            <div className="review-drawer-item">
              <span className="review-drawer-label">Status</span>
              <div className="review-drawer-val">
                <StatusDot status={data.review_status || 'PENDING'} label={data.review_status || 'Pending Review'} />
              </div>
            </div>
          </div>

          {data.receipt_url && (
            <div className="review-drawer-preview">
              <div className="review-drawer-label" style={{ marginBottom: '8px' }}>Receipt Document</div>
              <img src={data.receipt_url} alt="Fuel Receipt" />
            </div>
          )}
        </>
      );
    }

    if (type === 'expense') {
      return (
        <>
          <div className="review-drawer-grid">
            <div className="review-drawer-item">
              <span className="review-drawer-label">Category</span>
              <span className="review-drawer-val">{data.category || 'Operational'}</span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Amount</span>
              <span className="review-drawer-val" style={{ color: 'var(--color-primary)', fontSize: '16px' }}>
                {formatRupees(data.amount || 0)}
              </span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Date</span>
              <span className="review-drawer-val">{formatDate(data.date)}</span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Vehicle</span>
              <div className="review-drawer-val">
                <VehiclePlate registrationNumber={data.vehicle_registration || '—'} size="sm" />
              </div>
            </div>
          </div>
          {data.description && (
            <div style={{ marginBottom: '16px' }}>
              <span className="review-drawer-label">Description</span>
              <p style={{ margin: '4px 0 0', fontSize: '13.5px' }}>{data.description}</p>
            </div>
          )}
        </>
      );
    }

    if (type === 'document') {
      return (
        <>
          <div className="review-drawer-grid">
            <div className="review-drawer-item">
              <span className="review-drawer-label">Document Type</span>
              <span className="review-drawer-val">{data.doc_type_display || data.doc_type}</span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Document Number</span>
              <span className="review-drawer-val">{data.doc_number || 'N/A'}</span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Target Entity</span>
              <span className="review-drawer-val">{data.target_name || data.vehicle_registration || 'Fleet'}</span>
            </div>
            <div className="review-drawer-item">
              <span className="review-drawer-label">Expiry Date</span>
              <span className="review-drawer-val">{formatDate(data.expiry_date)}</span>
            </div>
          </div>
          {data.file_url && (
            <div className="review-drawer-preview">
              <div className="review-drawer-label" style={{ marginBottom: '8px' }}>Document Preview</div>
              <img src={data.file_url} alt="Compliance Document" />
            </div>
          )}
        </>
      );
    }

    return null;
  };

  return createPortal(
    <div className="review-drawer-backdrop" onClick={onClose}>
      <div className="review-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="review-drawer-header">
          <div className="review-drawer-title-box">
            <h3>{title}</h3>
            <p>Review submission details and verify authenticity</p>
          </div>
          <IconButton action="close" tooltip="Close Drawer" ariaLabel="Close Drawer" onClick={onClose} />
        </div>

        <div className="review-drawer-body">
          {renderDetails()}

          {rejectMode && (
            <div className="review-drawer-reject-box">
              <Textarea
                label="Rejection Reason (Required)"
                placeholder="State clearly why this submission is rejected..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <Button size="small" variant="outline" onClick={() => setRejectMode(false)}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  disabled={!reason.trim() || loading}
                  loading={loading}
                  onClick={handleConfirmReject}
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="review-drawer-footer">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          {!rejectMode && (
            <>
              <Button
                variant="danger"
                onClick={() => setRejectMode(true)}
                disabled={loading || data.review_status === 'REJECTED'}
              >
                Reject
              </Button>
              <Button
                variant="success"
                onClick={handleApprove}
                disabled={loading || data.review_status === 'APPROVED'}
                loading={loading}
              >
                Approve
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
