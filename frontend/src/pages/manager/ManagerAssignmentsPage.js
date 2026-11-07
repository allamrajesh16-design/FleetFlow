import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  listBookingsApi,
  listBusSchedulesApi,
  getAssignableResourcesApi,
  assignTripApi,
  cancelBookingApi,
} from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/common/Button';
import PageHeader from '../../components/common/PageHeader';
import {
  VehiclePlate,
  DriverChip,
  RouteLine,
  StatusDot,
} from '../../components/common/SignatureDesign';
import {
  CheckIcon,
  InfoIcon,
  WarningIcon,
  RefreshIcon,
  BusIcon,
  VehicleIcon,
  BikeIcon,
} from '../../components/common/Icons';
import { TextInput, DateTimeInput, Select, Checkbox } from '../../components/forms';
import {
  formatRupees,
  formatDate,
  formatDateTime,
} from '../../utils/formatters';
import AssignedTripsTable from '../../components/manager/AssignedTripsTable';
import './AssignmentsRebuild.css';
import '../admin/AdminPages.css';
import './ManagerPages.css';

function formatTimeUntil(dt) {
  if (!dt) return '—';
  const target = new Date(dt).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return 'Passed';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

export default function ManagerAssignmentsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  // Collapsible Guide state
  const [guideOpen, setGuideOpen] = useState(false);

  // Header metric chips
  const [assignmentStats, setAssignmentStats] = useState({
    waiting: 0,
    scheduled_today: 0,
    free_vehicles_now: 0,
    free_drivers_now: 0,
  });

  // Left List States (4 states: skeleton/loading, error, empty, content)
  const [loadingList, setLoadingList] = useState(true);
  const [listTakingLonger, setListTakingLonger] = useState(false);
  const [listError, setListError] = useState(null);
  const [waitingItems, setWaitingItems] = useState([]);
  const [tabFilter, setTabFilter] = useState('ALL'); // ALL | CARS_BIKES | BUSES
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('soonest'); // soonest | newest | passengers
  const [tripRefreshKey, setTripRefreshKey] = useState(0);

  // Selected item state
  const [selectedItem, setSelectedItem] = useState(null);

  // Mobile Sheet View (< 768px)
  const [showMobileSheet, setShowMobileSheet] = useState(false);

  // Right Panel States (4 states: skeleton/loading, error, empty, content)
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourcesTakingLonger, setResourcesTakingLonger] = useState(false);
  const [resourcesError, setResourcesError] = useState(null);
  const [resourceData, setResourceData] = useState(null);
  const [includeUnavailable, setIncludeUnavailable] = useState(false);
  const [resourceWarning, setResourceWarning] = useState(null);

  // Stepper state: 1 = Vehicle, 2 = Driver, 3 = Review
  const [step, setStep] = useState(1);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);

  // View Mode: 'FORM' (Dispatch & Assignment Form) | 'WIZARD' (Interactive Split Wizard)
  const [viewMode, setViewMode] = useState('FORM');

  // Direct Dispatch & Assignment Form States
  const [formBookingKey, setFormBookingKey] = useState('');
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formDriverId, setFormDriverId] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formDatetime, setFormDatetime] = useState('');
  const [formLoadingResources, setFormLoadingResources] = useState(false);
  const [formVehicles, setFormVehicles] = useState([]);
  const [formDrivers, setFormDrivers] = useState([]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Route & time editing
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [customSource, setCustomSource] = useState('');
  const [customDestination, setCustomDestination] = useState('');
  const [customDatetime, setCustomDatetime] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [createdTripResult, setCreatedTripResult] = useState(null);
  const [cancellingBookingId, setCancellingBookingId] = useState(null);

  // Abort controllers refs for clean cancellations
  const listAbortRef = useRef(null);
  const resourceAbortRef = useRef(null);

  // =========================================================================
  // 1. LOAD STATS
  // =========================================================================
  const loadStats = useCallback(async () => {
    try {
      const res = await getAssignableResourcesApi({});
      if (res?.stats) {
        setAssignmentStats(res.stats);
      }
    } catch {
      // Non-blocking fallback
    }
  }, []);

  // =========================================================================
  // 2. LOAD WAITING ITEMS (Independent from selected item)
  // =========================================================================
  const loadWaitingItems = useCallback(async () => {
    if (listAbortRef.current) {
      listAbortRef.current.abort();
    }
    const controller = new AbortController();
    listAbortRef.current = controller;

    setLoadingList(true);
    setListTakingLonger(false);
    setListError(null);

    const longerTimer = setTimeout(() => {
      setListTakingLonger(true);
    }, 8000);

    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      const [bkgRes, busRes] = await Promise.all([
        listBookingsApi({ status: 'APPROVED', has_trip: false, page_size: 100 }),
        listBusSchedulesApi({ status: 'CONFIRMED', has_trip: false, page_size: 100 }),
      ]);

      const now = Date.now();

      const bList = (bkgRes?.results || bkgRes || []).map((b) => {
        const travelMs = new Date(b.travel_datetime).getTime();
        const datePassed = !isNaN(travelMs) && travelMs < now;
        return {
          ...b,
          kind: 'BOOKING',
          key: `bkg-${b.id}`,
          displayName: `Booking #${b.id}`,
          customer_name: b.customer_name || b.customer?.full_name || 'Customer',
          route: `${b.pickup_location || 'Origin'} to ${b.drop_location || 'Destination'}`,
          datetime: b.travel_datetime,
          typeLabel: b.vehicle_type || 'CAR',
          passengers: b.passengers || 1,
          estimated_fare: b.estimated_fare,
          datePassed,
          isAssignable: !datePassed,
        };
      });

      const busList = (busRes?.results || busRes || []).map((s) => {
        const departureMs = new Date(s.departure_datetime).getTime();
        const datePassed = !isNaN(departureMs) && departureMs < now;
        return {
          ...s,
          kind: 'BUS_SCHEDULE',
          key: `bus-${s.id}`,
          displayName: `Schedule #${s.id}`,
          customer_name: 'Bus Passengers',
          route: `${s.source || 'Origin'} to ${s.destination || 'Destination'}`,
          datetime: s.departure_datetime,
          typeLabel: 'BUS',
          passengers: s.vehicle?.seating_capacity || 40,
          booked_seats: s.booked_seats || 0,
          fare_per_seat: s.fare_per_seat,
          datePassed,
          isAssignable: !datePassed,
        };
      });

      const combined = [...bList, ...busList];
      setWaitingItems(combined);

      // Auto-select first assignable item if no selection or current selection expired
      setSelectedItem((current) => {
        if (current) {
          const stillThere = combined.find((x) => x.key === current.key);
          if (stillThere && stillThere.isAssignable) return stillThere;
        }
        const firstAssignable = combined.find((x) => x.isAssignable);
        return firstAssignable || null;
      });
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        const msg = err.response?.data?.detail || 'Failed to load items waiting for assignment.';
        setListError(msg);
        toast.error(msg);
      }
    } finally {
      clearTimeout(longerTimer);
      clearTimeout(timeoutTimer);
      setLoadingList(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWaitingItems();
    loadStats();
    return () => {
      if (listAbortRef.current) listAbortRef.current.abort();
    };
  }, [loadWaitingItems, loadStats]);

  // =========================================================================
  // 3. LOAD ASSIGNABLE RESOURCES (Only when an item is selected)
  // =========================================================================
  const loadResources = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!selectedItem || !selectedItem.isAssignable) {
        setResourceData(null);
        return;
      }

      if (resourceAbortRef.current) {
        resourceAbortRef.current.abort();
      }
      const controller = new AbortController();
      resourceAbortRef.current = controller;

      if (!isBackgroundRefresh) {
        setLoadingResources(true);
        setResourcesTakingLonger(false);
        setResourcesError(null);
      }

      const longerTimer = setTimeout(() => {
        if (!isBackgroundRefresh) setResourcesTakingLonger(true);
      }, 8000);

      const timeoutTimer = setTimeout(() => {
        controller.abort();
      }, 15000);

      try {
        const params = {
          include_unavailable: includeUnavailable,
        };
        if (selectedItem.kind === 'BOOKING') {
          params.booking = selectedItem.id;
        } else {
          params.bus_schedule = selectedItem.id;
        }

        const res = await getAssignableResourcesApi(params);
        setResourceData(res);

        if (res?.stats) {
          setAssignmentStats(res.stats);
        }

        // Prepopulate route & time when first loading
        if (!isBackgroundRefresh) {
          setCustomSource(res.target?.source || selectedItem.pickup_location || selectedItem.source || '');
          setCustomDestination(
            res.target?.destination || selectedItem.drop_location || selectedItem.destination || ''
          );
          if (res.target?.scheduled_datetime) {
            setCustomDatetime(res.target.scheduled_datetime.substring(0, 16));
          } else if (selectedItem.datetime) {
            setCustomDatetime(new Date(selectedItem.datetime).toISOString().substring(0, 16));
          }

          // If bus schedule, auto-match the fixed bus
          if (selectedItem.kind === 'BUS_SCHEDULE') {
            const busMatch = (res.vehicles || []).find((v) => v.available && v.vehicle_type === 'BUS');
            if (busMatch) setSelectedVehicle(busMatch);
          }
        }

        // Real-time check: if currently selected vehicle or driver became unavailable
        if (isBackgroundRefresh) {
          if (selectedVehicle) {
            const stillFree = (res.vehicles || []).find((v) => v.id === selectedVehicle.id && v.available);
            if (!stillFree) {
              setSelectedVehicle(null);
              setResourceWarning('Your selected vehicle is no longer available. Please select another.');
              toast.warning('Selected vehicle is no longer available.');
            }
          }
          if (selectedDriver) {
            const stillFree = (res.drivers || []).find((d) => d.id === selectedDriver.id && d.available);
            if (!stillFree) {
              setSelectedDriver(null);
              setResourceWarning('Your selected driver is no longer available. Please select another.');
              toast.warning('Selected driver is no longer available.');
            }
          }
        }
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          const detail = err.response?.data?.detail || 'Failed to load assignable vehicles and drivers.';
          if (!isBackgroundRefresh) {
            setResourcesError(detail);
          }
        }
      } finally {
        clearTimeout(longerTimer);
        clearTimeout(timeoutTimer);
        if (!isBackgroundRefresh) {
          setLoadingResources(false);
        }
      }
    },
    [selectedItem, includeUnavailable, selectedVehicle, selectedDriver, toast]
  );

  // Trigger resource fetch on item selection change
  useEffect(() => {
    if (selectedItem && selectedItem.isAssignable) {
      setStep(1);
      setSelectedVehicle(null);
      setSelectedDriver(null);
      setIsEditingRoute(false);
      setCreatedTripResult(null);
      setServerError('');
      setResourceWarning(null);
      loadResources(false);
    } else {
      setResourceData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.key, includeUnavailable]);

  // 60-second polling and window focus real-time refresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
      if (selectedItem && selectedItem.isAssignable) {
        loadResources(true);
      }
    }, 60000);

    const handleFocus = () => {
      loadStats();
      if (selectedItem && selectedItem.isAssignable) {
        loadResources(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [loadResources, loadStats, selectedItem]);

  // Manual refresh button handler
  const handleManualRefresh = () => {
    loadWaitingItems();
    loadStats();
    if (selectedItem && selectedItem.isAssignable) {
      loadResources(false);
    }
    setTripRefreshKey((prev) => prev + 1);
    toast.success('Assignment roster refreshed.');
  };

  // =========================================================================
  // 4. CANCEL PAST DATE BOOKING
  // =========================================================================
  const handleCancelPastBooking = async (e, bookingId) => {
    e.stopPropagation();
    if (!window.confirm(`Cancel Booking #${bookingId} because its travel date has passed?`)) {
      return;
    }
    setCancellingBookingId(bookingId);
    try {
      await cancelBookingApi(bookingId, 'Cancelled: travel date has passed');
      toast.success(`Booking #${bookingId} has been cancelled.`);
      loadWaitingItems();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel expired booking.');
    } finally {
      setCancellingBookingId(null);
    }
  };

  // =========================================================================
  // 5. FILTERING & SORTING WAITING ITEMS
  // =========================================================================
  const filteredWaitingItems = useMemo(() => {
    let items = waitingItems.filter((item) => {
      // Tab Filter
      if (tabFilter === 'CARS_BIKES') {
        if (item.typeLabel === 'BUS') return false;
      } else if (tabFilter === 'BUSES') {
        if (item.typeLabel !== 'BUS') return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = item.displayName.toLowerCase().includes(q);
        const matchesRoute = item.route.toLowerCase().includes(q);
        const matchesCust = item.customer_name && item.customer_name.toLowerCase().includes(q);
        if (!matchesId && !matchesRoute && !matchesCust) return false;
      }

      return true;
    });

    // Sort
    items.sort((a, b) => {
      if (sortOrder === 'soonest') {
        return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
      }
      if (sortOrder === 'newest') {
        return new Date(b.created_at || b.datetime).getTime() - new Date(a.created_at || a.datetime).getTime();
      }
      if (sortOrder === 'passengers') {
        return (b.passengers || 1) - (a.passengers || 1);
      }
      return 0;
    });

    return items;
  }, [waitingItems, tabFilter, searchQuery, sortOrder]);

  // =========================================================================
  // 6. FINAL ASSIGNMENT SUBMISSION
  // =========================================================================
  const handleAssignTrip = async () => {
    if (!selectedVehicle || !selectedDriver || !selectedItem) return;
    setSubmitting(true);
    setServerError('');

    try {
      const payload = {
        vehicle: selectedVehicle.id,
        driver: selectedDriver.id,
        source: customSource.trim(),
        destination: customDestination.trim(),
        scheduled_datetime: customDatetime,
      };

      if (selectedItem.kind === 'BOOKING') {
        payload.booking = selectedItem.id;
      } else {
        payload.bus_schedule = selectedItem.id;
      }

      const res = await assignTripApi(payload);
      toast.success(`Trip created for ${selectedDriver.name} with ${selectedVehicle.registration_number}`);
      setCreatedTripResult({
        tripId: res.id,
        driverName: selectedDriver.name,
        vehicleReg: selectedVehicle.registration_number,
      });

      // Refresh waiting items list, stats and recent assignments table
      loadWaitingItems();
      loadStats();
      setTripRefreshKey((prev) => prev + 1);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Assignment failed. Check resource availability.';
      setServerError(detail);
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignNext = () => {
    setCreatedTripResult(null);
    setSelectedVehicle(null);
    setSelectedDriver(null);
    setStep(1);
    setIsEditingRoute(false);
    setServerError('');
    setResourceWarning(null);
    setShowMobileSheet(false);

    // Auto-select next assignable item
    const remaining = waitingItems.filter(
      (x) => x.key !== selectedItem?.key && x.isAssignable
    );
    if (remaining.length > 0) {
      setSelectedItem(remaining[0]);
    } else {
      setSelectedItem(null);
    }
  };

  // =========================================================================
  // DIRECT DISPATCH FORM HANDLERS & OPTIONS
  // =========================================================================
  const handleFormReservationChange = async (key) => {
    setFormBookingKey(key);
    setFormVehicleId('');
    setFormDriverId('');
    setFormVehicles([]);
    setFormDrivers([]);
    setFormError('');

    if (!key) {
      setFormSource('');
      setFormDestination('');
      setFormDatetime('');
      return;
    }

    const item = waitingItems.find((w) => w.key === key);
    if (item) {
      setFormSource(item.pickup_location || item.source || '');
      setFormDestination(item.drop_location || item.destination || '');
      if (item.datetime) {
        try {
          const d = new Date(item.datetime);
          const pad = (n) => String(n).padStart(2, '0');
          const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          setFormDatetime(localIso);
        } catch {
          setFormDatetime('');
        }
      }
    }

    setFormLoadingResources(true);
    try {
      const isBooking = key.startsWith('bkg-') || key.startsWith('booking:');
      const id = key.includes('-') ? key.split('-')[1] : key.split(':')[1];
      const params = isBooking ? { booking: id } : { bus_schedule: id };
      params.include_unavailable = false;

      const res = await getAssignableResourcesApi(params);
      const freeVehicles = (res?.vehicles || []).filter((v) => v.available);
      const freeDrivers = (res?.drivers || []).filter((d) => d.available);

      setFormVehicles(freeVehicles);
      setFormDrivers(freeDrivers);

      if (freeVehicles.length > 0) {
        setFormVehicleId(String(freeVehicles[0].id));
      }
      if (freeDrivers.length > 0) {
        setFormDriverId(String(freeDrivers[0].id));
      }
    } catch (err) {
      setFormError(err?.response?.data?.detail || 'Failed to query available vehicles and drivers.');
    } finally {
      setFormLoadingResources(false);
    }
  };

  const handleFormSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!formBookingKey) {
      setFormError('Please select an approved reservation.');
      return;
    }
    if (!formVehicleId) {
      setFormError('Please select an active vehicle.');
      return;
    }
    if (!formDriverId) {
      setFormError('Please select an active driver.');
      return;
    }
    if (!formSource.trim() || !formDestination.trim()) {
      setFormError('Please enter trip origin and destination.');
      return;
    }
    if (!formDatetime) {
      setFormError('Please select scheduled date and time.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');
    try {
      const isBooking = formBookingKey.startsWith('bkg-') || formBookingKey.startsWith('booking:');
      const id = parseInt(formBookingKey.includes('-') ? formBookingKey.split('-')[1] : formBookingKey.split(':')[1], 10);
      const payload = {
        booking: isBooking ? id : null,
        bus_schedule: isBooking ? null : id,
        vehicle: parseInt(formVehicleId, 10),
        driver: parseInt(formDriverId, 10),
        source: formSource.trim(),
        destination: formDestination.trim(),
        scheduled_datetime: formDatetime,
      };

      const res = await assignTripApi(payload);
      toast.success(`Trip #${res.id} successfully assigned and dispatched!`);

      // Reset form
      setFormBookingKey('');
      setFormVehicleId('');
      setFormDriverId('');
      setFormSource('');
      setFormDestination('');
      setFormDatetime('');
      setFormVehicles([]);
      setFormDrivers([]);

      // Refresh list, stats, and recent trips table
      loadWaitingItems();
      loadStats();
      setTripRefreshKey((prev) => prev + 1);
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to assign trip. Check vehicle/driver availability.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  const reservationOptions = useMemo(() => [
    { value: '', label: '-- Choose an Approved Reservation --' },
    ...waitingItems
      .filter((w) => w.isAssignable && !w.datePassed)
      .map((w) => ({
        value: w.key,
        label: `${w.kind === 'BUS_SCHEDULE' ? 'Bus Schedule' : 'Booking'} #${w.id} — ${w.customer_name || 'Customer'} (${w.typeLabel || 'Vehicle'}) | ${w.pickup_location || w.source || 'Origin'} → ${w.drop_location || w.destination || 'Destination'}`,
      })),
  ], [waitingItems]);

  const vehicleSelectOptions = useMemo(() => [
    {
      value: '',
      label: !formBookingKey
        ? '-- Choose Active Vehicle --'
        : formLoadingResources
        ? '-- Checking vehicle availability... --'
        : formVehicles.length === 0
        ? '-- No Available Vehicles Found --'
        : '-- Choose Active Vehicle --',
    },
    ...formVehicles.map((v) => ({
      value: String(v.id),
      label: `${v.registration_number} — ${v.brand} ${v.model} (${v.vehicle_type}, ${v.seating_capacity} seats)`,
    })),
  ], [formBookingKey, formLoadingResources, formVehicles]);

  const driverSelectOptions = useMemo(() => [
    {
      value: '',
      label: !formBookingKey
        ? '-- Choose Active Driver --'
        : formLoadingResources
        ? '-- Checking driver availability... --'
        : formDrivers.length === 0
        ? '-- No Available Drivers Found (All on Trip) --'
        : '-- Choose Active Driver --',
    },
    ...formDrivers.map((d) => ({
      value: String(d.id),
      label: `${d.name} (License: ${d.license_number})`,
    })),
  ], [formBookingKey, formLoadingResources, formDrivers]);

  const getVehicleIcon = (type) => {
    const t = String(type).toUpperCase();
    if (t === 'BUS') return <BusIcon size={16} />;
    if (t === 'BIKE') return <BikeIcon size={16} />;
    return <VehicleIcon size={16} />;
  };

  // Render the assignment panel contents
  const renderAssignmentPanel = () => {
    if (createdTripResult) {
      return (
        <div className="assignment-success-card">
          <div style={{ color: 'var(--success)', marginBottom: '12px' }}>
            <CheckIcon size={48} />
          </div>
          <h2 className="assignment-success-title">
            Trip created for {createdTripResult.driverName} with {createdTripResult.vehicleReg}
          </h2>
          <p className="assignment-success-details">
            Trip #{createdTripResult.tripId} has been scheduled and dispatched. Assigned vehicle plate:{' '}
            <VehiclePlate registrationNumber={createdTripResult.vehicleReg} size="sm" />.
          </p>
          <div className="assignment-success-actions">
            <Button
              variant="primary"
              onClick={() => navigate(`/manager/trips?search=${createdTripResult.tripId}`)}
            >
              View trip
            </Button>
            <Button variant="outline" onClick={handleAssignNext}>
              Assign next
            </Button>
          </div>
        </div>
      );
    }

    if (!selectedItem) {
      return (
        <div className="assignment-unselected-box">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
            style={{ marginBottom: '12px', opacity: 0.8 }}
          >
            <rect x="3" y="4" width="18" height="16" rx="2" strokeDasharray="3 3" />
            <path d="M7 10h10M7 14h6" />
          </svg>
          <h3>Select a booking from the list</h3>
          <p>Pick an assignable reservation or confirmed bus schedule on the left to start dispatching.</p>
        </div>
      );
    }

    if (loadingResources) {
      return (
        <div className="assignments-pane-loading" style={{ padding: '60px var(--space-4)' }}>
          <div className="assignment-skeleton-item" style={{ height: '80px', width: '100%' }} />
          <div className="assignment-skeleton-item" style={{ height: '140px', width: '100%' }} />
          <p style={{ marginTop: '16px', color: 'var(--color-text-secondary)' }}>
            Checking real-time vehicle and driver availability...
          </p>
          {resourcesTakingLonger && (
            <div className="assignment-longer-notice">
              <span>Checking availability is taking longer than usual...</span>
              <Button variant="outline" size="sm" onClick={() => loadResources(false)}>
                <RefreshIcon size={14} /> Retry
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (resourcesError) {
      return (
        <div className="assignment-pane-error" style={{ padding: '40px var(--space-4)' }}>
          <WarningIcon size={32} color="var(--danger)" />
          <h3>Availability Check Failed</h3>
          <p>{resourcesError}</p>
          <Button variant="outline" size="sm" onClick={() => loadResources(false)}>
            <RefreshIcon size={14} /> Retry Availability Check
          </Button>
        </div>
      );
    }

    return (
      <div>
        {/* Real-time Warning Banner */}
        {resourceWarning && (
          <div className="assignment-warning-banner">
            <WarningIcon size={18} />
            <span>{resourceWarning}</span>
          </div>
        )}

        {/* Selected Booking Summary Card */}
        <div className="assignment-summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 700 }}>
              {selectedItem.displayName} — Summary
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingRoute(!isEditingRoute)}
              style={{ fontSize: 'var(--font-size-xs)' }}
            >
              {isEditingRoute ? 'Done Editing' : 'Edit route & time'}
            </Button>
          </div>

          {isEditingRoute ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <TextInput
                label="Pickup Source"
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
              />
              <TextInput
                label="Drop Destination"
                value={customDestination}
                onChange={(e) => setCustomDestination(e.target.value)}
              />
              <DateTimeInput
                label="Scheduled Datetime"
                value={customDatetime}
                onChange={(e) => setCustomDatetime(e.target.value)}
              />
            </div>
          ) : (
            <div className="assignment-summary-grid">
              <div>
                <div className="assignment-summary-label">Booking #</div>
                <div className="assignment-summary-value">{selectedItem.displayName}</div>
              </div>
              <div>
                <div className="assignment-summary-label">Customer</div>
                <div className="assignment-summary-value">{resourceData?.target?.customer_name || selectedItem.customer_name || 'Customer'}</div>
              </div>
              <div>
                <div className="assignment-summary-label">Pickup & Drop</div>
                <div className="assignment-summary-value">
                  <RouteLine source={customSource} destination={customDestination} compact />
                </div>
              </div>
              <div>
                <div className="assignment-summary-label">Datetime</div>
                <div className="assignment-summary-value">{formatDateTime(customDatetime)}</div>
              </div>
              <div>
                <div className="assignment-summary-label">Passengers</div>
                <div className="assignment-summary-value">{resourceData?.target?.passengers || selectedItem.passengers || 1} passengers</div>
              </div>
              <div>
                <div className="assignment-summary-label">Estimated Fare</div>
                <div className="assignment-summary-value">
                  {resourceData?.target?.estimated_fare != null
                    ? formatRupees(resourceData.target.estimated_fare)
                    : selectedItem.estimated_fare != null
                    ? formatRupees(selectedItem.estimated_fare)
                    : selectedItem.fare_per_seat != null
                    ? `${formatRupees(selectedItem.fare_per_seat)}/seat`
                    : '—'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3-Step Stepper Navigation */}
        <div className="assignment-steps-header">
          <div
            className={`assignment-step-indicator ${step === 1 ? 'active' : selectedVehicle ? 'completed' : ''}`}
            onClick={() => setStep(1)}
            role="button"
            tabIndex={0}
          >
            <span className="assignment-step-badge">1</span>
            <span>1 Vehicle</span>
          </div>
          <span className="assignment-step-sep">→</span>
          <div
            className={`assignment-step-indicator ${step === 2 ? 'active' : selectedDriver ? 'completed' : ''}`}
            onClick={() => selectedVehicle && setStep(2)}
            role="button"
            tabIndex={0}
          >
            <span className="assignment-step-badge">2</span>
            <span>2 Driver</span>
          </div>
          <span className="assignment-step-sep">→</span>
          <div
            className={`assignment-step-indicator ${step === 3 ? 'active' : ''}`}
            onClick={() => selectedVehicle && selectedDriver && setStep(3)}
            role="button"
            tabIndex={0}
          >
            <span className="assignment-step-badge">3</span>
            <span>3 Review</span>
          </div>
        </div>

        {/* Toggle unavailable resources switch */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <Checkbox
            id="toggle-unavailable-resources"
            label="Show unavailable"
            checked={includeUnavailable}
            onChange={(e) => setIncludeUnavailable(e.target.checked)}
          />
        </div>

        {/* STEP 1: VEHICLE SELECTION */}
        {step === 1 && (
          <div>
            <h4 style={{ margin: '0 0 var(--space-2) 0' }}>Step 1: Choose Free Vehicle</h4>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
              Listing free vehicles matching capacity and type without trip overlaps or expired documents.
            </p>

            <div className="assignment-resource-grid">
              {(!resourceData?.vehicles || resourceData.vehicles.length === 0) ? (
                <div className="assignment-resource-none">
                  <p>No free vehicles match this reservation.</p>
                  <span>Toggle "Show unavailable" above to see conflicting vehicles and reasons.</span>
                </div>
              ) : (
                resourceData.vehicles
                  .filter((v) => includeUnavailable || v.available)
                  .map((veh) => (
                    <div
                      key={veh.id}
                      className={`assignment-resource-card ${!veh.available ? 'disabled' : ''} ${
                        selectedVehicle?.id === veh.id ? 'selected' : ''
                      }`}
                      onClick={() => {
                        if (veh.available) setSelectedVehicle(veh);
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <VehiclePlate registrationNumber={veh.registration_number} size="sm" />
                        <StatusDot status={veh.available ? 'ACTIVE' : 'INACTIVE'} label={veh.available ? 'Free' : 'Unavailable'} />
                      </div>
                      <div className="assignment-resource-meta" style={{ marginTop: '8px' }}>
                        <strong>{veh.brand} {veh.model}</strong> • {veh.vehicle_type}
                        <br />
                        Capacity: {veh.seating_capacity} seats
                        {veh.rate_per_km && <> • ₹{veh.rate_per_km}/km</>}
                        <br />
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          Free until: {veh.next_free_time || 'Next trip'}
                        </span>
                      </div>
                      {!veh.available && (
                        <div className="assignment-resource-reason">
                          ⚠ {veh.reason || 'Not available'}
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>

            <div className="assignment-controls-row">
              <span />
              <Button
                variant="primary"
                disabled={!selectedVehicle}
                onClick={() => setStep(2)}
              >
                Next: Choose Driver →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: DRIVER SELECTION */}
        {step === 2 && (
          <div>
            <h4 style={{ margin: '0 0 var(--space-2) 0' }}>Step 2: Choose Free Driver</h4>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
              Listing free licensed drivers with valid license and no trip overlaps.
            </p>

            <div className="assignment-resource-grid">
              {(!resourceData?.drivers || resourceData.drivers.length === 0) ? (
                <div className="assignment-resource-none">
                  <p>No free drivers found for this window.</p>
                  <span>Toggle "Show unavailable" to inspect driver availability reasons.</span>
                </div>
              ) : (
                resourceData.drivers
                  .filter((d) => includeUnavailable || d.available)
                  .map((drv) => (
                    <div
                      key={drv.id}
                      className={`assignment-resource-card ${!drv.available ? 'disabled' : ''} ${
                        selectedDriver?.id === drv.id ? 'selected' : ''
                      }`}
                      onClick={() => {
                        if (drv.available) setSelectedDriver(drv);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <DriverChip name={drv.name} status={drv.available ? 'free' : 'offline'} size="sm" />
                        <strong>{drv.name}</strong>
                      </div>
                      <div className="assignment-resource-meta" style={{ marginTop: '8px' }}>
                        License: {drv.license_number}
                        <br />
                        Licence expiry: {formatDate(drv.license_expiry)}
                        <br />
                        Last trip: {drv.last_trip || 'None recorded'}
                      </div>
                      {!drv.available && (
                        <div className="assignment-resource-reason">
                          ⚠ {drv.reason || 'Driver unavailable'}
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>

            <div className="assignment-controls-row">
              <Button variant="outline" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button
                variant="primary"
                disabled={!selectedDriver}
                onClick={() => setStep(3)}
              >
                Next: Review →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & ASSIGN */}
        {step === 3 && (
          <div>
            <h4 style={{ margin: '0 0 var(--space-3) 0' }}>Step 3: Review & Finalize Assignment</h4>

            <div className="assignment-review-summary-card">
              <div className="assignment-review-row">
                <span className="assignment-review-label">Vehicle Assigned:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <VehiclePlate registrationNumber={selectedVehicle?.registration_number} size="sm" />
                  <span>({selectedVehicle?.brand} {selectedVehicle?.model})</span>
                </div>
              </div>
              <div className="assignment-review-row">
                <span className="assignment-review-label">Driver Assigned:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DriverChip name={selectedDriver?.name} status="free" size="sm" />
                  <span>{selectedDriver?.name} (License: {selectedDriver?.license_number})</span>
                </div>
              </div>
              <div className="assignment-review-row">
                <span className="assignment-review-label">Trip Route:</span>
                <div style={{ minWidth: '220px' }}>
                  <RouteLine source={customSource} destination={customDestination} compact />
                </div>
              </div>
              <div className="assignment-review-row">
                <span className="assignment-review-label">Scheduled Time:</span>
                <strong>{formatDateTime(customDatetime)}</strong>
              </div>
              <div className="assignment-review-row">
                <span className="assignment-review-label">Estimated Fare:</span>
                <strong>
                  {resourceData?.target?.estimated_fare != null
                    ? formatRupees(resourceData.target.estimated_fare)
                    : selectedItem?.estimated_fare != null
                    ? formatRupees(selectedItem.estimated_fare)
                    : selectedItem?.fare_per_seat != null
                    ? `${formatRupees(selectedItem.fare_per_seat)}/seat`
                    : '—'}
                </strong>
              </div>
            </div>

            {/* Backend Error Display with Actionable Links */}
            {serverError && (
              <div className="assignment-error-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <WarningIcon size={18} color="var(--danger)" />
                  <strong>Assignment Rejected by System:</strong>
                </div>
                <p style={{ margin: '0 0 8px 0' }}>{serverError}</p>
                <div className="assignment-error-actions">
                  <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                    Free up / Choose another vehicle
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                    Assign another driver
                  </Button>
                </div>
              </div>
            )}

            <div className="assignment-controls-row">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                ← Back
              </Button>
              <Button
                variant="primary"
                onClick={handleAssignTrip}
                disabled={submitting || !selectedVehicle || !selectedDriver}
                loading={submitting}
              >
                Assign trip
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="admin-page-container fade-in">
      {/* HEADER: Title, Subtitle, 4 Metric Chips, View Mode Switcher, Refresh Button */}
      <div className="assignments-header-bar">
        <PageHeader
          title="Assign Trip"
          subtitle="Pair approved customer reservations with active vehicles and licensed drivers"
        />

        <div className="assignments-header-actions">
          {/* View switcher: Dispatch Form (default) vs Stepper Wizard */}
          <div style={{ display: 'inline-flex', background: 'var(--surface-muted)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <Button
              variant={viewMode === 'FORM' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('FORM')}
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              Dispatch Form
            </Button>
            <Button
              variant={viewMode === 'WIZARD' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('WIZARD')}
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              Stepper Wizard
            </Button>
          </div>

          <div className="assignments-metric-chips">
            <span className="assignment-metric-chip">Waiting ({assignmentStats.waiting})</span>
            <span className="assignment-metric-chip">Scheduled today ({assignmentStats.scheduled_today})</span>
            <span className="assignment-metric-chip">Free vehicles now ({assignmentStats.free_vehicles_now})</span>
            <span className="assignment-metric-chip">Free drivers now ({assignmentStats.free_drivers_now})</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            className="assignment-refresh-btn"
          >
            <RefreshIcon size={14} /> Refresh
          </Button>
        </div>
      </div>

      {viewMode === 'FORM' ? (
        /* DISPATCH & ASSIGNMENT FORM (Matching Picture) */
        <div className="dispatch-form-card">
          <div className="dispatch-form-header">
            <div className="dispatch-form-icon-circle">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </div>
            <div className="dispatch-form-title-group">
              <h2>Dispatch & Assignment Form</h2>
              <p>Prevents scheduling collisions and ensures active licenses</p>
            </div>
          </div>

          {formError && (
            <div className="dispatch-form-error-banner">
              <WarningIcon size={18} color="var(--danger)" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit}>
            {/* Field 1: Select Approved Booking */}
            <div className="dispatch-form-field-group">
              <label className="dispatch-form-label">
                Select Approved Booking <span className="dispatch-form-req">*</span>
              </label>
              <Select
                value={formBookingKey}
                onChange={(e) => handleFormReservationChange(e.target.value)}
                options={reservationOptions}
                disabled={formSubmitting || loadingList}
              />
            </div>

            {/* Field 2 & 3: Active Vehicle & Active Driver */}
            <div className="dispatch-form-grid-2">
              <div>
                <label className="dispatch-form-label">
                  Select Active Vehicle <span className="dispatch-form-req">*</span>
                </label>
                <Select
                  value={formVehicleId}
                  onChange={(e) => setFormVehicleId(e.target.value)}
                  options={vehicleSelectOptions}
                  disabled={formSubmitting || formLoadingResources || !formBookingKey}
                />
              </div>
              <div>
                <label className="dispatch-form-label">
                  Select Active Driver <span className="dispatch-form-req">*</span>
                </label>
                <Select
                  value={formDriverId}
                  onChange={(e) => setFormDriverId(e.target.value)}
                  options={driverSelectOptions}
                  disabled={formSubmitting || formLoadingResources || !formBookingKey}
                />
              </div>
            </div>

            {/* Field 4 & 5: Trip Origin & Destination */}
            <div className="dispatch-form-grid-2">
              <div>
                <label className="dispatch-form-label">
                  Trip Origin / Source <span className="dispatch-form-req">*</span>
                </label>
                <TextInput
                  placeholder="e.g. Kakinada"
                  value={formSource}
                  onChange={(e) => setFormSource(e.target.value)}
                  disabled={formSubmitting}
                />
              </div>
              <div>
                <label className="dispatch-form-label">
                  Trip Destination <span className="dispatch-form-req">*</span>
                </label>
                <TextInput
                  placeholder="e.g. Rajahmundry"
                  value={formDestination}
                  onChange={(e) => setFormDestination(e.target.value)}
                  disabled={formSubmitting}
                />
              </div>
            </div>

            {/* Field 6: Scheduled Date & Time */}
            <div className="dispatch-form-field-group">
              <label className="dispatch-form-label">
                Scheduled Date & Time <span className="dispatch-form-req">*</span>
              </label>
              <DateTimeInput
                value={formDatetime}
                onChange={(e) => setFormDatetime(e.target.value)}
                disabled={formSubmitting}
              />
            </div>

            {/* Submit Button */}
            <div className="dispatch-form-submit-row">
              <Button
                type="submit"
                variant="primary"
                className="dispatch-form-submit-btn"
                disabled={formSubmitting || formLoadingResources || !formBookingKey}
                loading={formSubmitting}
                leftIcon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                }
              >
                Assign Trip
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <>
          {/* 5-Line Collapsible Guide: How assignment works */}
          <div className="assignment-guide-box">
            <div
              className="assignment-guide-header"
              onClick={() => setGuideOpen(!guideOpen)}
              role="button"
              tabIndex={0}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <InfoIcon size={18} color="var(--primary)" />
                <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                  How it works
                </strong>
              </div>
              <Button variant="ghost" size="sm" type="button">
                {guideOpen ? 'Hide Guide ▲' : 'Show Guide ▼'}
              </Button>
            </div>

            {guideOpen && (
              <ol className="assignment-guide-list">
                <li>1 Approve the booking.</li>
                <li>2 Pick it from the list.</li>
                <li>3 Choose a free vehicle.</li>
                <li>4 Choose a free driver.</li>
                <li>5 Review and Assign</li>
              </ol>
            )}
          </div>

          <div className="assignments-split-layout">
            {/* ========================================================================= */}
            {/* LEFT COLUMN (40%): Waiting for assignment list                           */}
            {/* ========================================================================= */}
            <aside className="assignments-waiting-pane">
              <div className="assignments-waiting-header">
                <div className="assignments-waiting-title">
                  <span>Waiting for assignment</span>
                  <span className="assignments-count-badge">{filteredWaitingItems.length}</span>
                </div>

                {/* Filter Tabs: All | Cars and Bikes | Buses */}
                <div className="assignments-tabs-bar">
                  <Button
                    variant={tabFilter === 'ALL' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setTabFilter('ALL')}
                  >
                    All
                  </Button>
                  <Button
                    variant={tabFilter === 'CARS_BIKES' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setTabFilter('CARS_BIKES')}
                  >
                    Cars and Bikes
                  </Button>
                  <Button
                    variant={tabFilter === 'BUSES' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setTabFilter('BUSES')}
                  >
                    Buses
                  </Button>
                </div>

                {/* Search Input */}
                <div className="assignments-waiting-search">
                  <TextInput
                    placeholder="Search customer, place or booking"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    size="sm"
                  />
                </div>

                {/* Sort Select */}
                <Select
                  className="assignments-sort-select"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  options={[
                    { value: 'soonest', label: 'Soonest departure' },
                    { value: 'newest', label: 'Newest' },
                    { value: 'passengers', label: 'Most passengers' },
                  ]}
                  size="sm"
                />
              </div>

              <div className="assignments-waiting-list">
                {/* STATE 1: LOADING SKELETON */}
                {loadingList && (
                  <div className="assignments-pane-loading">
                    <div className="assignment-skeleton-item" />
                    <div className="assignment-skeleton-item" />
                    <div className="assignment-skeleton-item" />
                    {listTakingLonger && (
                      <div className="assignment-longer-notice">
                        <span>Taking longer than usual...</span>
                        <Button variant="outline" size="sm" onClick={loadWaitingItems}>
                          <RefreshIcon size={14} /> Retry
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* STATE 2: ERROR */}
                {!loadingList && listError && (
                  <div className="assignment-pane-error">
                    <WarningIcon size={28} color="var(--danger)" />
                    <p>{listError}</p>
                    <Button variant="outline" size="sm" onClick={loadWaitingItems}>
                      <RefreshIcon size={14} /> Retry Loading
                    </Button>
                  </div>
                )}

                {/* STATE 3: EMPTY */}
                {!loadingList && !listError && filteredWaitingItems.length === 0 && (
                  <div className="assignment-waiting-empty">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                    <h4>Nothing Waiting for Assignment</h4>
                    <p>All approved reservations have already been paired with vehicles and drivers.</p>
                    <Link to="/manager/approvals" className="btn btn-outline btn-sm" style={{ marginTop: '12px' }}>
                      Go to Approvals
                    </Link>
                  </div>
                )}

                {/* STATE 4: CONTENT (Ticket Cards) */}
                {!loadingList &&
                  !listError &&
                  filteredWaitingItems.map((item) => {
                    const isSelected = selectedItem?.key === item.key;
                    const isPast = item.datePassed;

                    return (
                      <div
                        key={item.key}
                        className={`assignment-item-card ticket-card ticket-style ${isSelected ? 'selected' : ''} ${
                          isPast ? 'past-date' : ''
                        }`}
                        onClick={() => {
                          if (!isPast) {
                            setSelectedItem(item);
                            if (typeof window !== 'undefined' && window.innerWidth < 768) {
                              setShowMobileSheet(true);
                            }
                          }
                        }}
                        role="button"
                        tabIndex={isPast ? -1 : 0}
                        aria-disabled={isPast}
                      >
                        <div className="assignment-item-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="assignment-type-icon">{getVehicleIcon(item.typeLabel)}</span>
                            <span className="assignment-item-id">{item.displayName}</span>
                            <span className={`assignment-type-chip chip-${item.typeLabel.toLowerCase()}`}>
                              {item.typeLabel}
                            </span>
                            {item.kind === 'BUS_SCHEDULE' && (
                              <span className="assignment-status-chip confirmed">Confirmed</span>
                            )}
                          </div>
                          <span className="assignment-time-chip">
                            {formatTimeUntil(item.datetime)}
                          </span>
                        </div>

                        <div className="assignment-ticket-customer">
                          <strong>{item.customer_name}</strong>
                        </div>

                        <div className="assignment-item-route">
                          <RouteLine source={item.pickup_location || item.source || 'Origin'} destination={item.drop_location || item.destination || 'Destination'} compact />
                        </div>

                        <div className="assignment-item-meta-row">
                          <div className="assignment-meta-date">
                            {formatDateTime(item.datetime)}
                          </div>
                          <div className="assignment-pax-badge">
                            {item.kind === 'BUS_SCHEDULE' ? (
                              <span>
                                {item.booked_seats || 0}/{item.passengers || 40} seats ({item.min_passengers || 10} min)
                              </span>
                            ) : (
                              <span>{item.passengers || 1} passengers</span>
                            )}
                          </div>
                          <div className="assignment-fare-badge">
                            {item.estimated_fare != null
                              ? formatRupees(item.estimated_fare)
                              : item.fare_per_seat != null
                              ? `${formatRupees(item.fare_per_seat)}/seat`
                              : '—'}
                          </div>
                        </div>

                        {/* Red Chip: Date has passed with Cancel Action */}
                        {isPast && (
                          <div className="assignment-past-chip-row">
                            <span className="assignment-past-badge">Date has passed</span>
                            {item.kind === 'BOOKING' && (
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={cancellingBookingId === item.id}
                                loading={cancellingBookingId === item.id}
                                onClick={(e) => handleCancelPastBooking(e, item.id)}
                                style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px' }}
                              >
                                Cancel booking
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </aside>

            {/* ========================================================================= */}
            {/* RIGHT COLUMN (60%): Assignment Wizard Panel                               */}
            {/* ========================================================================= */}
            <main className="assignment-panel-card desktop-only-panel">
              {renderAssignmentPanel()}
            </main>
          </div>

          {/* Mobile Drawer Sheet for Phones (< 768px) */}
          {showMobileSheet && selectedItem && (
            <div className="assignment-mobile-sheet-overlay" onClick={() => setShowMobileSheet(false)}>
              <div className="assignment-mobile-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="assignment-mobile-sheet-header">
                  <h3>{selectedItem.displayName}</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowMobileSheet(false)}>
                    ✕ Close
                  </Button>
                </div>
                <div className="assignment-mobile-sheet-body">
                  {renderAssignmentPanel()}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Table displaying recent assignments (last 10 trips) */}
      <AssignedTripsTable
        refreshKey={tripRefreshKey}
        title="Recent Trip Assignments"
        subtitle="Last 10 trips assigned across the fleet"
        pageSize={10}
        onTripCancelled={() => {
          loadWaitingItems();
          loadStats();
          setTripRefreshKey((prev) => prev + 1);
        }}
      />
    </div>
  );
}
