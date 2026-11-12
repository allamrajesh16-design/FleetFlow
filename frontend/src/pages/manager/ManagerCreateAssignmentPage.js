import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  getAssignableResourcesApi,
  assignTripApi,
} from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/common/Button';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Loader';
import { VehiclePlate } from '../../components/common/SignatureDesign';
import {
  ArrowLeftIcon,
  CheckIcon,
  DriverIcon,
  UserIcon,
  PhoneIcon,
  CalendarIcon,
  LockIcon,
  AlertCircleIcon,
  SearchIcon,
  CloseIcon,
} from '../../components/common/Icons';
import { Textarea, TextInput } from '../../components/forms';
import {
  formatRupees,
  formatDate,
} from '../../utils/formatters';
import './ManagerCreateAssignmentPage.css';

function formatTime(dtStr) {
  if (!dtStr) return '—';
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export default function ManagerCreateAssignmentPage() {
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const queryBookingId = searchParams.get('booking') || bookingId;
  const queryBusScheduleId = searchParams.get('bus_schedule');

  // Loading & Data States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resourceData, setResourceData] = useState(null);

  // Selection States
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [dispatchNote, setDispatchNote] = useState('');

  // Searchable Driver Dropdown States
  const [driverSearch, setDriverSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Submission States
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // 1. Fetch Resources
  const fetchResources = useCallback(async () => {
    if (!queryBookingId && !queryBusScheduleId) {
      setError('No target booking or bus schedule specified.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSubmitError('');

    try {
      const params = {
        include_unavailable: true,
      };
      if (queryBookingId) {
        params.booking = queryBookingId;
      } else if (queryBusScheduleId) {
        params.bus_schedule = queryBusScheduleId;
      }

      const data = await getAssignableResourcesApi(params);
      setResourceData(data);

      // Auto-select customer-locked vehicle or recommended
      const target = data?.target;
      if (target?.customer_selected_vehicle && target?.selected_vehicle_id) {
        const lockedV = (data.vehicles || []).find((v) => v.id === target.selected_vehicle_id);
        if (lockedV) {
          setSelectedVehicle(lockedV);
        } else {
          setSelectedVehicle({
            id: target.selected_vehicle_id,
            registration_number: target.selected_vehicle_reg,
            brand: target.vehicle_brand || 'Selected',
            model: target.vehicle_model || 'Vehicle',
            vehicle_type: target.vehicle_type,
            seating_capacity: target.passengers || 4,
            available: true,
            is_locked_choice: true,
          });
        }
      } else if (data?.recommended?.vehicle_id) {
        const recV = (data.vehicles || []).find((v) => v.id === data.recommended.vehicle_id && v.available);
        if (recV) setSelectedVehicle(recV);
      }

      // Keep driver selection unselected by default so placeholder displays until selected
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to load booking resources. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [queryBookingId, queryBusScheduleId]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  // Click outside to close driver dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const target = resourceData?.target;
  const isCustomerLocked = Boolean(target?.customer_selected_vehicle || target?.vehicle_locked);

  // Compatible vehicles
  const compatibleVehicles = useMemo(() => {
    if (!resourceData?.vehicles || !target) return [];
    const requestedType = String(target.vehicle_type || '').toUpperCase();
    let list = resourceData.vehicles;

    if (requestedType && requestedType !== 'ALL') {
      const typeMatches = list.filter((v) => String(v.vehicle_type || '').toUpperCase() === requestedType);
      if (typeMatches.length > 0) list = typeMatches;
    }

    return list;
  }, [resourceData?.vehicles, target]);

  // Filtered dropdown drivers based on search
  const searchableDrivers = useMemo(() => {
    if (!resourceData?.drivers) return [];
    const query = driverSearch.trim().toLowerCase();
    let list = resourceData.drivers;

    if (query) {
      list = list.filter((d) =>
        (d.name && d.name.toLowerCase().includes(query)) ||
        (d.phone && d.phone.toLowerCase().includes(query)) ||
        (d.license_number && d.license_number.toLowerCase().includes(query))
      );
    }

    // Sort available drivers to top
    return [...list].sort((a, b) => (b.available ? 1 : 0) - (a.available ? 1 : 0));
  }, [resourceData?.drivers, driverSearch]);

  const handleSelectDriver = (driver) => {
    if (!driver.available) return;
    setSelectedDriver(driver);
    setDriverSearch('');
    setIsDropdownOpen(false);
  };

  const handleClearDriver = (e) => {
    e.stopPropagation();
    setSelectedDriver(null);
    setDriverSearch('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Submit Assignment
  const handleConfirmAssignment = async () => {
    if (!target) return;
    if (!selectedDriver) {
      setSubmitError('Please select an eligible driver from the dropdown.');
      return;
    }
    if (!selectedVehicle) {
      setSubmitError('Please select a compatible vehicle for this assignment.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const payload = {
        vehicle: selectedVehicle.id,
        driver: selectedDriver.id,
        source: target.source || target.pickup_location,
        destination: target.destination || target.drop_location,
        scheduled_datetime: target.scheduled_datetime || target.datetime,
        dispatch_note: dispatchNote.trim(),
      };

      if (target.type === 'BOOKING' || queryBookingId) {
        payload.booking = target.id || queryBookingId;
      } else {
        payload.bus_schedule = target.id || queryBusScheduleId;
      }

      const res = await assignTripApi(payload);
      toast.success(
        `Trip #${res.id} assigned successfully to ${selectedDriver.name} with vehicle ${selectedVehicle.registration_number}! Notification email sent.`
      );
      navigate('/manager/assignments');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Assignment failed. Check resource availability and schedule conflicts.';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="dispatch-workspace-page">
        <div style={{ marginBottom: '24px' }}>
          <Skeleton height="20px" width="300px" style={{ marginBottom: '12px' }} />
          <Skeleton height="36px" width="450px" />
        </div>
        <div className="dispatch-two-column-form">
          <div className="dispatch-left-profile-col">
            <Skeleton height="480px" borderRadius="12px" />
          </div>
          <div className="dispatch-right-form-col">
            <Skeleton height="540px" borderRadius="12px" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !target) {
    return (
      <div className="dispatch-workspace-page">
        <ErrorState
          title="Booking Not Found or Ineligible"
          message={error || 'Unable to find an eligible pending booking with this ID.'}
          action={
            <Button variant="primary" onClick={() => navigate('/manager/assignments')}>
              Back to Assignments
            </Button>
          }
        />
      </div>
    );
  }

  const driverInitials = selectedDriver?.name
    ? selectedDriver.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'DR';

  return (
    <div className="dispatch-workspace-page">
      {/* Breadcrumb Navigation */}
      <nav className="dispatch-breadcrumbs" aria-label="Breadcrumb">
        <Link to="/manager/dashboard">Manager Dashboard</Link>
        <span className="breadcrumb-sep">/</span>
        <Link to="/manager/assignments">Assignments</Link>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">Create Assignment</span>
      </nav>

      {/* Page Header */}
      <div className="dispatch-page-header">
        <div className="dispatch-header-title-wrap">
          <h1 className="dispatch-page-title">Create Trip Assignment</h1>
          <p className="dispatch-page-subtitle">
            Assign an available driver and suitable vehicle to complete customer booking #{target.id}.
          </p>
        </div>
        <Button
          variant="outline"
          leftIcon={<ArrowLeftIcon size={16} />}
          onClick={() => navigate('/manager/assignments')}
        >
          Back to Assignments
        </Button>
      </div>

      {submitError && (
        <div className="dispatch-alert-banner">
          <AlertCircleIcon size={20} color="#991b1b" />
          <div>
            <strong>Assignment Error:</strong> {submitError}
          </div>
        </div>
      )}

      {/* TWO-COLUMN ASSIGNMENT WORKFLOW */}
      <div className="dispatch-two-column-form">
        {/* ===================================================================
            LEFT SIDE – SELECTED DRIVER PROFILE PANEL
            =================================================================== */}
        <div className="dispatch-left-profile-col">
          <div className="dispatch-profile-panel">
            <div className="dispatch-panel-header">
              <div className="dispatch-section-icon">
                <DriverIcon size={18} />
              </div>
              <div>
                <h2 className="dispatch-panel-heading">Assigned Driver Profile</h2>
                <p className="dispatch-panel-sub">
                  {selectedDriver ? 'Active selection for this dispatch' : 'Live driver profile preview'}
                </p>
              </div>
            </div>

            {!selectedDriver ? (
              /* Driver Profile Placeholder */
              <div className="driver-profile-placeholder">
                <div className="placeholder-avatar-ring">
                  <DriverIcon size={38} color="#94a3b8" />
                </div>
                <h3 className="placeholder-title">No Driver Selected</h3>
                <p className="placeholder-text">
                  Select a driver from the dropdown on the right to view complete profile, verification, and workload information.
                </p>
                <div className="placeholder-hint">
                  <span>💡 Only verified, available drivers are eligible for assignment.</span>
                </div>
              </div>
            ) : (
              /* Selected Driver Profile Card */
              <div className="driver-selected-profile-view">
                {/* Header card with avatar, name & badges */}
                <div className="driver-profile-hero">
                  <div className="driver-hero-avatar">
                    {driverInitials}
                    <span
                      className={`driver-hero-status-dot ${selectedDriver.available ? 'available' : 'busy'}`}
                      title={selectedDriver.available ? 'Available' : 'Busy'}
                    />
                  </div>
                  <div className="driver-hero-info">
                    <div className="driver-hero-name-row">
                      <h3 className="driver-hero-name">{selectedDriver.name}</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="driver-clear-btn"
                        onClick={handleClearDriver}
                        leftIcon={<CloseIcon size={13} />}
                        title="Clear driver selection"
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="driver-hero-badge-row">
                      <span className="driver-badge verified">✓ Verified</span>
                      <span
                        className={`driver-badge ${selectedDriver.available ? 'available' : 'busy'}`}
                      >
                        {selectedDriver.available ? '● Available' : '● Busy'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details Group */}
                <div className="driver-profile-details-list">
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Phone Number</span>
                    <span className="profile-detail-val">
                      <PhoneIcon size={14} color="#2563eb" />
                      {selectedDriver.phone || 'Phone on file'}
                    </span>
                  </div>

                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Email Address</span>
                    <span className="profile-detail-val">
                      {selectedDriver.email || 'Email on file'}
                    </span>
                  </div>

                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Driving License</span>
                    <span className="profile-detail-val font-mono">
                      {selectedDriver.license_number || 'DL-APPROVED'}
                    </span>
                  </div>

                  <div className="profile-detail-row">
                    <span className="profile-detail-label">License Expiry</span>
                    <span className="profile-detail-val">
                      {selectedDriver.license_expiry ? formatDate(selectedDriver.license_expiry) : 'Valid (Not expired)'}
                    </span>
                  </div>

                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Today's Assigned Trips</span>
                    <span className="profile-detail-val">
                      <strong>{selectedDriver.trips_today || 0} trips</strong>
                    </span>
                  </div>

                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Working Hours Today</span>
                    <span className="profile-detail-val">
                      {selectedDriver.hours_today || 0} hrs active
                    </span>
                  </div>

                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Recent Trip Activity</span>
                    <span className="profile-detail-val subtext">
                      {selectedDriver.last_trip || 'Ready for next schedule'}
                    </span>
                  </div>
                </div>

                <div className="driver-profile-email-badge">
                  <span>✉️ Driver will receive automatic assignment confirmation via email.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===================================================================
            RIGHT SIDE – ASSIGNMENT FORM
            =================================================================== */}
        <div className="dispatch-right-form-col">
          <div className="dispatch-form-card">
            {/* SECTION A: BOOKING INFORMATION */}
            <div className="form-section-block">
              <div className="form-section-header">
                <div className="form-section-num">1</div>
                <div>
                  <h3 className="form-section-title">Booking Information</h3>
                  <p className="form-section-sub">Trip requirements & customer itinerary</p>
                </div>
                {target.estimated_fare != null && (
                  <span className="booking-fare-pill">
                    Fare: {formatRupees(target.estimated_fare)}
                  </span>
                )}
              </div>

              <div className="booking-meta-grid">
                <div className="booking-meta-cell">
                  <span className="meta-lbl">Booking Reference</span>
                  <span className="meta-val highlight">Booking #{target.id}</span>
                </div>

                <div className="booking-meta-cell">
                  <span className="meta-lbl">Customer Name</span>
                  <span className="meta-val">
                    <UserIcon size={14} color="#2563eb" />
                    {target.customer_name || 'Customer'}
                  </span>
                </div>

                <div className="booking-meta-cell">
                  <span className="meta-lbl">Journey Schedule</span>
                  <span className="meta-val">
                    <CalendarIcon size={14} color="#2563eb" />
                    {formatDate(target.scheduled_datetime)} at {formatTime(target.scheduled_datetime)}
                  </span>
                </div>

                <div className="booking-meta-cell">
                  <span className="meta-lbl">Vehicle Type & Pax</span>
                  <span className="meta-val">
                    {target.vehicle_type} • {target.passengers} Passenger{target.passengers > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Route Indicator Box */}
              <div className="form-route-box">
                <div className="route-point">
                  <span className="route-dot pickup" />
                  <div className="route-content">
                    <span className="route-tag">Pickup Location</span>
                    <span className="route-addr">{target.source || target.pickup_location}</span>
                  </div>
                </div>
                <div className="route-line" />
                <div className="route-point">
                  <span className="route-dot drop" />
                  <div className="route-content">
                    <span className="route-tag">Drop Location</span>
                    <span className="route-addr">{target.destination || target.drop_location}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION B: SELECT DRIVER (Searchable Dropdown) */}
            <div className="form-section-block">
              <div className="form-section-header">
                <div className="form-section-num">2</div>
                <div>
                  <h3 className="form-section-title">Select Driver *</h3>
                  <p className="form-section-sub">
                    Search and choose an eligible, available driver for this trip
                  </p>
                </div>
              </div>

              <div className="driver-searchable-select-wrap" ref={dropdownRef}>
                <div
                  className={`searchable-dropdown-control ${isDropdownOpen ? 'focused' : ''} ${
                    selectedDriver ? 'has-selection' : ''
                  }`}
                  onClick={() => {
                    setIsDropdownOpen(true);
                    if (searchInputRef.current) searchInputRef.current.focus();
                  }}
                >
                  <TextInput
                    id="driver-search-field"
                    ref={searchInputRef}
                    label={<span>Assigned Driver <span className="text-danger">*</span></span>}
                    leftIcon={<SearchIcon size={16} color="#64748b" />}
                    placeholder={
                      selectedDriver
                        ? `${selectedDriver.name} (${selectedDriver.phone || selectedDriver.license_number})`
                        : 'Search driver by name, phone, or license...'
                    }
                    value={driverSearch}
                    onChange={(e) => {
                      setDriverSearch(e.target.value);
                      if (!isDropdownOpen) setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    autoComplete="off"
                    rightElement={
                      <div className="dropdown-right-controls">
                        {selectedDriver && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="dropdown-clear-icon-btn"
                            onClick={handleClearDriver}
                            leftIcon={<CloseIcon size={14} />}
                            title="Clear selected driver"
                            aria-label="Clear selected driver"
                          />
                        )}
                        <span className="dropdown-chevron-arrow">▾</span>
                      </div>
                    }
                  />
                </div>

                {/* Dropdown Options Menu */}
                {isDropdownOpen && (
                  <div className="searchable-dropdown-menu" role="listbox">
                    <div className="dropdown-menu-header">
                      <span>Available Verified Drivers ({searchableDrivers.filter(d => d.available).length})</span>
                      {driverSearch && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="dropdown-reset-search-btn"
                          onClick={() => setDriverSearch('')}
                        >
                          Clear Search
                        </Button>
                      )}
                    </div>

                    <div className="dropdown-options-list">
                      {searchableDrivers.length === 0 ? (
                        <div className="dropdown-no-results">
                          <span>No drivers match "{driverSearch}". Try another search term.</span>
                        </div>
                      ) : (
                        searchableDrivers.map((driver) => {
                          const isSelected = selectedDriver?.id === driver.id;
                          const isAvailable = Boolean(driver.available);

                          return (
                            <div
                              key={driver.id}
                              className={`dropdown-option-item ${isSelected ? 'selected' : ''} ${
                                !isAvailable ? 'disabled' : ''
                              }`}
                              onClick={() => handleSelectDriver(driver)}
                              role="option"
                              aria-selected={isSelected}
                            >
                              <div className="option-avatar">
                                {driver.name
                                  ? driver.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
                                  : 'DR'}
                              </div>

                              <div className="option-info">
                                <div className="option-name-row">
                                  <span className="option-name">{driver.name}</span>
                                  <span className="option-verified">✓ Verified</span>
                                  {isSelected && <span className="option-selected-tag">Selected</span>}
                                </div>
                                <div className="option-meta-row">
                                  <span>{driver.phone || 'Phone on file'}</span>
                                  <span className="meta-sep">•</span>
                                  <span>Lic: {driver.license_number}</span>
                                  <span className="meta-sep">•</span>
                                  <span>{driver.trips_today || 0} trips today</span>
                                </div>
                              </div>

                              <div className="option-status-wrap">
                                {isAvailable ? (
                                  <span className="option-status-badge available">✓ Available</span>
                                ) : (
                                  <span className="option-status-badge busy" title={driver.reason}>
                                    ⚠️ {driver.reason ? (driver.reason.length > 20 ? driver.reason.slice(0, 20) + '...' : driver.reason) : 'Busy'}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION C: VEHICLE INFORMATION */}
            <div className="form-section-block">
              <div className="form-section-header">
                <div className="form-section-num">3</div>
                <div>
                  <h3 className="form-section-title">Vehicle Information</h3>
                  <p className="form-section-sub">
                    {isCustomerLocked
                      ? 'Pre-assigned vehicle based on customer selection'
                      : `Select an available ${target.vehicle_type} for this trip`}
                  </p>
                </div>
              </div>

              {isCustomerLocked ? (
                <div className="vehicle-locked-banner">
                  <div className="vehicle-locked-left">
                    <VehiclePlate registrationNumber={target.selected_vehicle_reg} size="sm" />
                    <div className="vehicle-locked-meta">
                      <div className="vehicle-locked-title">
                        {selectedVehicle?.brand} {selectedVehicle?.model} ({selectedVehicle?.vehicle_type || target.vehicle_type})
                      </div>
                      <div className="vehicle-locked-sub">
                        Capacity: <strong>{selectedVehicle?.seating_capacity || target.passengers} Seats</strong> • Status: <span className="text-success font-semibold">Operational</span>
                      </div>
                    </div>
                  </div>
                  <span className="locked-pill-tag">
                    <LockIcon size={12} /> Customer Locked
                  </span>
                </div>
              ) : (
                <div className="vehicle-selection-grid">
                  {compatibleVehicles.map((vehicle) => {
                    const isSelected = selectedVehicle?.id === vehicle.id;
                    const isAvailable = Boolean(vehicle.available);
                    const isCapacityFit = (vehicle.seating_capacity || 4) >= (target.passengers || 1);

                    return (
                      <div
                        key={vehicle.id}
                        className={`vehicle-select-card ${isSelected ? 'selected' : ''} ${
                          !isAvailable ? 'disabled' : ''
                        }`}
                        onClick={() => {
                          if (isAvailable) setSelectedVehicle(vehicle);
                        }}
                        role="button"
                        tabIndex={isAvailable ? 0 : -1}
                      >
                        <div className="vehicle-card-top">
                          <VehiclePlate registrationNumber={vehicle.registration_number} size="sm" />
                          <span
                            className={`vehicle-avail-tag ${isAvailable ? 'available' : 'busy'}`}
                          >
                            {isAvailable ? 'Ready' : 'Busy'}
                          </span>
                        </div>
                        <div className="vehicle-card-name">
                          {vehicle.brand} {vehicle.model}
                        </div>
                        <div className="vehicle-card-specs">
                          <span style={{ color: isCapacityFit ? '#64748b' : '#dc2626' }}>
                            👥 {vehicle.seating_capacity} Seats
                          </span>
                          {vehicle.rate_per_km && <span>₹{vehicle.rate_per_km}/km</span>}
                        </div>
                        {isSelected && (
                          <div className="vehicle-selected-indicator">
                            <CheckIcon size={12} /> Selected
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION D: ASSIGNMENT NOTES */}
            <div className="form-section-block">
              <div className="form-section-header">
                <div className="form-section-num">4</div>
                <div>
                  <h3 className="form-section-title">Assignment Notes (Optional)</h3>
                  <p className="form-section-sub">Instructions for the driver or dispatch records</p>
                </div>
              </div>

              <Textarea
                id="dispatch-notes"
                placeholder="e.g. Flight arrival pickup, call customer 10 minutes prior, assistance with baggage required..."
                rows={3}
                value={dispatchNote}
                onChange={(e) => setDispatchNote(e.target.value)}
              />
            </div>

            {/* SECTION E: ASSIGNMENT ACTIONS & READINESS */}
            <div className="form-actions-summary-block">
              <div className="readiness-status-bar">
                <span className="readiness-label">Dispatch Status:</span>
                <span
                  className={`readiness-badge ${
                    selectedDriver && selectedVehicle ? 'ready' : 'draft'
                  }`}
                >
                  {selectedDriver && selectedVehicle ? '✓ READY TO CONFIRM' : 'SELECT DRIVER & VEHICLE'}
                </span>
              </div>

              <div className="assignment-buttons-row">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!selectedDriver || !selectedVehicle || submitting}
                  loading={submitting}
                  onClick={handleConfirmAssignment}
                  className="confirm-assign-btn"
                >
                  {submitting ? 'Confirming Assignment...' : 'Confirm Assignment'}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={submitting}
                  onClick={() => navigate('/manager/assignments')}
                  className="cancel-assign-btn"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
