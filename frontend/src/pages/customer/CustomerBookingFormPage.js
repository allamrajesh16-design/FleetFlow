import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import { ArrowLeftIcon, VehicleIcon, BikeIcon, CheckIcon } from '../../components/common/Icons';
import { PaymentRulesCard } from '../../components/customer/CustomerRulesCards';
import { getActiveVehiclesApi, createBookingApi } from '../../api/customer';
import { getApiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import './CustomerPages.css';

export default function CustomerBookingFormPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success } = useToast();

  const initialType = (searchParams.get('type') || 'CAR').toUpperCase();
  const [vehicleType, setVehicleType] = useState(
    initialType === 'BIKE' ? 'BIKE' : 'CAR'
  );

  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    pickup_location: '',
    drop_location: '',
    travel_datetime: '',
    passengers: 1,
    estimated_distance_km: '',
    vehicle_id: '',
  });

  const loadVehicles = useCallback(async () => {
    setLoadingVehicles(true);
    try {
      const data = await getActiveVehiclesApi({ vehicle_type: vehicleType });
      const list = Array.isArray(data) ? data : data.results || [];
      setVehicles(list);
    } catch (err) {
      setGeneralError(getApiErrorMessage(err));
    } finally {
      setLoadingVehicles(false);
    }
  }, [vehicleType]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  // Adjust max passenger capability based on vehicle type or specific vehicle
  const maxPassengers =
    vehicleType === 'BIKE'
      ? 1
      : formData.vehicle_id
      ? vehicles.find((v) => String(v.id) === String(formData.vehicle_id))?.seating_capacity || 6
      : 6;

  // Selected vehicle or default rate
  const selectedVehicle = vehicles.find(
    (v) => String(v.id) === String(formData.vehicle_id)
  );
  const lowestRate = vehicles.length
    ? Math.min(...vehicles.map((v) => Number(v.rate_per_km)))
    : vehicleType === 'BIKE'
    ? 8
    : 15;
  const highestRate = vehicles.length
    ? Math.max(...vehicles.map((v) => Number(v.rate_per_km)))
    : vehicleType === 'BIKE'
    ? 8
    : 15;
  const effectiveRate = selectedVehicle
    ? Number(selectedVehicle.rate_per_km)
    : lowestRate;
  const estimatedFareBasis = selectedVehicle ? 'selected_vehicle' : 'lowest_rate';

  const distanceNum = Number(formData.estimated_distance_km);
  const hasDistance = !isNaN(distanceNum) && distanceNum > 0;
  const estimatedFare = hasDistance ? (distanceNum * effectiveRate).toFixed(2) : null;
  const estimatedFareMin = hasDistance ? (distanceNum * lowestRate).toFixed(2) : null;
  const estimatedFareMax = hasDistance ? (distanceNum * highestRate).toFixed(2) : null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleTypeChange = (newType) => {
    setVehicleType(newType);
    setFormData((prev) => ({
      ...prev,
      vehicle_id: '',
      passengers: newType === 'BIKE' ? 1 : Math.min(prev.passengers, 6),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError('');

    // Client-side validations
    const errors = {};
    if (!formData.pickup_location.trim()) {
      errors.pickup_location = 'Pickup location is required.';
    }
    if (!formData.drop_location.trim()) {
      errors.drop_location = 'Drop location is required.';
    }
    if (!formData.travel_datetime) {
      errors.travel_datetime = 'Travel date and time are required.';
    } else {
      const chosen = new Date(formData.travel_datetime);
      if (chosen <= new Date()) {
        errors.travel_datetime = 'Travel date and time must be in the future.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    try {
      const payload = {
        booking_type: 'VEHICLE',
        vehicle_type: vehicleType,
        pickup_location: formData.pickup_location.trim(),
        drop_location: formData.drop_location.trim(),
        travel_datetime: new Date(formData.travel_datetime).toISOString(),
        passengers: Number(formData.passengers) || 1,
      };

      if (formData.vehicle_id) {
        payload.vehicle = Number(formData.vehicle_id);
      }
      if (distanceNum > 0) {
        payload.estimated_distance_km = distanceNum;
      }

      const res = await createBookingApi(payload);
      success('Booking request sent. Waiting for approval.');
      navigate(`/customer/bookings/${res.id}`);
    } catch (err) {
      const resp = err.response?.data;
      if (resp && typeof resp === 'object') {
        const errMap = {};
        for (const [k, v] of Object.entries(resp)) {
          errMap[k] = Array.isArray(v) ? v.join(' ') : String(v);
        }
        setFieldErrors(errMap);
        if (resp.detail) setGeneralError(resp.detail);
      } else {
        setGeneralError(getApiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Min datetime for date picker (current time formatted)
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDateTimeStr = now.toISOString().slice(0, 16);

  return (
    <div className="customer-page-container fade-in">
      {/* Header: Back link on left, title and sentence left-aligned below it */}
      <div className="customer-page-header">
        <div className="customer-header-main">
          <Button
            type="button"
            variant="ghost"
            size="small"
            className="customer-back-link"
            onClick={() => navigate('/customer/book')}
            aria-label="Back to vehicle selection"
            leftIcon={<ArrowLeftIcon size={16} />}
          >
            Back
          </Button>
          <h1 className="customer-page-title">Book a Vehicle</h1>
          <p className="customer-page-subtitle">
            Configure your pickup, destination, and travel schedule
          </p>
        </div>
      </div>

      <div className="booking-form-grid">
        {/* Main Form Card */}
        <Card className="customer-form-card">
          {generalError && (
            <div className="customer-alert-card danger" style={{ marginBottom: 16 }}>
              <span>{generalError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="booking-form">
            {/* Type selector toggle */}
            <div className="form-group-type-toggle">
              <label className="ff-form-label" style={{ marginBottom: '8px' }}>Vehicle Type</label>
              <div className="type-toggle-buttons" role="radiogroup" aria-label="Vehicle Type">
                <Button
                  type="button"
                  variant="outline"
                  className={`type-toggle-btn ${vehicleType === 'CAR' ? 'active' : ''}`}
                  onClick={() => handleTypeChange('CAR')}
                  aria-pressed={vehicleType === 'CAR'}
                  leftIcon={<VehicleIcon size={18} />}
                  rightIcon={vehicleType === 'CAR' ? <CheckIcon size={16} className="type-check-icon" /> : null}
                >
                  Car
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`type-toggle-btn ${vehicleType === 'BIKE' ? 'active' : ''}`}
                  onClick={() => handleTypeChange('BIKE')}
                  aria-pressed={vehicleType === 'BIKE'}
                  leftIcon={<BikeIcon size={18} />}
                  rightIcon={vehicleType === 'BIKE' ? <CheckIcon size={16} className="type-check-icon" /> : null}
                >
                  Bike
                </Button>
              </div>
            </div>

            {/* Pickup & Drop inputs */}
            <div className="form-grid-two">
              <div>
                <Input
                  id="pickup-input"
                  name="pickup_location"
                  label="Pickup Location"
                  placeholder="e.g. Kakinada Main Road"
                  value={formData.pickup_location}
                  onChange={handleChange}
                  error={fieldErrors.pickup_location}
                  required
                />
              </div>

              <div>
                <Input
                  id="drop-input"
                  name="drop_location"
                  label="Drop Location"
                  placeholder="e.g. Rajahmundry Airport"
                  value={formData.drop_location}
                  onChange={handleChange}
                  error={fieldErrors.drop_location}
                  required
                />
              </div>
            </div>

            {/* Date Time & Passengers */}
            <div className="form-grid-two">
              <div>
                <Input
                  id="travel-datetime-input"
                  name="travel_datetime"
                  type="datetime-local"
                  label="Date & Time"
                  min={minDateTimeStr}
                  value={formData.travel_datetime}
                  onChange={handleChange}
                  error={fieldErrors.travel_datetime}
                  required
                />
              </div>

              <div>
                <Input
                  id="passengers-input"
                  name="passengers"
                  type="number"
                  label={`Passengers (Max ${maxPassengers})`}
                  min={1}
                  max={maxPassengers}
                  value={formData.passengers}
                  onChange={handleChange}
                  error={fieldErrors.passengers}
                  disabled={vehicleType === 'BIKE'}
                  required
                />
              </div>
            </div>

            {/* Distance & Optional Specific Vehicle */}
            <div className="form-grid-two">
              <div>
                <Input
                  id="distance-input"
                  name="estimated_distance_km"
                  type="number"
                  label="Approx. Distance in km (Optional)"
                  placeholder="e.g. 65"
                  min={1}
                  step="1"
                  value={formData.estimated_distance_km}
                  onChange={handleChange}
                  error={fieldErrors.estimated_distance_km}
                />
              </div>

              <div>
                <Select
                  id="vehicle-choice-select"
                  name="vehicle_id"
                  label="Preferred Vehicle (Optional)"
                  value={formData.vehicle_id}
                  onChange={handleChange}
                  options={[
                    { value: '', label: `Any Active ${vehicleType} (Fleet Recommended)` },
                    ...vehicles.map((v) => ({
                      value: String(v.id),
                      label: `${v.brand} ${v.model} (${v.registration_number}) - Rs. ${v.rate_per_km}/km`,
                    })),
                  ]}
                  disabled={loadingVehicles}
                />
              </div>
            </div>

            {/* Live Estimated Fare Box */}
            {hasDistance ? (
              <div className="customer-estimated-fare-box fade-in">
                <div className="estimated-fare-top">
                  <span className="est-label">
                    {estimatedFareBasis === 'lowest_rate'
                      ? `Estimated Rs. ${estimatedFareMin} to Rs. ${estimatedFareMax}, depending on the vehicle. The final fare is calculated after the trip.`
                      : `Estimated Fare: Rs. ${estimatedFare}`}
                  </span>
                </div>
                {estimatedFareBasis === 'lowest_rate' ? (
                  <div className="est-formula">
                    {distanceNum} km × rates Rs. {lowestRate}/km – Rs. {highestRate}/km across active {vehicleType.toLowerCase()}s
                  </div>
                ) : (
                  <div className="est-formula">
                    {distanceNum} km × Rs. {effectiveRate}/km
                  </div>
                )}
                <p className="est-note">
                  * Note: Final fare is calculated after the trip from the actual vehicle odometer reading.
                </p>
              </div>
            ) : (
              <div className="customer-estimated-fare-box fade-in" style={{ opacity: 0.85 }}>
                <p className="est-note" style={{ margin: 0, fontStyle: 'italic' }}>
                  Enter the distance to see an estimate
                </p>
              </div>
            )}

            <div className="form-actions-row">
              <Button
                type="submit"
                variant="primary"
                size="large"
                loading={submitting}
                disabled={submitting}
                className="booking-submit-btn"
              >
                Send Booking Request
              </Button>
            </div>
          </form>
        </Card>

        {/* Sidebar Info & Payment Rules */}
        <div className="booking-form-sidebar">
          <PaymentRulesCard />
        </div>
      </div>
    </div>
  );
}
