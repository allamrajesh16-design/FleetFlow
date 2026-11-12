import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../common/Button';
import { CheckIcon } from '../common/Icons';
import { downloadTripReceiptPdfApi, downloadReceiptPdfApi } from '../../api/driver';
import { useToast } from '../../context/ToastContext';
import './DriverTripReceipt.css';

/**
 * Professional FleetFlow Digital Trip Receipt Component
 *
 * All 20 required fields:
 * - FleetFlow logo
 * - Receipt Number
 * - Trip ID
 * - Booking ID
 * - Customer Name
 * - Driver Name
 * - Vehicle Registration Number
 * - Pickup Location
 * - Drop Location
 * - Trip Start Time
 * - Trip Completion Time
 * - Starting Odometer
 * - Ending Odometer
 * - Total Distance Travelled
 * - Base Fare
 * - Additional Charges
 * - Total Fare
 * - Payment Method
 * - Payment Status
 * - Payment Transaction Reference (when available)
 *
 * Action buttons:
 * - Download PDF
 * - Print Receipt
 * - View Trip History
 */
export default function DriverTripReceipt({
  trip,
  payment,
  receiptNumber: explicitReceiptNumber,
  completedMethod,
  onViewHistory,
}) {
  const navigate = useNavigate();
  const { success: toastSuccess, info: toastInfo } = useToast();
  const [downloading, setDownloading] = useState(false);

  if (!trip) return null;

  const data = trip.receipt_data || {};
  const currentYear = new Date().getFullYear();

  // 1. Receipt Number
  const receiptNum =
    explicitReceiptNumber ||
    data.receipt_number ||
    payment?.receipt_number ||
    (payment?.receipt && payment.receipt.receipt_number) ||
    `FF-${currentYear}-T${String(trip.id).padStart(5, '0')}`;

  // 2. Trip ID
  const tripIdStr = `#${trip.id}`;

  // 3. Booking ID
  const bookingIdStr =
    trip.booking_id != null
      ? `#${trip.booking_id}`
      : trip.booking
      ? (typeof trip.booking === 'object' ? `#${trip.booking.id}` : `#${trip.booking}`)
      : data.booking_id || (trip.bus_schedule ? `Bus Schedule #${trip.bus_schedule}` : 'Direct Dispatch');

  // 4. Customer Name
  const customerName =
    data.customer_name ||
    trip.customer_name ||
    payment?.customer_name ||
    (trip.bus_schedule ? 'Bus Passengers' : 'Customer');

  // 5. Driver Name
  const driverName =
    data.driver_name ||
    trip.driver_name ||
    (trip.driver?.user?.full_name ? trip.driver.user.full_name : 'Assigned Driver');

  // 6. Vehicle Registration Number
  const vehicleReg =
    data.vehicle_registration ||
    trip.vehicle_registration ||
    trip.vehicle?.registration_number ||
    'N/A';
  const vehicleBrandModel =
    data.vehicle_brand_model ||
    trip.vehicle_brand_model ||
    (trip.vehicle ? `${trip.vehicle.brand || ''} ${trip.vehicle.model || ''}`.trim() : '');

  // 7 & 8. Pickup and Drop Locations
  const pickupLocation =
    data.pickup_location ||
    trip.pickup_location ||
    trip.source ||
    'Origin';
  const dropLocation =
    data.drop_location ||
    trip.drop_location ||
    trip.destination ||
    'Destination';

  // 9 & 10. Start Time & Completion Time
  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const startTimeStr = formatDateTime(trip.started_at || data.started_at);
  const completionTimeStr = formatDateTime(trip.completed_at || data.completed_at || new Date().toISOString());

  // 11 & 12. Starting & Ending Odometer
  const startOdo =
    trip.start_odometer != null
      ? trip.start_odometer
      : (data.start_odometer != null ? data.start_odometer : '—');
  const endOdo =
    trip.end_odometer != null
      ? trip.end_odometer
      : (data.end_odometer != null ? data.end_odometer : '—');

  // 13. Total Distance Travelled
  let distanceKmVal = trip.distance_km != null ? trip.distance_km : data.distance_km;
  if (distanceKmVal == null && trip.end_odometer && trip.start_odometer) {
    distanceKmVal = Number((trip.end_odometer - trip.start_odometer).toFixed(2));
  }
  const distanceStr = distanceKmVal != null ? `${distanceKmVal} km` : '—';

  // 14, 15, 16. Base Fare, Additional Charges, Total Fare
  const totalFareRaw =
    trip.total_fare != null
      ? String(trip.total_fare)
      : payment?.amount != null
      ? String(payment.amount)
      : data.total_fare || '0.00';
  const formattedFare = Number(totalFareRaw).toFixed(2);
  const baseFareStr = `₹${formattedFare}`;
  const addChargesStr = '₹0.00';
  const totalFareStr = `₹${formattedFare}`;

  // 17. Payment Method
  let methodLabel = completedMethod;
  if (!methodLabel) {
    if (payment?.payment_method === 'CASH') methodLabel = 'Cash';
    else if (payment?.payment_method === 'ONLINE') methodLabel = 'Online Transfer (UPI)';
    else if (trip.bus_schedule) methodLabel = 'Bus Passenger Bookings';
    else methodLabel = data.payment_method || 'Cash / Settled';
  }

  // 18. Payment Status
  const paymentStatus =
    payment?.status ||
    data.payment_status ||
    (trip.status === 'COMPLETED' ? 'PAID' : 'PENDING');

  // 19. Payment Transaction Reference
  const txnReference =
    payment?.transaction_reference ||
    payment?.gateway_reference ||
    data.transaction_reference ||
    (payment?.payment_method === 'CASH' ? 'CASH-SETTLED' : 'N/A');

  // Actions
  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      let blob;
      if (payment?.id) {
        blob = await downloadReceiptPdfApi(payment.id);
      } else {
        blob = await downloadTripReceiptPdfApi(trip.id);
      }
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt_${receiptNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toastSuccess('Official PDF receipt downloaded.');
    } catch (err) {
      toastInfo('Generating print version for PDF export...');
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleViewHistory = () => {
    if (onViewHistory) {
      onViewHistory();
    } else {
      navigate('/driver/history');
    }
  };

  return (
    <div className="driver-receipt-wrapper driver-receipt-printable">
      <div className="driver-receipt-card">
        {/* HEADER */}
        <div className="driver-receipt-header">
          <div className="driver-receipt-brand">
            <div className="driver-receipt-logo-icon">
              {/* FleetFlow Official Bus/Car Logo SVG */}
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="15" rx="3" />
                <path d="M3 11h18" />
                <path d="M7 15h.01" />
                <path d="M17 15h.01" />
                <path d="M6 18v3" />
                <path d="M18 18v3" />
              </svg>
            </div>
            <div className="driver-receipt-brand-text">
              <h2>FleetFlow</h2>
              <div className="driver-receipt-tagline">Smart Fleet Mobility Receipt</div>
            </div>
          </div>

          <div className="driver-receipt-meta">
            <span className="driver-receipt-title-badge">Official Receipt</span>
            <div className="driver-receipt-num">{receiptNum}</div>
          </div>
        </div>

        {/* BODY */}
        <div className="driver-receipt-body">
          {/* Status Banner */}
          <div className="driver-receipt-status-banner">
            <div className="driver-receipt-status-left">
              <CheckIcon size={20} color="#059669" />
              <span>Trip Successfully Completed</span>
            </div>
            <span className="driver-receipt-status-badge">{paymentStatus}</span>
          </div>

          {/* SECTION 1: TRIP IDENTIFIERS */}
          <div className="driver-receipt-section">
            <div className="driver-receipt-section-title">
              <span>📋 Trip & Booking Details</span>
            </div>
            <div className="driver-receipt-grid">
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Receipt Number</span>
                <span className="driver-receipt-val highlight badge-val">{receiptNum}</span>
              </div>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Trip ID</span>
                <span className="driver-receipt-val highlight">{tripIdStr}</span>
              </div>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Booking ID</span>
                <span className="driver-receipt-val">{bookingIdStr}</span>
              </div>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Customer Name</span>
                <span className="driver-receipt-val">{customerName}</span>
              </div>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Assigned Driver</span>
                <span className="driver-receipt-val">{driverName}</span>
              </div>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Vehicle Registration</span>
                <span className="driver-receipt-val">
                  <strong>{vehicleReg}</strong> {vehicleBrandModel ? `(${vehicleBrandModel})` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: ROUTE & TIMESTAMPS */}
          <div className="driver-receipt-section">
            <div className="driver-receipt-section-title">
              <span>📍 Route & Timestamps</span>
            </div>
            <div className="driver-receipt-route-box">
              <div className="driver-receipt-route-row">
                <span className="driver-receipt-dot pickup" />
                <div className="driver-receipt-place-text">
                  <div className="driver-receipt-place-title">Pickup Location</div>
                  <div className="driver-receipt-place-val">{pickupLocation}</div>
                </div>
              </div>
              <div className="driver-receipt-route-row">
                <span className="driver-receipt-dot drop" />
                <div className="driver-receipt-place-text">
                  <div className="driver-receipt-place-title">Drop Location</div>
                  <div className="driver-receipt-place-val">{dropLocation}</div>
                </div>
              </div>
            </div>

            <div className="driver-receipt-grid" style={{ marginTop: '14px' }}>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Trip Start Time</span>
                <span className="driver-receipt-val">{startTimeStr}</span>
              </div>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Trip Completion Time</span>
                <span className="driver-receipt-val">{completionTimeStr}</span>
              </div>
            </div>
          </div>

          {/* SECTION 3: ODOMETER & DISTANCE CALCULATION */}
          <div className="driver-receipt-section">
            <div className="driver-receipt-section-title">
              <span>⏱️ Odometer & Distance Travelled</span>
            </div>
            <div className="driver-receipt-grid">
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Starting Odometer</span>
                <span className="driver-receipt-val">{startOdo !== '—' ? `${startOdo} km` : '—'}</span>
              </div>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Ending Odometer</span>
                <span className="driver-receipt-val">{endOdo !== '—' ? `${endOdo} km` : '—'}</span>
              </div>
              <div className="driver-receipt-item" style={{ gridColumn: 'span 2' }}>
                <span className="driver-receipt-label">Total Distance Travelled</span>
                <span className="driver-receipt-val highlight" style={{ fontSize: '16px' }}>
                  {distanceStr}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 4: FARE & PAYMENT DETAILS */}
          <div className="driver-receipt-section">
            <div className="driver-receipt-section-title">
              <span>💳 Fare & Payment Summary</span>
            </div>
            <div className="driver-receipt-fare-table">
              <div className="driver-receipt-fare-row">
                <span>Base Fare</span>
                <strong>{baseFareStr}</strong>
              </div>
              <div className="driver-receipt-fare-row">
                <span>Additional Charges</span>
                <span>{addChargesStr}</span>
              </div>
              <div className="driver-receipt-fare-row total">
                <span>Total Fare</span>
                <span className="driver-receipt-total-fare">{totalFareStr}</span>
              </div>
            </div>

            <div className="driver-receipt-grid" style={{ marginTop: '16px' }}>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Payment Method</span>
                <span className="driver-receipt-val">{methodLabel}</span>
              </div>
              <div className="driver-receipt-item">
                <span className="driver-receipt-label">Payment Status</span>
                <span className="driver-receipt-val highlight">{paymentStatus}</span>
              </div>
              <div className="driver-receipt-item" style={{ gridColumn: 'span 2' }}>
                <span className="driver-receipt-label">Payment Transaction Reference</span>
                <span className="driver-receipt-val badge-val">{txnReference}</span>
              </div>
            </div>
          </div>

          {/* FOOTER NOTE */}
          <div className="driver-receipt-footer-note">
            Thank you for traveling with FleetFlow. This is an official computer-generated digital trip receipt.
          </div>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="driver-receipt-actions">
        <Button
          type="button"
          variant="primary"
          size="large"
          loading={downloading}
          onClick={handleDownloadPdf}
        >
          📥 Download PDF
        </Button>

        <Button
          type="button"
          variant="outline"
          size="large"
          onClick={handlePrint}
        >
          🖨️ Print Receipt
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="large"
          onClick={handleViewHistory}
        >
          📋 View Trip History
        </Button>
      </div>
    </div>
  );
}
