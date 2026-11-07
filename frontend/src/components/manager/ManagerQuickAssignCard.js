import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  listBookingsApi,
  getAssignableResourcesApi,
  assignTripApi,
} from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import Button from '../common/Button';
import Loader from '../common/Loader';
import { TextInput, DateTimeInput, Select } from '../forms';

export default function ManagerQuickAssignCard({ onAssigned }) {
  const toast = useToast();

  const [loadingBookings, setLoadingBookings] = useState(true);
  const [approvedBookings, setApprovedBookings] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState('');

  const [loadingResources, setLoadingResources] = useState(false);
  const [resources, setResources] = useState({ vehicles: [], drivers: [] });
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');

  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [datetime, setDatetime] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // 1. Load approved bookings that do not have a trip yet
  const loadApprovedBookings = useCallback(async () => {
    setLoadingBookings(true);
    try {
      const res = await listBookingsApi({
        status: 'APPROVED',
        has_trip: false,
        page_size: 50,
      });
      const list = res?.results || (Array.isArray(res) ? res : []);
      setApprovedBookings(list);
      if (list.length > 0 && !selectedBookingId) {
        setSelectedBookingId(String(list[0].id));
      }
    } catch {
      console.error('Failed to load approved bookings for assignment');
    } finally {
      setLoadingBookings(false);
    }
  }, [selectedBookingId]);

  useEffect(() => {
    loadApprovedBookings();
  }, [loadApprovedBookings]);

  // 2. Load available vehicles & drivers for selected booking
  useEffect(() => {
    if (!selectedBookingId) {
      setResources({ vehicles: [], drivers: [] });
      setSelectedVehicleId('');
      setSelectedDriverId('');
      return;
    }

    const currentBooking = approvedBookings.find(
      (b) => String(b.id) === String(selectedBookingId)
    );
    if (currentBooking) {
      setSource(currentBooking.pickup_location || '');
      setDestination(currentBooking.drop_location || '');
      if (currentBooking.travel_datetime) {
        setDatetime(currentBooking.travel_datetime.substring(0, 16));
      }
    }

    let isMounted = true;
    setLoadingResources(true);
    setFormError('');

    getAssignableResourcesApi({ booking: selectedBookingId, include_unavailable: false })
      .then((data) => {
        if (!isMounted) return;
        const availableVehicles = (data?.vehicles || []).filter((v) => v.available);
        const availableDrivers = (data?.drivers || []).filter((d) => d.available);

        setResources({
          vehicles: availableVehicles,
          drivers: availableDrivers,
        });

        // Pre-select first available vehicle and driver
        setSelectedVehicleId(availableVehicles.length > 0 ? String(availableVehicles[0].id) : '');
        setSelectedDriverId(availableDrivers.length > 0 ? String(availableDrivers[0].id) : '');
      })
      .catch((err) => {
        if (!isMounted) return;
        setFormError(err?.response?.data?.detail || 'Failed to query available resources.');
      })
      .finally(() => {
        if (isMounted) setLoadingResources(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBookingId, approvedBookings]);

  // 3. Handle Assignment Submission
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!selectedBookingId || !selectedVehicleId || !selectedDriverId) {
      setFormError('Please select a booking, an available vehicle, and an active driver.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const payload = {
        booking: parseInt(selectedBookingId, 10),
        vehicle: parseInt(selectedVehicleId, 10),
        driver: parseInt(selectedDriverId, 10),
        source: source.trim(),
        destination: destination.trim(),
        scheduled_datetime: datetime,
      };

      const res = await assignTripApi(payload);
      toast.success(`Trip #${res.id} successfully assigned and dispatched!`);

      // Reset and trigger refresh
      setSelectedBookingId('');
      setSelectedVehicleId('');
      setSelectedDriverId('');
      await loadApprovedBookings();

      if (onAssigned) {
        onAssigned(res);
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to dispatch trip. Please check driver/vehicle availability.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const bookingOptions = [
    { value: '', label: '-- Select an approved booking --' },
    ...approvedBookings.map((b) => ({
      value: String(b.id),
      label: `Booking #${b.id} — ${b.customer_name || 'Customer'} (${b.vehicle_type || 'Vehicle'}) | ${b.pickup_location || 'Start'} → ${b.drop_location || 'End'}`,
    })),
  ];

  const vehicleOptions = [
    { value: '', label: resources.vehicles.length === 0 ? '-- No available vehicles found --' : '-- Select active vehicle --' },
    ...resources.vehicles.map((v) => ({
      value: String(v.id),
      label: `${v.registration_number} — ${v.brand} ${v.model} (${v.vehicle_type}, ${v.seating_capacity} seats)`,
    })),
  ];

  const driverOptions = [
    { value: '', label: resources.drivers.length === 0 ? '-- No available drivers found --' : '-- Select active driver --' },
    ...resources.drivers.map((d) => ({
      value: String(d.id),
      label: `${d.name} (License: ${d.license_number})`,
    })),
  ];

  return (
    <div className="admin-card card-accent-top" style={{ marginTop: 'var(--space-6)' }}>
      <div className="admin-card-header">
        <div>
          <h2 className="admin-card-title">Assign Trip & Dispatch Driver</h2>
          <span className="admin-card-subtitle">
            Pair approved customer reservations with available vehicles and licensed drivers
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="assignments-count-badge" style={{ padding: '4px 10px', fontSize: '13px' }}>
            {approvedBookings.length} waiting
          </span>
          <Link to="/manager/assignments" className="btn btn-ghost btn-sm">
            Full Stepper Wizard →
          </Link>
        </div>
      </div>

      <div style={{ padding: 'var(--space-4)' }}>
        {loadingBookings ? (
          <div style={{ padding: '30px 0', textAlign: 'center' }}>
            <Loader text="Loading pending assignments..." />
          </div>
        ) : approvedBookings.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', background: 'var(--surface-muted)', borderRadius: '8px' }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: 'var(--color-text)' }}>
              No Bookings Currently Waiting for Assignment
            </p>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              All approved bookings have already been assigned to drivers. New bookings will appear here upon customer booking approval.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {formError && (
              <div
                style={{
                  background: 'var(--danger-bg)',
                  color: 'var(--danger-text)',
                  border: '1px solid var(--danger-border)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  fontSize: '13.5px',
                }}
              >
                {formError}
              </div>
            )}

            {/* Row 1: Booking Dropdown */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13.5px', marginBottom: '6px' }}>
                Select Approved Booking <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <Select
                value={selectedBookingId}
                onChange={(e) => setSelectedBookingId(e.target.value)}
                options={bookingOptions}
                disabled={submitting}
              />
            </div>

            {loadingResources ? (
              <div style={{ padding: '20px 0', textAlign: 'center' }}>
                <Loader text="Checking resource availability..." />
              </div>
            ) : (
              <>
                {/* Row 2: Vehicle & Driver Selectors */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '13.5px', marginBottom: '6px' }}>
                      Select Active Vehicle <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <Select
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                      options={vehicleOptions}
                      disabled={submitting || resources.vehicles.length === 0}
                    />
                    {resources.vehicles.length === 0 && selectedBookingId && (
                      <span style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px', display: 'block' }}>
                        No free vehicles match the requested type/seating in this time window.
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '13.5px', marginBottom: '6px' }}>
                      Select Active Driver <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <Select
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      options={driverOptions}
                      disabled={submitting || resources.drivers.length === 0}
                    />
                    {resources.drivers.length === 0 && selectedBookingId && (
                      <span style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px', display: 'block' }}>
                        No active drivers with valid license available in this time window.
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 3: Route & Scheduled Time */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <TextInput
                      label="Pickup Location *"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>
                  <div>
                    <TextInput
                      label="Drop Location *"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>
                  <div>
                    <DateTimeInput
                      label="Scheduled Time *"
                      value={datetime}
                      onChange={(e) => setDatetime(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>
                </div>

                {/* Submit Action */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={
                      submitting ||
                      !selectedBookingId ||
                      !selectedVehicleId ||
                      !selectedDriverId ||
                      resources.vehicles.length === 0 ||
                      resources.drivers.length === 0
                    }
                    loading={submitting}
                  >
                    Assign Driver & Dispatch Trip
                  </Button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
