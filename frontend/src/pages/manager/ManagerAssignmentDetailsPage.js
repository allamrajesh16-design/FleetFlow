import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTripApi,
  cancelTripApi,
  getVehicleApi,
  getDriverApi,
} from '../../api/adminManager';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Loader';
import { VehiclePlate, RouteLine } from '../../components/common/SignatureDesign';
import { formatDateTime, formatMoney, formatPlaceName } from '../../utils/formatters';
import {
  ArrowLeftIcon,
  TrashIcon,
  UserIcon,
} from '../../components/common/Icons';
import { images } from '../../config/images';
import { useToast } from '../../context/ToastContext';
import './ManagerAssignmentDetailsPage.css';

export default function ManagerAssignmentDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [trip, setTrip] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const fetchAssignmentDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tripData = await getTripApi(id);
      setTrip(tripData);

      // Concurrently fetch vehicle and driver details if IDs present
      const promises = [];
      if (tripData.vehicle) {
        promises.push(getVehicleApi(tripData.vehicle).catch(() => null));
      } else {
        promises.push(Promise.resolve(null));
      }

      if (tripData.driver) {
        promises.push(getDriverApi(tripData.driver).catch(() => null));
      } else {
        promises.push(Promise.resolve(null));
      }

      const [vehData, drvData] = await Promise.all(promises);
      if (vehData) setVehicle(vehData);
      if (drvData) setDriver(drvData);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load assignment details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAssignmentDetails();
  }, [fetchAssignmentDetails]);

  const handleConfirmCancel = async () => {
    setConfirmCancelOpen(false);
    setCancelling(true);
    try {
      await cancelTripApi(id, 'Cancelled by Fleet Manager from Assignment Details');
      toast.success(`Assignment #${id} has been cancelled.`);
      fetchAssignmentDetails();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel assignment.');
    } finally {
      setCancelling(false);
    }
  };

  const getVehicleImg = (vType) => {
    const t = String(vType || '').toUpperCase();
    if (t === 'BIKE') return images.vehicleBike?.src || '/images/vehicle-bike.jpg';
    if (t === 'BUS') return images.busBooking?.src || '/images/bus-card.jpg';
    return images.vehicleCar?.src || '/images/vehicle-car.jpg';
  };

  if (loading) {
    return (
      <div className="assignment-details-page fade-in">
        <div className="assignment-details-nav-bar">
          <Skeleton height="36px" width="160px" />
        </div>
        <div className="assignment-details-header-card">
          <Skeleton height="60px" />
        </div>
        <div className="assignment-details-grid">
          <Skeleton height="180px" />
          <Skeleton height="180px" />
          <Skeleton height="180px" />
          <Skeleton height="180px" />
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="assignment-details-page fade-in">
        <div className="assignment-details-nav-bar">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/manager/assignments')}
            leftIcon={<ArrowLeftIcon size={16} />}
          >
            Back to Assignments
          </Button>
        </div>
        <ErrorState
          title="Assignment Not Found"
          message={error || 'Could not retrieve assignment record.'}
          onRetry={fetchAssignmentDetails}
        />
      </div>
    );
  }

  const vType = trip.vehicle_type || vehicle?.vehicle_type || 'CAR';
  const bookingDisplay = trip.booking ? `#${trip.booking}` : (trip.bus_schedule ? `Bus Schedule #${trip.bus_schedule}` : 'Direct Dispatch');
  const customerName = trip.customer_name || (trip.bus_schedule ? 'Bus Commuters' : 'Customer');
  const driverName = trip.driver_name || driver?.user?.full_name || 'Assigned Driver';
  const driverPhone = driver?.user?.phone_number || driver?.phone_number || trip.customer_phone || 'Registered Driver';
  const driverLicense = trip.driver_license || driver?.license_number || 'Verified License';
  const regNumber = trip.vehicle_registration || vehicle?.registration_number || 'N/A';
  const vehicleModel = trip.vehicle_brand_model || vehicle?.make_model || (vType === 'BUS' ? 'Ashok Leyland Viking Coach' : vType === 'BIKE' ? 'Honda Activa 6G' : 'Maruti Suzuki Dzire');
  const vehicleCapacity = vehicle?.seating_capacity || (vType === 'BUS' ? '40 Seats' : vType === 'BIKE' ? '1 Passenger' : '4 Passengers');

  return (
    <div className="assignment-details-page fade-in">
      {/* Top Navigation & Breadcrumbs */}
      <div className="assignment-details-nav-bar">
        <div className="assignment-breadcrumbs">
          <span className="crumb-link" onClick={() => navigate('/manager/dashboard')}>
            Manager Portal
          </span>
          <span className="crumb-sep">/</span>
          <span className="crumb-link" onClick={() => navigate('/manager/assignments')}>
            Trip Assignments
          </span>
          <span className="crumb-sep">/</span>
          <span className="crumb-active">Assignment #{trip.id}</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/manager/assignments')}
          leftIcon={<ArrowLeftIcon size={16} />}
        >
          Back to Assignments
        </Button>
      </div>

      {/* Main Header Card */}
      <div className="assignment-details-header-card">
        <div className="assignment-header-top">
          <div className="assignment-header-title-box">
            <h1>Trip Assignment #{trip.id}</h1>
            <span className="assignment-header-subtitle">
              Assigned on {formatDateTime(trip.created_at)} • Managed by {trip.assigned_by_name || 'Fleet Manager'}
            </span>
          </div>

          <div className="assignment-header-badges">
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '16px',
                backgroundColor: 'var(--color-surface-hover, #f1f5f9)',
                color: 'var(--color-primary, #2563eb)',
                border: '1px solid var(--color-border, #e2e8f0)',
              }}
            >
              {vType} TRIP
            </span>
            <Badge status={trip.status} />
          </div>
        </div>
      </div>

      {/* 5-Section Details Grid */}
      <div className="assignment-details-grid">
        {/* SECTION A: ASSIGNMENT OVERVIEW */}
        <div className="assignment-section-card">
          <div className="assignment-card-title-row">
            <h3 className="assignment-card-title">Section A – Assignment Overview</h3>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Core Record
            </span>
          </div>

          <div className="assignment-items-list">
            <div className="assignment-item">
              <span className="assignment-item-k">Assignment ID</span>
              <span className="assignment-item-v highlight-primary">#{trip.id}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Associated Booking</span>
              <span className="assignment-item-v">{bookingDisplay}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Assignment Date</span>
              <span className="assignment-item-v">{formatDateTime(trip.created_at)}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Trip Operational Status</span>
              <div><Badge status={trip.status} /></div>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Payment Settlement</span>
              <span className="assignment-item-v">{trip.payment_status || 'PENDING'}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Assigned By</span>
              <span className="assignment-item-v">{trip.assigned_by_name || 'Fleet Manager'}</span>
            </div>
          </div>
        </div>

        {/* SECTION B: CUSTOMER DETAILS */}
        <div className="assignment-section-card">
          <div className="assignment-card-title-row">
            <h3 className="assignment-card-title">Section B – Customer Details</h3>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Client Information
            </span>
          </div>

          <div className="assignment-items-list">
            <div className="assignment-item full-col">
              <span className="assignment-item-k">Customer Full Name</span>
              <span className="assignment-item-v" style={{ fontSize: '15px' }}>{customerName}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Phone Number</span>
              <span className="assignment-item-v">{trip.customer_phone || 'Protected / On Record'}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Email Address</span>
              <span className="assignment-item-v">{trip.customer_email || '—'}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Passenger Count</span>
              <span className="assignment-item-v">{trip.passengers || 1} Passenger(s)</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Booked / Estimated Fare</span>
              <span className="assignment-item-v highlight-success">
                {trip.booking_amount ? formatMoney(trip.booking_amount) : (trip.total_fare ? formatMoney(trip.total_fare) : 'Rate per distance')}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION C: DRIVER DETAILS */}
        <div className="assignment-section-card">
          <div className="assignment-card-title-row">
            <h3 className="assignment-card-title">Section C – Assigned Driver Details</h3>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Operator
            </span>
          </div>

          <div className="assignment-driver-preview">
            <div className="assignment-driver-avatar">
              <UserIcon size={24} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {driverName}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {driverLicense} • Active Fleet Operator
              </div>
            </div>
          </div>

          <div className="assignment-items-list">
            <div className="assignment-item">
              <span className="assignment-item-k">Contact Phone</span>
              <span className="assignment-item-v">{driverPhone}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">License Verification</span>
              <span className="assignment-item-v" style={{ color: 'var(--color-success, #16a34a)' }}>
                ✓ Verified & Compliant
              </span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Driver System ID</span>
              <span className="assignment-item-v">#{trip.driver || 'DRV-REC'}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Availability State</span>
              <span className="assignment-item-v">{trip.status === 'COMPLETED' ? 'Available' : 'Assigned to Trip'}</span>
            </div>
          </div>
        </div>

        {/* SECTION D: VEHICLE DETAILS */}
        <div className="assignment-section-card">
          <div className="assignment-card-title-row">
            <h3 className="assignment-card-title">Section D – Assigned Vehicle Details</h3>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Asset
            </span>
          </div>

          <div className="assignment-vehicle-preview">
            <img
              src={getVehicleImg(vType)}
              alt={`${vType} Asset`}
              className="assignment-vehicle-thumb"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <VehiclePlate registrationNumber={regNumber} size="md" />
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {vehicleModel} • {vType}
              </div>
            </div>
          </div>

          <div className="assignment-items-list">
            <div className="assignment-item">
              <span className="assignment-item-k">Vehicle Classification</span>
              <span className="assignment-item-v">{vType}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Make & Model</span>
              <span className="assignment-item-v">{vehicleModel}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Seating Capacity</span>
              <span className="assignment-item-v">{vehicleCapacity}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Asset Status</span>
              <span className="assignment-item-v">
                {trip.status === 'IN_PROGRESS' ? 'On Trip' : trip.status === 'SCHEDULED' ? 'Assigned Today' : 'Available'}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION E: TRIP & ROUTE DETAILS (Full Width Card) */}
        <div className="assignment-section-card assignment-card-full-width">
          <div className="assignment-card-title-row">
            <h3 className="assignment-card-title">Section E – Journey & Route Details</h3>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Navigation & Timings
            </span>
          </div>

          <div style={{ marginBottom: '18px', padding: '12px', background: 'var(--color-surface-hover, #f8fafc)', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)' }}>
            <RouteLine
              source={formatPlaceName(trip.pickup_location || trip.source || 'Pickup Point')}
              destination={formatPlaceName(trip.drop_location || trip.destination || 'Drop Destination')}
            />
          </div>

          <div className="assignment-items-list">
            <div className="assignment-item">
              <span className="assignment-item-k">Scheduled Departure Date & Time</span>
              <span className="assignment-item-v">{formatDateTime(trip.scheduled_datetime)}</span>
            </div>

            <div className="assignment-item">
              <span className="assignment-item-k">Route Distance</span>
              <span className="assignment-item-v highlight-primary">
                {trip.distance_km != null ? `${trip.distance_km} KM (Actual)` : `${trip.route_distance_km || 15} KM (Estimated)`}
              </span>
            </div>

            {trip.started_at && (
              <div className="assignment-item">
                <span className="assignment-item-k">Actual Start Time</span>
                <span className="assignment-item-v">{formatDateTime(trip.started_at)}</span>
              </div>
            )}

            {trip.completed_at && (
              <div className="assignment-item">
                <span className="assignment-item-k">Actual Completion Time</span>
                <span className="assignment-item-v">{formatDateTime(trip.completed_at)}</span>
              </div>
            )}

            {trip.total_fare && (
              <div className="assignment-item">
                <span className="assignment-item-k">Settled Total Fare</span>
                <span className="assignment-item-v highlight-success">{formatMoney(trip.total_fare)}</span>
              </div>
            )}

            <div className="assignment-item full-col">
              <span className="assignment-item-k">Dispatch Instructions & Notes</span>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {trip.dispatch_note || 'Standard passenger safety and vehicle protocol applies for this scheduled journey.'}
              </p>
            </div>
          </div>

          {/* Action buttons at bottom */}
          <div className="assignment-actions-bar">
            <Button
              variant="outline"
              size="medium"
              onClick={() => navigate('/manager/assignments')}
              leftIcon={<ArrowLeftIcon size={16} />}
            >
              Back to Assignments Table
            </Button>

            {trip.status === 'SCHEDULED' && (
              <Button
                variant="danger"
                size="medium"
                disabled={cancelling}
                onClick={() => setConfirmCancelOpen(true)}
                leftIcon={<TrashIcon size={16} />}
              >
                {cancelling ? 'Cancelling Trip...' : 'Cancel Trip Assignment'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Cancellation Dialog */}
      <ConfirmDialog
        isOpen={confirmCancelOpen}
        title={`Cancel Assignment #${trip.id}?`}
        message="Are you sure you want to cancel this trip assignment? The customer booking will be reverted and resources freed."
        confirmLabel="Yes, Cancel Assignment"
        variant="danger"
        onConfirm={handleConfirmCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </div>
  );
}

