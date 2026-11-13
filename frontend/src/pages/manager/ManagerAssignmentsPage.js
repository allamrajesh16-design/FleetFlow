import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listBookingsApi,
  listBusSchedulesApi,
  cancelBookingApi,
  getDispatchSummaryApi,
} from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/common/Button';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PageHeader from '../../components/common/PageHeader';
import {
  BusIcon,
  VehicleIcon,
  BikeIcon,
  ClockIcon,
  CheckCircleIcon,
  DriverIcon,
  AlertCircleIcon,
} from '../../components/common/Icons';
import { TextInput, DateInput, Select } from '../../components/forms';
import {
  formatDate,
  formatDateTime,
} from '../../utils/formatters';
import AssignedTripsTable from '../../components/manager/AssignedTripsTable';
import './AssignmentsRebuild.css';
import '../admin/AdminPages.css';
import './ManagerPages.css';

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

export default function ManagerAssignmentsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  // 1. Summary KPIs
  const [summaryStats, setSummaryStats] = useState({
    waiting: 0,
    ready_now: 0,
    past_dates: 0,
    scheduled_today: 0,
    free_drivers_now: 0,
    free_vehicles_now: 0,
    pending_assignments: 0,
  });

  // 2. Pending Bookings List States
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);
  const [waitingItems, setWaitingItems] = useState([]);
  const [tabFilter, setTabFilter] = useState('ALL'); // ALL | CARS_BIKES | BUSES
  const [dateFilter, setDateFilter] = useState('ALL'); // ALL | TODAY | TOMORROW | THIS_WEEK | CUSTOM
  const [customDate, setCustomDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('soonest'); // soonest | newest | passengers
  const [pastGroupOpen, setPastGroupOpen] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState(null);
  const [cancelTargetBookingId, setCancelTargetBookingId] = useState(null);
  const [tripRefreshKey, setTripRefreshKey] = useState(0);

  // Abort refs
  const listAbortRef = useRef(null);

  // =========================================================================
  // 1. LOAD DISPATCH SUMMARY (4 Small Metric Cards)
  // =========================================================================
  const loadSummary = useCallback(async () => {
    try {
      const res = await getDispatchSummaryApi();
      if (res) {
        setSummaryStats(res);
      }
    } catch {
      // Non-blocking fallback
    }
  }, []);

  // =========================================================================
  // 2. LOAD WAITING ITEMS (Pending Bookings & Bus Schedules)
  // =========================================================================
  const loadWaitingItems = useCallback(async () => {
    if (listAbortRef.current) {
      listAbortRef.current.abort();
    }
    const controller = new AbortController();
    listAbortRef.current = controller;

    setLoadingList(true);
    setListError(null);

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
          customer_phone: b.customer_phone || b.customer?.phone || '',
          pickup_location: b.pickup_location || 'Origin',
          drop_location: b.drop_location || 'Destination',
          route: `${b.pickup_location || 'Origin'} to ${b.drop_location || 'Destination'}`,
          datetime: b.travel_datetime,
          typeLabel: b.vehicle_type || 'CAR',
          passengers: b.passengers || 1,
          estimated_fare: b.estimated_fare,
          customer_selected_vehicle: Boolean(b.vehicle),
          selected_vehicle_id: b.vehicle,
          selected_vehicle_reg: b.vehicle_registration,
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
          customer_phone: 'Fixed Schedule',
          pickup_location: s.source || 'Origin',
          drop_location: s.destination || 'Destination',
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
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        const msg = err.response?.data?.detail || 'Failed to load bookings waiting for assignment.';
        setListError(msg);
        toast.error(msg);
      }
    } finally {
      clearTimeout(timeoutTimer);
      setLoadingList(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWaitingItems();
    loadSummary();

    const intervalTimer = setInterval(() => {
      loadWaitingItems();
      loadSummary();
    }, 60000);

    const handleFocus = () => {
      loadWaitingItems();
      loadSummary();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(intervalTimer);
      window.removeEventListener('focus', handleFocus);
      if (listAbortRef.current) listAbortRef.current.abort();
    };
  }, [loadWaitingItems, loadSummary]);

  // =========================================================================
  // 3. NAVIGATE TO DEDICATED FULL-PAGE ASSIGNMENT INTERFACE
  // =========================================================================
  const handleAssignTrip = (item) => {
    const paramKey = item.kind === 'BOOKING' ? 'booking' : 'bus_schedule';
    navigate(`/manager/assignments/new?${paramKey}=${item.id}`);
  };

  // =========================================================================
  // 5. CANCEL PAST BOOKINGS
  // =========================================================================
  const handleConfirmCancelPastBooking = async () => {
    if (!cancelTargetBookingId) return;
    const bookingId = cancelTargetBookingId;
    setCancellingBookingId(bookingId);
    try {
      await cancelBookingApi(bookingId, 'Cancelled: travel date has passed');
      toast.success(`Booking #${bookingId} has been cancelled.`);
      setCancelTargetBookingId(null);
      loadWaitingItems();
      loadSummary();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel expired booking.');
    } finally {
      setCancellingBookingId(null);
    }
  };

  // =========================================================================
  // 6. FILTERING & SORTING WAITING ITEMS
  // =========================================================================
  const filteredWaitingItems = useMemo(() => {
    let items = waitingItems.filter((item) => {
      // Tab Filter
      if (tabFilter === 'CARS_BIKES') {
        if (item.typeLabel === 'BUS') return false;
      } else if (tabFilter === 'BUSES') {
        if (item.typeLabel !== 'BUS') return false;
      }

      // Date Filter
      if (dateFilter !== 'ALL' && item.datetime) {
        const itemDate = new Date(item.datetime);
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
        const startOfDayAfter = new Date(startOfTomorrow.getTime() + 86400000);
        const startOfNextWeek = new Date(startOfToday.getTime() + 7 * 86400000);

        if (dateFilter === 'TODAY') {
          if (itemDate < startOfToday || itemDate >= startOfTomorrow) return false;
        } else if (dateFilter === 'TOMORROW') {
          if (itemDate < startOfTomorrow || itemDate >= startOfDayAfter) return false;
        } else if (dateFilter === 'THIS_WEEK') {
          if (itemDate < startOfToday || itemDate >= startOfNextWeek) return false;
        } else if (dateFilter === 'CUSTOM' && customDate) {
          const cDate = new Date(customDate);
          if (
            itemDate.getFullYear() !== cDate.getFullYear() ||
            itemDate.getMonth() !== cDate.getMonth() ||
            itemDate.getDate() !== cDate.getDate()
          ) {
            return false;
          }
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = item.displayName.toLowerCase().includes(q) || String(item.id).includes(q);
        const matchesRoute = item.route.toLowerCase().includes(q);
        const matchesCust = item.customer_name && item.customer_name.toLowerCase().includes(q);
        const matchesPhone = item.customer_phone && item.customer_phone.toLowerCase().includes(q);
        if (!matchesId && !matchesRoute && !matchesCust && !matchesPhone) return false;
      }

      return true;
    });

    // Sort: soonest first by default
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
  }, [waitingItems, tabFilter, dateFilter, customDate, searchQuery, sortOrder]);

  const { assignableItems, pastItems } = useMemo(() => {
    const assignable = [];
    const past = [];
    for (const item of filteredWaitingItems) {
      if (item.datePassed) {
        past.push(item);
      } else {
        assignable.push(item);
      }
    }
    return { assignableItems: assignable, pastItems: past };
  }, [filteredWaitingItems]);

  const getVehicleIcon = (type) => {
    const t = String(type).toUpperCase();
    if (t === 'BUS') return <BusIcon size={16} />;
    if (t === 'BIKE') return <BikeIcon size={16} />;
    return <VehicleIcon size={16} />;
  };

  return (
    <div className="admin-page-container fade-in">
      {/* 1. PAGE HEADER */}
      <div className="assignments-header-bar">
        <PageHeader
          title="Trip Assignment Center"
          subtitle="Assign pending customer bookings to drivers and vehicles."
        />

        <div className="assignments-header-actions">
          <span className="assignments-date-badge">
            📅 {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* 2. 4 SMALL SUMMARY CARDS */}
      <div className="assignments-summary-grid">
        {/* Card 1: Pending Bookings */}
        <div className="assignment-summary-card-metric pending">
          <div className="summary-card-icon-wrap pending">
            <ClockIcon size={24} />
          </div>
          <div className="summary-card-body">
            <div className="summary-card-value">
              {assignableItems.length}
            </div>
            <div className="summary-card-label">Pending Bookings</div>
          </div>
        </div>

        {/* Card 2: Available Drivers */}
        <div className="assignment-summary-card-metric drivers">
          <div className="summary-card-icon-wrap drivers">
            <DriverIcon size={24} />
          </div>
          <div className="summary-card-body">
            <div className="summary-card-value">
              {summaryStats.free_drivers_now ?? 0}
            </div>
            <div className="summary-card-label">Available Drivers</div>
          </div>
        </div>

        {/* Card 3: Available Vehicles */}
        <div className="assignment-summary-card-metric vehicles">
          <div className="summary-card-icon-wrap vehicles">
            <VehicleIcon size={24} />
          </div>
          <div className="summary-card-body">
            <div className="summary-card-value">
              {summaryStats.free_vehicles_now ?? 0}
            </div>
            <div className="summary-card-label">Available Vehicles</div>
          </div>
        </div>

        {/* Card 4: Assigned Today */}
        <div className="assignment-summary-card-metric assigned">
          <div className="summary-card-icon-wrap assigned">
            <CheckCircleIcon size={24} />
          </div>
          <div className="summary-card-body">
            <div className="summary-card-value">
              {summaryStats.scheduled_today ?? 0}
            </div>
            <div className="summary-card-label">Assigned Today</div>
          </div>
        </div>
      </div>

      {/* 3. FILTER & SEARCH TOOLBAR */}
      <div className="assignment-filter-toolbar">
        <div className="filter-search-box">
          <TextInput
            placeholder="Search by customer name, phone, booking ID or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="sm"
          />
        </div>

        <div className="filter-category-pills">
          <Button
            type="button"
            variant={tabFilter === 'ALL' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setTabFilter('ALL')}
          >
            All ({waitingItems.length})
          </Button>
          <Button
            type="button"
            variant={tabFilter === 'CARS_BIKES' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setTabFilter('CARS_BIKES')}
          >
            Cars & Bikes
          </Button>
          <Button
            type="button"
            variant={tabFilter === 'BUSES' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setTabFilter('BUSES')}
          >
            Buses
          </Button>
        </div>

        <div className="filter-date-group">
          <Select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            size="sm"
            options={[
              { value: 'ALL', label: 'All Dates' },
              { value: 'TODAY', label: 'Today' },
              { value: 'TOMORROW', label: 'Tomorrow' },
              { value: 'THIS_WEEK', label: 'This Week' },
              { value: 'CUSTOM', label: 'Custom Date' },
            ]}
          />
          {dateFilter === 'CUSTOM' && (
            <DateInput
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              size="sm"
            />
          )}
          <Select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            options={[
              { value: 'soonest', label: 'Sort: Soonest Departure' },
              { value: 'newest', label: 'Sort: Newest Booking' },
              { value: 'passengers', label: 'Sort: Most Passengers' },
            ]}
            size="sm"
          />
        </div>
      </div>

      {/* 4. MAIN PENDING BOOKINGS TABLE */}
      <div className="assignments-table-card">
        <div className="assignments-table-header">
          <div>
            <h3 className="assignments-table-title">Pending Customer Bookings</h3>
            <p className="assignments-table-subtitle">
              {assignableItems.length} booking(s) approved and waiting for driver & vehicle dispatch
            </p>
          </div>
        </div>

        {/* LOADING STATE */}
        {loadingList && (
          <div className="assignments-pane-loading">
            <div className="assignment-skeleton-item" />
            <div className="assignment-skeleton-item" />
            <div className="assignment-skeleton-item" />
          </div>
        )}

        {/* ERROR STATE */}
        {!loadingList && listError && (
          <div className="assignment-pane-error">
            <AlertCircleIcon size={28} color="var(--danger)" />
            <p>{listError}</p>
            <Button variant="outline" size="sm" onClick={loadWaitingItems}>
              Retry Loading
            </Button>
          </div>
        )}

        {/* EMPTY STATE */}
        {!loadingList && !listError && assignableItems.length === 0 && (
          <div className="assignment-waiting-empty">
            <div className="empty-icon-art">📋</div>
            <h4>No Bookings Waiting for Assignment</h4>
            <p>All approved customer reservations have been paired with vehicles and drivers.</p>
          </div>
        )}

        {/* TABLE CONTENT */}
        {!loadingList && !listError && assignableItems.length > 0 && (
          <div className="assignments-table-responsive-wrapper">
            <table className="assignments-booking-table">
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Customer Name</th>
                  <th>Pickup Location</th>
                  <th>Drop Location</th>
                  <th>Journey Date</th>
                  <th>Time</th>
                  <th>Vehicle Type</th>
                  <th>Passengers</th>
                  <th>Assignment Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {assignableItems.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong className="booking-table-id">#{item.id}</strong>
                        {item.customer_selected_vehicle && (
                          <span className="table-lock-tag" title={`Locked to ${item.selected_vehicle_reg}`}>
                            🔒 Locked
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="table-customer-cell">
                        <strong className="customer-name">{item.customer_name}</strong>
                        <span className="customer-phone">{item.customer_phone || item.customer?.phone || '—'}</span>
                      </div>
                    </td>
                    <td className="location-cell" title={item.pickup_location || item.source}>
                      🟢 {item.pickup_location || item.source}
                    </td>
                    <td className="location-cell" title={item.drop_location || item.destination}>
                      🔴 {item.drop_location || item.destination}
                    </td>
                    <td>{formatDate(item.datetime)}</td>
                    <td style={{ fontWeight: 600 }}>{formatTime(item.datetime)}</td>
                    <td>
                      <span className={`booking-type-chip chip-${item.typeLabel.toLowerCase()}`}>
                        {getVehicleIcon(item.typeLabel)} {item.typeLabel}
                      </span>
                    </td>
                    <td>{item.passengers || 1} Pax</td>
                    <td>
                      <span className="assignment-status-badge pending">
                        Pending Assignment
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => handleAssignTrip(item)}
                        style={{ fontWeight: 700 }}
                      >
                        View & Assign
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PAST DATES COLLAPSIBLE SECTION */}
      {pastItems.length > 0 && (
        <div className="assignment-past-group-container">
          <div
            className="assignment-past-group-header"
            onClick={() => setPastGroupOpen(!pastGroupOpen)}
            role="button"
            tabIndex={0}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="assignment-past-badge">
                Past Dates ({pastItems.length})
              </span>
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted, #64748B)' }}>
                Bookings whose scheduled departure time has already passed
              </span>
            </div>
            <Button variant="ghost" size="sm" type="button">
              {pastGroupOpen ? 'Hide ▲' : 'Show ▼'}
            </Button>
          </div>

          {pastGroupOpen && (
            <div className="assignments-table-responsive-wrapper" style={{ padding: '16px' }}>
              <table className="assignments-booking-table">
                <thead>
                  <tr>
                    <th>Booking ID</th>
                    <th>Customer Name</th>
                    <th>Departure Date & Time</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pastItems.map((item) => (
                    <tr key={item.key}>
                      <td>#{item.id}</td>
                      <td>{item.customer_name}</td>
                      <td>{formatDateTime(item.datetime)}</td>
                      <td><span className="assignment-past-badge">Date has passed</span></td>
                      <td>
                        {item.kind === 'BOOKING' && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={cancellingBookingId === item.id}
                            loading={cancellingBookingId === item.id}
                            onClick={() => setCancelTargetBookingId(item.id)}
                          >
                            Cancel Booking
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 6. ASSIGNED TRIPS HISTORY TABLE (Recent Assignments Record) */}
      <AssignedTripsTable
        refreshKey={tripRefreshKey}
        title="Assignment History"
        subtitle="Complete record of driver and vehicle trip assignments"
        onTripCancelled={() => {
          loadWaitingItems();
          loadSummary();
          setTripRefreshKey((prev) => prev + 1);
        }}
        onTripReassigned={() => {
          loadWaitingItems();
          loadSummary();
          setTripRefreshKey((prev) => prev + 1);
        }}
      />

      {/* Confirm Past Booking Cancel Dialog */}
      <ConfirmDialog
        isOpen={Boolean(cancelTargetBookingId)}
        onClose={() => !cancellingBookingId && setCancelTargetBookingId(null)}
        onConfirm={handleConfirmCancelPastBooking}
        title="Cancel Past Booking"
        message={`Cancel Booking #${cancelTargetBookingId} because its travel date has passed?`}
        confirmLabel="Cancel Booking"
        cancelLabel="Keep Booking"
        confirmVariant="danger"
        loading={Boolean(cancellingBookingId)}
      />
    </div>
  );
}
