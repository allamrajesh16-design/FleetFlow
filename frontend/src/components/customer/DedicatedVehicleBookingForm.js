import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../common/Card';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import Modal from '../common/Modal';
import {
  ArrowLeftIcon,
  VehicleIcon,
  BikeIcon,
  LockIcon,
  AlertCircleIcon,
  InfoIcon,
} from '../common/Icons';
import { PaymentRulesCard } from './CustomerRulesCards';
import { getActiveVehiclesApi, createBookingApi } from '../../api/customer';
import { getApiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/formatters';
import '../../pages/customer/CustomerPages.css';

export default function DedicatedVehicleBookingForm({
  vehicleType = 'CAR', // 'BIKE' | 'CAR'
  title = 'Book a Vehicle',
  subtitle = 'Provide your journey and address details to create a booking',
}) {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const isBike = vehicleType === 'BIKE';
  const isCar = vehicleType === 'CAR';

  // Vehicles state
  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Summary Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [swapFeedback, setSwapFeedback] = useState(false);

  // Form State
  const [pickup, setPickup] = useState({
    house_street: '',
    area: '',
    city: '',
    pincode: '',
    landmark: '',
    instructions: '',
  });

  const [drop, setDrop] = useState({
    house_street: '',
    area: '',
    city: '',
    pincode: '',
    landmark: '',
    instructions: '',
  });

  // Calculate default journey datetime: tomorrow at 09:00 AM
  const getTomorrowDateTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const [journeyDetails, setJourneyDetails] = useState({
    travel_datetime: getTomorrowDateTime(),
    passengers: 1,
    trip_type: 'ONE_WAY', // 'ONE_WAY' | 'ROUND_TRIP'
    return_datetime: '',
    luggage_type: 'NONE', // 'NONE' | 'LIGHT' | 'MEDIUM' | 'HEAVY'
    special_instructions: '',
    estimated_distance_km: '',
  });

  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [subTypeFilter, setSubTypeFilter] = useState('ALL');

  // Load available active fleet vehicles for this type
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

  // Max passengers calculation:
  // For Bike: strictly 2
  // For Car: max active car capacity in fleet (e.g. 7), or selected car's capacity
  const maxFleetCarCapacity = useMemo(() => {
    if (isBike) return 2;
    if (vehicles.length === 0) return 6;
    return Math.max(...vehicles.map((v) => Number(v.seating_capacity || 4)));
  }, [vehicles, isBike]);

  const maxPassengers = isBike
    ? 2
    : selectedVehicleId
    ? vehicles.find((v) => String(v.id) === String(selectedVehicleId))?.seating_capacity || maxFleetCarCapacity
    : maxFleetCarCapacity;

  // Filter vehicles that can accommodate the chosen passenger count
  const compatibleVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const capacityOk = Number(v.seating_capacity) >= Number(journeyDetails.passengers);
      if (!capacityOk) return false;
      if (subTypeFilter === 'ALL') return true;
      const combined = `${v.brand} ${v.model}`.toLowerCase();
      if (subTypeFilter === 'SEDAN') return combined.includes('sedan') || combined.includes('dzire') || combined.includes('city');
      if (subTypeFilter === 'SUV') return combined.includes('innova') || combined.includes('creta') || combined.includes('suv');
      if (subTypeFilter === 'CRUISER') return combined.includes('enfield') || combined.includes('classic');
      if (subTypeFilter === 'COMMUTER') return combined.includes('activa') || combined.includes('splendor') || combined.includes('honda');
      return true;
    });
  }, [vehicles, journeyDetails.passengers, subTypeFilter]);

  // Selected vehicle object
  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicles.find((v) => String(v.id) === String(selectedVehicleId)) || null;
  }, [vehicles, selectedVehicleId]);

  // Pricing rates
  const lowestRate = vehicles.length
    ? Math.min(...vehicles.map((v) => Number(v.rate_per_km || (isBike ? 5 : 12))))
    : isBike ? 5 : 12;

  const highestRate = vehicles.length
    ? Math.max(...vehicles.map((v) => Number(v.rate_per_km || (isBike ? 8 : 18))))
    : isBike ? 8 : 18;

  const effectiveRate = selectedVehicle ? Number(selectedVehicle.rate_per_km) : lowestRate;

  const distanceNum = Number(journeyDetails.estimated_distance_km);
  const hasDistance = !isNaN(distanceNum) && distanceNum > 0;
  const estimatedFare = hasDistance ? (distanceNum * effectiveRate).toFixed(2) : null;
  const estimatedFareMin = hasDistance ? (distanceNum * lowestRate).toFixed(2) : null;
  const estimatedFareMax = hasDistance ? (distanceNum * highestRate).toFixed(2) : null;

  // Swap pickup & drop handler
  const handleSwapLocations = () => {
    setPickup({ ...drop });
    setDrop({ ...pickup });
    setSwapFeedback(true);
    setTimeout(() => setSwapFeedback(false), 2200);
  };

  // Build full readable addresses
  const buildFullAddress = (loc) => {
    const parts = [];
    if (loc.house_street?.trim()) parts.push(loc.house_street.trim());
    if (loc.area?.trim()) parts.push(loc.area.trim());
    if (loc.city?.trim()) parts.push(loc.city.trim());
    let full = parts.join(', ');
    if (loc.pincode?.trim()) full += ` - ${loc.pincode.trim()}`;
    if (loc.landmark?.trim()) full += ` (Near ${loc.landmark.trim()})`;
    return full;
  };

  const fullPickupAddress = buildFullAddress(pickup);
  const fullDropAddress = buildFullAddress(drop);

  // Validate form before opening review modal
  const validateForm = () => {
    const errors = {};

    // Section A – Pickup validation
    if (!pickup.house_street.trim()) errors.pickup_house_street = 'House / Street Name is required.';
    if (!pickup.area.trim()) errors.pickup_area = 'Area / Locality is required.';
    if (!pickup.city.trim()) errors.pickup_city = 'City is required.';
    if (!pickup.pincode.trim()) {
      errors.pickup_pincode = 'PIN Code is required.';
    } else if (!/^\d{4,8}$/.test(pickup.pincode.trim())) {
      errors.pickup_pincode = 'Enter a valid PIN Code (e.g. 533103).';
    }

    // Section B – Destination validation
    if (!drop.house_street.trim()) errors.drop_house_street = 'House / Street Name is required.';
    if (!drop.area.trim()) errors.drop_area = 'Area / Locality is required.';
    if (!drop.city.trim()) errors.drop_city = 'City is required.';
    if (!drop.pincode.trim()) {
      errors.drop_pincode = 'PIN Code is required.';
    } else if (!/^\d{4,8}$/.test(drop.pincode.trim())) {
      errors.drop_pincode = 'Enter a valid PIN Code (e.g. 533001).';
    }

    // Section C – Journey validation
    if (!journeyDetails.travel_datetime) {
      errors.travel_datetime = 'Journey Date & Pickup Time are required.';
    } else {
      const chosen = new Date(journeyDetails.travel_datetime);
      if (chosen <= new Date()) {
        errors.travel_datetime = 'Journey date and pickup time must be in the future.';
      }
    }

    const passCount = Number(journeyDetails.passengers);
    if (isBike && (passCount < 1 || passCount > 2)) {
      errors.passengers = 'Bike bookings permit maximum 2 passengers.';
    } else if (isCar && (passCount < 1 || passCount > maxPassengers)) {
      errors.passengers = `Passenger count cannot exceed ${maxPassengers} for this selection.`;
    }

    if (journeyDetails.trip_type === 'ROUND_TRIP') {
      if (!journeyDetails.return_datetime) {
        errors.return_datetime = 'Return date and time are required for Round Trip.';
      } else {
        const retTime = new Date(journeyDetails.return_datetime);
        const depTime = new Date(journeyDetails.travel_datetime);
        if (retTime <= depTime) {
          errors.return_datetime = 'Return date & time must be after the departure pickup time.';
        }
      }
    }

    // Section D – Vehicle selection validation
    if (selectedVehicle) {
      if (selectedVehicle.seating_capacity < passCount) {
        errors.vehicle_id = `Selected vehicle capacity (${selectedVehicle.seating_capacity}) cannot accommodate ${passCount} passengers.`;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenReview = (e) => {
    e.preventDefault();
    setGeneralError('');
    if (validateForm()) {
      setShowReviewModal(true);
    } else {
      toastError('Please complete all required fields correctly before submitting.');
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }
  };

  // Final submit to backend API
  const handleFinalSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setGeneralError('');

    try {
      const payload = {
        booking_type: 'VEHICLE',
        vehicle_type: vehicleType,
        pickup_location: fullPickupAddress,
        drop_location: fullDropAddress,
        travel_datetime: new Date(journeyDetails.travel_datetime).toISOString(),
        passengers: Number(journeyDetails.passengers) || 1,
        trip_type: journeyDetails.trip_type,
        special_instructions: journeyDetails.special_instructions || '',
        pickup_details: {
          ...pickup,
          address: fullPickupAddress,
        },
        drop_details: {
          ...drop,
          address: fullDropAddress,
        },
      };

      if (journeyDetails.trip_type === 'ROUND_TRIP' && journeyDetails.return_datetime) {
        payload.return_datetime = new Date(journeyDetails.return_datetime).toISOString();
      }

      if (isCar) {
        payload.luggage_type = journeyDetails.luggage_type;
      }

      if (selectedVehicleId) {
        payload.vehicle = Number(selectedVehicleId);
      }

      if (distanceNum > 0) {
        payload.estimated_distance_km = distanceNum;
      }

      const res = await createBookingApi(payload);
      success('Booking request submitted successfully! Waiting for fleet approval.');
      setShowReviewModal(false);
      navigate(`/customer/bookings/${res.id}`);
    } catch (err) {
      console.error('Booking submission error:', err);
      const resp = err.response?.data;
      if (resp && typeof resp === 'object') {
        const errMap = {};
        for (const [k, v] of Object.entries(resp)) {
          errMap[k] = Array.isArray(v) ? v.join(' ') : String(v);
        }
        setFieldErrors(errMap);
        if (resp.detail) setGeneralError(resp.detail);
        else if (resp.vehicle) setGeneralError(resp.vehicle);
      } else {
        setGeneralError(getApiErrorMessage(err));
      }
      setShowReviewModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Min datetime for HTML datetime-local
  const minDateTimeStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="customer-page-container fade-in">
      {/* Page Header */}
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
            Back to Vehicle Selection
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`booking-type-icon-badge ${isBike ? 'bike' : 'car'}`}>
              {isBike ? <BikeIcon size={24} /> : <VehicleIcon size={24} />}
            </span>
            <h1 className="customer-page-title">{title}</h1>
          </div>
          <p className="customer-page-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="booking-form-grid">
        {/* Main Form Card */}
        <Card className="customer-form-card">
          {generalError && (
            <div className="customer-alert-card danger fade-in" style={{ marginBottom: 20 }}>
              <AlertCircleIcon size={20} />
              <span>{generalError}</span>
            </div>
          )}

          <form onSubmit={handleOpenReview} className="booking-form" noValidate>
            {/* =================================================== */}
            {/* SECTION A – PICKUP INFORMATION */}
            {/* =================================================== */}
            <div className="form-section-card">
              <div className="form-section-header">
                <span className="section-step-badge">1</span>
                <div>
                  <h3 className="form-section-title">Section A – Pickup Information</h3>
                  <p className="form-section-desc">Enter the complete origin address where the vehicle should arrive</p>
                </div>
              </div>

              <div className="form-grid-two">
                <div>
                  <Input
                    id="pickup_house_street"
                    label="House / Building / Street Name"
                    placeholder="e.g. Flat 402, Royal Residency, Main Road"
                    value={pickup.house_street}
                    onChange={(e) => setPickup({ ...pickup, house_street: e.target.value })}
                    error={fieldErrors.pickup_house_street}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="pickup_area"
                    label="Area / Locality"
                    placeholder="e.g. Danavaipeta / Somajiguda"
                    value={pickup.area}
                    onChange={(e) => setPickup({ ...pickup, area: e.target.value })}
                    error={fieldErrors.pickup_area}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-three">
                <div>
                  <Input
                    id="pickup_city"
                    label="City"
                    placeholder="e.g. Rajahmundry"
                    value={pickup.city}
                    onChange={(e) => setPickup({ ...pickup, city: e.target.value })}
                    error={fieldErrors.pickup_city}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="pickup_pincode"
                    label="PIN Code"
                    placeholder="e.g. 533103"
                    value={pickup.pincode}
                    maxLength={8}
                    onChange={(e) => setPickup({ ...pickup, pincode: e.target.value })}
                    error={fieldErrors.pickup_pincode}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="pickup_landmark"
                    label="Nearby Landmark"
                    placeholder="e.g. Opposite SBI Bank"
                    value={pickup.landmark}
                    onChange={(e) => setPickup({ ...pickup, landmark: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <Input
                  id="pickup_instructions"
                  label="Pickup Instructions (Optional)"
                  placeholder="e.g. Call when outside the gate; gate passcode is #123"
                  value={pickup.instructions}
                  onChange={(e) => setPickup({ ...pickup, instructions: e.target.value })}
                />
              </div>

              {fullPickupAddress && (
                <div className="address-preview-tag fade-in">
                  <span className="preview-label">Pickup Address Preview:</span>
                  <span className="preview-text">{fullPickupAddress}</span>
                </div>
              )}
            </div>

            {/* =================================================== */}
            {/* SWAP PICKUP AND DROP BUTTON */}
            {/* =================================================== */}
            <div className="swap-locations-container">
              <Button
                type="button"
                variant="outline"
                size="small"
                className="swap-locations-btn"
                onClick={handleSwapLocations}
                title="Swap Pickup and Drop addresses"
              >
                <span style={{ fontSize: '1.1rem', marginRight: '6px' }}>⇄</span>
                Swap Pickup & Drop Locations
              </Button>
              {swapFeedback && (
                <span className="swap-feedback-pill fade-in">✓ Addresses Swapped</span>
              )}
            </div>

            {/* =================================================== */}
            {/* SECTION B – DESTINATION INFORMATION */}
            {/* =================================================== */}
            <div className="form-section-card">
              <div className="form-section-header">
                <span className="section-step-badge">2</span>
                <div>
                  <h3 className="form-section-title">Section B – Destination Information</h3>
                  <p className="form-section-desc">Enter the complete destination address where you want to be dropped</p>
                </div>
              </div>

              <div className="form-grid-two">
                <div>
                  <Input
                    id="drop_house_street"
                    label="House / Building / Street Name"
                    placeholder="e.g. Terminal 1 / Cyber Towers"
                    value={drop.house_street}
                    onChange={(e) => setDrop({ ...drop, house_street: e.target.value })}
                    error={fieldErrors.drop_house_street}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="drop_area"
                    label="Area / Locality"
                    placeholder="e.g. Madhurapudi / Hitech City"
                    value={drop.area}
                    onChange={(e) => setDrop({ ...drop, area: e.target.value })}
                    error={fieldErrors.drop_area}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-three">
                <div>
                  <Input
                    id="drop_city"
                    label="City"
                    placeholder="e.g. Rajahmundry"
                    value={drop.city}
                    onChange={(e) => setDrop({ ...drop, city: e.target.value })}
                    error={fieldErrors.drop_city}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="drop_pincode"
                    label="PIN Code"
                    placeholder="e.g. 533102"
                    value={drop.pincode}
                    maxLength={8}
                    onChange={(e) => setDrop({ ...drop, pincode: e.target.value })}
                    error={fieldErrors.drop_pincode}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="drop_landmark"
                    label="Nearby Landmark"
                    placeholder="e.g. Near Departure Gate 2"
                    value={drop.landmark}
                    onChange={(e) => setDrop({ ...drop, landmark: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <Input
                  id="drop_instructions"
                  label="Drop Instructions (Optional)"
                  placeholder="e.g. Drop at luggage drop point or main porch"
                  value={drop.instructions}
                  onChange={(e) => setDrop({ ...drop, instructions: e.target.value })}
                />
              </div>

              {fullDropAddress && (
                <div className="address-preview-tag fade-in">
                  <span className="preview-label">Drop Address Preview:</span>
                  <span className="preview-text">{fullDropAddress}</span>
                </div>
              )}
            </div>

            {/* =================================================== */}
            {/* SECTION C – JOURNEY DETAILS */}
            {/* =================================================== */}
            <div className="form-section-card">
              <div className="form-section-header">
                <span className="section-step-badge">3</span>
                <div>
                  <h3 className="form-section-title">Section C – Journey Details</h3>
                  <p className="form-section-desc">Specify journey date, timing, passengers, and trip schedule</p>
                </div>
              </div>

              {/* Trip Type: One-way vs Round Trip */}
              <div className="form-group-item">
                <label className="ff-form-label">Trip Type</label>
                <div className="trip-type-toggle-group">
                  <Button
                    type="button"
                    variant={journeyDetails.trip_type === 'ONE_WAY' ? 'primary' : 'outline'}
                    className={`trip-type-btn ${journeyDetails.trip_type === 'ONE_WAY' ? 'active' : ''}`}
                    onClick={() => setJourneyDetails({ ...journeyDetails, trip_type: 'ONE_WAY', return_datetime: '' })}
                  >
                    → One-way Trip
                  </Button>
                  <Button
                    type="button"
                    variant={journeyDetails.trip_type === 'ROUND_TRIP' ? 'primary' : 'outline'}
                    className={`trip-type-btn ${journeyDetails.trip_type === 'ROUND_TRIP' ? 'active' : ''}`}
                    onClick={() => {
                      const ret = new Date(new Date(journeyDetails.travel_datetime).getTime() + 4 * 3600000);
                      ret.setMinutes(ret.getMinutes() - ret.getTimezoneOffset());
                      setJourneyDetails({
                        ...journeyDetails,
                        trip_type: 'ROUND_TRIP',
                        return_datetime: ret.toISOString().slice(0, 16),
                      });
                    }}
                  >
                    ⇄ Round Trip
                  </Button>
                </div>
              </div>

              <div className="form-grid-two">
                {/* Journey Date & Pickup Time */}
                <div>
                  <Input
                    id="travel_datetime"
                    type="datetime-local"
                    label="Journey Date & Pickup Time"
                    min={minDateTimeStr}
                    value={journeyDetails.travel_datetime}
                    onChange={(e) => setJourneyDetails({ ...journeyDetails, travel_datetime: e.target.value })}
                    error={fieldErrors.travel_datetime}
                    required
                  />
                </div>

                {/* Return Date & Time (Only for Round Trip) */}
                {journeyDetails.trip_type === 'ROUND_TRIP' ? (
                  <div>
                    <Input
                      id="return_datetime"
                      type="datetime-local"
                      label="Return Date & Time (Round Trip)"
                      min={journeyDetails.travel_datetime || minDateTimeStr}
                      value={journeyDetails.return_datetime}
                      onChange={(e) => setJourneyDetails({ ...journeyDetails, return_datetime: e.target.value })}
                      error={fieldErrors.return_datetime}
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <Input
                      id="passengers"
                      type="number"
                      label={`Number of Passengers (Max ${maxPassengers})`}
                      min={1}
                      max={maxPassengers}
                      value={journeyDetails.passengers}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 1;
                        const clamped = Math.max(1, Math.min(val, maxPassengers));
                        setJourneyDetails({ ...journeyDetails, passengers: clamped });
                      }}
                      error={fieldErrors.passengers}
                      hint={isBike ? 'Bike bookings allow maximum 2 passengers' : `Up to ${maxPassengers} passengers based on vehicle capacity`}
                      required
                    />
                  </div>
                )}
              </div>

              {/* If Round trip, show passenger count in second row */}
              {journeyDetails.trip_type === 'ROUND_TRIP' && (
                <div className="form-grid-two" style={{ marginTop: '12px' }}>
                  <div>
                    <Input
                      id="passengers_round"
                      type="number"
                      label={`Number of Passengers (Max ${maxPassengers})`}
                      min={1}
                      max={maxPassengers}
                      value={journeyDetails.passengers}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 1;
                        const clamped = Math.max(1, Math.min(val, maxPassengers));
                        setJourneyDetails({ ...journeyDetails, passengers: clamped });
                      }}
                      error={fieldErrors.passengers}
                      hint={isBike ? 'Bike bookings allow maximum 2 passengers' : `Up to ${maxPassengers} passengers`}
                      required
                    />
                  </div>
                  <div>
                    <Input
                      id="distance_km"
                      type="number"
                      label="Approx. Distance in km (Optional)"
                      placeholder="e.g. 45"
                      min={1}
                      value={journeyDetails.estimated_distance_km}
                      onChange={(e) => setJourneyDetails({ ...journeyDetails, estimated_distance_km: e.target.value })}
                      hint="Enables live fare estimate calculation"
                    />
                  </div>
                </div>
              )}

              {/* Distance input for One-way */}
              {journeyDetails.trip_type === 'ONE_WAY' && (
                <div style={{ marginTop: '12px' }}>
                  <Input
                    id="distance_km_oneway"
                    type="number"
                    label="Approx. Distance in km (Optional)"
                    placeholder="e.g. 45"
                    min={1}
                    value={journeyDetails.estimated_distance_km}
                    onChange={(e) => setJourneyDetails({ ...journeyDetails, estimated_distance_km: e.target.value })}
                    hint="Enter distance to see an instant estimated fare range"
                  />
                </div>
              )}

              {/* Luggage Type (Car Only) */}
              {isCar && (
                <div className="form-group-item" style={{ marginTop: '16px' }}>
                  <label className="ff-form-label">Luggage Type</label>
                  <div className="luggage-options-grid">
                    {[
                      { id: 'NONE', label: 'No Luggage', desc: 'Handbags only' },
                      { id: 'LIGHT', label: 'Light', desc: '1–2 small backpacks' },
                      { id: 'MEDIUM', label: 'Medium', desc: '2–3 medium suitcases' },
                      { id: 'HEAVY', label: 'Heavy', desc: '4+ large luggage bags' },
                    ].map((lug) => (
                      <div
                        key={lug.id}
                        role="button"
                        tabIndex={0}
                        className={`luggage-card ${journeyDetails.luggage_type === lug.id ? 'active' : ''}`}
                        onClick={() => setJourneyDetails({ ...journeyDetails, luggage_type: lug.id })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setJourneyDetails({ ...journeyDetails, luggage_type: lug.id });
                          }
                        }}
                      >
                        <span className="luggage-card-title">{lug.label}</span>
                        <span className="luggage-card-desc">{lug.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Special Instructions */}
              <div style={{ marginTop: '16px' }}>
                <Input
                  id="special_instructions"
                  label="Special Instructions (Optional)"
                  placeholder="e.g. Senior citizen travelling; please send AC sedan; baby onboard"
                  value={journeyDetails.special_instructions}
                  onChange={(e) => setJourneyDetails({ ...journeyDetails, special_instructions: e.target.value })}
                />
              </div>

              {/* Live Fare Estimation Box */}
              {hasDistance ? (
                <div className="customer-estimated-fare-box fade-in" style={{ marginTop: '18px' }}>
                  <div className="estimated-fare-top">
                    <span className="est-label">
                      {selectedVehicle
                        ? `Estimated Fare: ₹${estimatedFare}`
                        : `Estimated Fare Range: ₹${estimatedFareMin} – ₹${estimatedFareMax}`}
                    </span>
                  </div>
                  <div className="est-formula">
                    {selectedVehicle
                      ? `${distanceNum} km × ₹${effectiveRate}/km (${selectedVehicle.brand} ${selectedVehicle.model})`
                      : `${distanceNum} km × rates ₹${lowestRate}–₹${highestRate}/km across active ${isBike ? 'bikes' : 'cars'}`}
                  </div>
                  <p className="est-note">
                    * Note: Final fare is computed upon trip completion based on verified vehicle odometer reading.
                  </p>
                </div>
              ) : (
                <div className="customer-estimated-fare-box empty-state fade-in" style={{ marginTop: '18px' }}>
                  <p className="est-note" style={{ margin: 0 }}>
                    💡 Tip: Enter the approximate distance above to view instant real-time fare estimates.
                  </p>
                </div>
              )}
            </div>

            {/* =================================================== */}
            {/* SECTION D – VEHICLE PREFERENCE */}
            {/* =================================================== */}
            <div className="form-section-card">
              <div className="form-section-header">
                <span className="section-step-badge">4</span>
                <div>
                  <h3 className="form-section-title">Section D – Vehicle Preference</h3>
                  <p className="form-section-desc">Select a specific available fleet vehicle or let FleetFlow assign the best match</p>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="vehicle-filter-pills" style={{ marginBottom: '14px' }}>
                <span className="filter-pill-label">Category:</span>
                <Button
                  type="button"
                  variant={subTypeFilter === 'ALL' ? 'primary' : 'outline'}
                  size="small"
                  className={`pill-btn ${subTypeFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setSubTypeFilter('ALL')}
                >
                  All {isBike ? 'Bikes' : 'Cars'}
                </Button>
                {isBike ? (
                  <>
                    <Button
                      type="button"
                      variant={subTypeFilter === 'CRUISER' ? 'primary' : 'outline'}
                      size="small"
                      className={`pill-btn ${subTypeFilter === 'CRUISER' ? 'active' : ''}`}
                      onClick={() => setSubTypeFilter('CRUISER')}
                    >
                      Cruiser (Enfield)
                    </Button>
                    <Button
                      type="button"
                      variant={subTypeFilter === 'COMMUTER' ? 'primary' : 'outline'}
                      size="small"
                      className={`pill-btn ${subTypeFilter === 'COMMUTER' ? 'active' : ''}`}
                      onClick={() => setSubTypeFilter('COMMUTER')}
                    >
                      Scooter / Commuter
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant={subTypeFilter === 'SEDAN' ? 'primary' : 'outline'}
                      size="small"
                      className={`pill-btn ${subTypeFilter === 'SEDAN' ? 'active' : ''}`}
                      onClick={() => setSubTypeFilter('SEDAN')}
                    >
                      Sedans (Dzire / City)
                    </Button>
                    <Button
                      type="button"
                      variant={subTypeFilter === 'SUV' ? 'primary' : 'outline'}
                      size="small"
                      className={`pill-btn ${subTypeFilter === 'SUV' ? 'active' : ''}`}
                      onClick={() => setSubTypeFilter('SUV')}
                    >
                      SUVs (Innova / Creta)
                    </Button>
                  </>
                )}
              </div>

              {/* Preferred Vehicle Dropdown */}
              <div>
                <Select
                  id="preferred_vehicle"
                  label={`Preferred ${isBike ? 'Bike' : 'Car'} (Optional)`}
                  value={selectedVehicleId}
                  onChange={(e) => {
                    const vId = e.target.value;
                    setSelectedVehicleId(vId);
                    if (fieldErrors.vehicle_id) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.vehicle_id;
                        return next;
                      });
                    }
                  }}
                  error={fieldErrors.vehicle_id}
                  options={[
                    {
                      value: '',
                      label: `Any Active Fleet ${isBike ? 'Bike' : 'Car'} (Fleet Manager Recommended)`,
                    },
                    ...compatibleVehicles.map((v) => ({
                      value: String(v.id),
                      label: `${v.brand} ${v.model} (${v.registration_number}) — ${v.seating_capacity} Seats — ₹${v.rate_per_km}/km`,
                    })),
                  ]}
                  disabled={loadingVehicles}
                />
              </div>

              {/* Specific Vehicle Selected Highlight Banner */}
              {selectedVehicle ? (
                <div className="selected-vehicle-banner active-specific fade-in">
                  <div className="banner-icon">
                    <LockIcon size={22} />
                  </div>
                  <div className="banner-text">
                    <strong>Customer Selected Specific Vehicle: {selectedVehicle.brand} {selectedVehicle.model}</strong>
                    <div className="banner-meta">
                      <span>Registration: <strong>{selectedVehicle.registration_number}</strong></span>
                      <span>•</span>
                      <span>Seating: <strong>{selectedVehicle.seating_capacity} Passengers</strong></span>
                      <span>•</span>
                      <span>Rate: <strong>₹{selectedVehicle.rate_per_km}/km</strong></span>
                    </div>
                    <p className="banner-note">
                      🔒 Per FleetFlow Business Rules, this specific vehicle will be locked and assigned exclusively for your journey.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="selected-vehicle-banner fleet-assigned fade-in">
                  <div className="banner-icon">
                    <InfoIcon size={22} />
                  </div>
                  <div className="banner-text">
                    <strong>Fleet Recommended Allocation</strong>
                    <p className="banner-note">
                      Fleet Manager will assign an active, certified {vehicleType.toLowerCase()} matching your passenger capacity before departure.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Form Action Row */}
            <div className="form-actions-row">
              <Button
                type="submit"
                variant="primary"
                size="large"
                className="booking-submit-btn"
              >
                Review Booking Details ➔
              </Button>
            </div>
          </form>
        </Card>

        {/* Sidebar Info & Payment Rules */}
        <div className="booking-form-sidebar">
          <PaymentRulesCard />
        </div>
      </div>

      {/* =================================================== */}
      {/* SECTION E – BOOKING SUMMARY REVIEW MODAL (Section 5) */}
      {/* =================================================== */}
      {showReviewModal && (
        <Modal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          title="Review Your Journey Booking"
          size="medium"
          footer={
            <div className="modal-footer-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowReviewModal(false)}
                disabled={submitting}
              >
                Edit Details
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleFinalSubmit}
                loading={submitting}
                disabled={submitting}
              >
                Confirm Booking
              </Button>
            </div>
          }
        >
          <div className="booking-summary-modal-content">
            <div className="summary-banner-header">
              <span className={`summary-type-chip ${isBike ? 'bike' : 'car'}`}>
                {isBike ? <BikeIcon size={18} /> : <VehicleIcon size={18} />}
                {isBike ? 'Bike Booking' : 'Car Booking'}
              </span>
              <span className="summary-trip-chip">
                {journeyDetails.trip_type === 'ROUND_TRIP' ? '⇄ Round Trip' : '→ One-way'}
              </span>
            </div>

            {/* Vehicle Selection Detail */}
            <div className="summary-info-card">
              <span className="summary-card-label">Vehicle Preference</span>
              {selectedVehicle ? (
                <div className="summary-card-value-highlight">
                  <strong>{selectedVehicle.brand} {selectedVehicle.model}</strong> ({selectedVehicle.registration_number})
                  <span className="locked-pill">🔒 Customer Selected (Locked)</span>
                </div>
              ) : (
                <div className="summary-card-value">
                  Any Active Fleet {vehicleType} (Fleet Recommended)
                </div>
              )}
            </div>

            {/* Pickup & Destination Full Addresses */}
            <div className="summary-address-group">
              <div className="summary-address-item">
                <span className="summary-address-marker pickup">A</span>
                <div className="summary-address-text">
                  <span className="summary-address-label">PICKUP LOCATION</span>
                  <div className="summary-address-val">{fullPickupAddress}</div>
                  {pickup.instructions && (
                    <div className="summary-note">Note: {pickup.instructions}</div>
                  )}
                </div>
              </div>

              <div className="summary-address-item">
                <span className="summary-address-marker drop">B</span>
                <div className="summary-address-text">
                  <span className="summary-address-label">DROP LOCATION</span>
                  <div className="summary-address-val">{fullDropAddress}</div>
                  {drop.instructions && (
                    <div className="summary-note">Note: {drop.instructions}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Journey Grid */}
            <div className="summary-grid-two">
              <div className="summary-detail-box">
                <span className="summary-box-label">Journey Date & Time</span>
                <span className="summary-box-val">
                  {formatDateTime(journeyDetails.travel_datetime)}
                </span>
              </div>
              <div className="summary-detail-box">
                <span className="summary-box-label">Passengers</span>
                <span className="summary-box-val">
                  {journeyDetails.passengers} {Number(journeyDetails.passengers) === 1 ? 'Passenger' : 'Passengers'}
                </span>
              </div>
              {journeyDetails.trip_type === 'ROUND_TRIP' && journeyDetails.return_datetime && (
                <div className="summary-detail-box">
                  <span className="summary-box-label">Return Date & Time</span>
                  <span className="summary-box-val">
                    {formatDateTime(journeyDetails.return_datetime)}
                  </span>
                </div>
              )}
              {isCar && (
                <div className="summary-detail-box">
                  <span className="summary-box-label">Luggage Type</span>
                  <span className="summary-box-val">
                    {journeyDetails.luggage_type}
                  </span>
                </div>
              )}
              {distanceNum > 0 && (
                <div className="summary-detail-box">
                  <span className="summary-box-label">Estimated Fare</span>
                  <span className="summary-box-val highlight">
                    {selectedVehicle ? `₹${estimatedFare}` : `₹${estimatedFareMin} – ₹${estimatedFareMax}`}
                  </span>
                </div>
              )}
            </div>

            {journeyDetails.special_instructions && (
              <div className="summary-detail-box" style={{ marginTop: '12px' }}>
                <span className="summary-box-label">Special Instructions</span>
                <span className="summary-box-val" style={{ fontStyle: 'italic' }}>
                  "{journeyDetails.special_instructions}"
                </span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

