# Fleet Manager Guide: Trip Monitoring & Dispatch Center

This guide provides simple, step-by-step instructions for Fleet Managers to operate the **Dispatch Center**, pair reservations with vehicles and drivers, monitor live vehicle trips, and handle reassignments or incident cancellations in FleetFlow.

---

## 1. How to Use the Dispatch Center (`/manager/assignments`)

The FleetFlow **Dispatch Center** transforms fleet operations into a high-efficiency command hub.

### Key Layout Elements:
1. **Header & Date Filter**:
   - Title: **Dispatch Center**.
   - Date Filter: Switch between **All Dates**, **Today**, **Tomorrow**, **This week**, or **Custom date**.
   - **6 Real-time KPI Chips**:
     - `Waiting (n)`: Total reservations pending assignment.
     - `Ready now (n)`: Actionable bookings ready for immediate vehicle/driver pairing.
     - `Past dates (n)`: Expired bookings whose scheduled date has passed.
     - `Scheduled today (n)`: Trips slated for dispatch today.
     - `Free drivers now (n)`: Licensed drivers available right now.
     - `Free vehicles now (n)`: Roadworthy vehicles available right now.
   - Refreshed automatically every 60 seconds and instantly whenever the browser tab regains focus.

2. **Waiting Queue (Left 40%)**:
   - Single-line count badge: `X waiting | Y ready` with a hover tooltip.
   - Search box: Filter tickets by customer name, route destination, or booking number.
   - Vehicle type tabs: `All`, `Cars and Bikes`, `Buses`.
   - **Urgency Chips**:
     - `Under 2h` (Red): Immediate priority departure.
     - `Within 24h` (Orange): Departing within the next 24 hours.
     - `Date has passed` (Red): Past-date bookings (collapsed at the bottom).
     - `in Xd Yh` (Grey): Future departures.

3. **Assignment Workspace (Right 60%)**:
   - **Summary Card**: Customer name (phone number strictly omitted for privacy), route with `RouteLine`, scheduled datetime, passenger count, and estimated fare.
   - **Recommendation Card**: The dispatch engine evaluates fleet size, capacity fit, scheduled maintenance, and driver workload to recommend the optimal vehicle and driver:
     - Clear reason chips: e.g. `Free all day`, `Seats 4 for 2 passengers`, `No service due this week`, `Licence valid until 2028`.
     - Click **Use recommendation** to auto-select both vehicle and driver in one click.
     - Selecting an alternate vehicle or driver automatically displays an override note: *"Different from the recommendation: Manager selected alternate vehicle or driver."*
   - **Side-by-Side Choosers**:
     - Left column: Vehicle chooser with search, vehicle plate, model, seating capacity, rate/km, fuel type, next free time, and next scheduled service date.
     - Right column: Driver chooser with search, name, license expiry, trips completed today, and scheduled hours today.
     - `Show unavailable` checkbox: Displays greyed-out unavailable units with clear explanation badges (e.g. `On a trip until 4:30 PM`, `Insurance expired`, `In maintenance`).
   - **Availability Timeline**:
     - Visual hourly timeline from `06:00` to `22:00` for the selected travel date.
     - Tracks for the chosen/recommended vehicle and driver (expandable to 5 rows).
     - Existing trips appear as solid grey bars with hover details.
     - The pending booking window is highlighted in blue dashed lines.
     - Overlapping conflicts are instantly flagged in bold red with `⚠ CONFLICT`.
   - **Dispatch Note**:
     - Optional text field (max 300 characters with live character counter).
     - Example: *"Carry child safety seat and pick up near gate 2."*
     - Stored on `Trip.dispatch_note` and delivered to the driver's notification and trip view. Strictly hidden from customer view.
   - **Review & Confirm**:
     - Complete summary table of all dispatch details.
     - *"What happens next"* explanatory box.
     - Click **Assign trip** (spinner shows while sending, double-submit protection).
   - **Success Card**:
     - Displays a green confirmation card: `Trip #X created for [Driver Name] with [Vehicle Plate]`.
     - Quick buttons: **View trip** or **Assign next** (auto-selects the next ready ticket).

---

## 2. Reassigning a Scheduled Trip

For operational adjustments (e.g., driver sickness, vehicle flat tyre), `SCHEDULED` trips can be reassigned from **Today's dispatch board**:

1. Scroll to **Today's dispatch board** at the bottom of the Dispatch Center.
2. Filter trips using the status tabs: `All`, `Scheduled (n)`, `In progress (n)`, `Completed today (n)`.
3. Locate the scheduled trip and click **Reassign**.
4. The **Reassign Modal** opens:
   - Displays the current vehicle and driver.
   - Change the vehicle, change the driver, or change both.
   - Input the mandatory **Reason for Reassignment** (e.g. *"Driver emergency reported to dispatch"*).
5. Click **Confirm Reassignment**:
   - The backend atomically validates resource availability (excluding the trip's own time window).
   - `TripAssignmentLog` records the previous assignment, new assignment, user, and reason.
   - Notifications are dispatched automatically to the old driver (*"Trip removed"*), the new driver, and the customer.
   - A success toast confirms the update.

---

## 3. Handling Past-Date Bookings (Zero Native Alerts)

When a booking's scheduled travel date has passed:
1. Past-date tickets are grouped at the bottom under a collapsed `Past dates (n)` group.
2. Clicking **Cancel booking** opens a styled `ConfirmDialog` modal:
   - Title: `Cancel Past Booking`.
   - Message: `Cancel Booking #ID because its travel date has passed?`.
   - Buttons: `Keep Booking` (dismisses without changes) or `Cancel Booking` (cancels booking and frees resources).
   - **Zero native browser alerts (`window.confirm`/`window.alert`) are ever used.**
3. In the empty state (when `0 ready` to assign), a teaching card displays 3 numbered steps:
   - `1 A customer books a future date.`
   - `2 You approve it in Approvals.`
   - `3 It appears here ready to assign.`
   - Includes quick action buttons: **Open Approvals**, **Show past bookings**, and **Cancel past bookings** (bulk cancel).

---

## 4. Trip Monitoring & Real-Time Map (`/manager/trips`)

The Trip Monitoring page provides an interactive, real-time dispatch map and telemetry tracking system for managing active and scheduled fleet trips.

### 4.1 Step-by-Step: How to Monitor a Trip
1. **Navigate to Trip Monitoring**: Click **Trip Monitoring** in the sidebar or open `/manager/trips`.
2. **Explore the All-Vehicle Overview Map**:
   - When no trip is selected, the map shows every `IN_PROGRESS` vehicle currently transmitting telemetry with its registration plate.
   - The map header displays the active vehicle count transmitting GPS.
3. **Select a Trip**:
   - Click any trip card on the left list, a row in table view, or a vehicle marker on the map.
   - The map automatically centers and fits bounds to the trip's planned route, showing the green pickup pin (`A`), red drop pin (`B`), and the moving vehicle marker.
4. **Inspect Real-Time Telemetry & Route Progress**:
   - **Route Line**: High-contrast blue line (6px wide on 9px white casing). The portion already travelled is displayed in a lighter grey-blue.
   - **Vehicle Marker**: Displays vehicle type icon (car, bus, bike), real-time heading orientation, and a soft pulse while `LIVE`.
   - **Floating Telemetry Chips**: Live status (`LIVE`, `STALE`, `NO SIGNAL`), `OFF ROUTE` warning if >500m away, remaining distance in km, and real-time clock ETA.
   - **Follow Vehicle**: Toggle the `Follow` switch to keep the vehicle centered automatically during movement. Panning the map automatically disables auto-follow to prevent camera jumping.
5. **Adjust Pin Locations (Fix Places)**:
   - If a place coordinate requires adjustment, click the **📍 Fix Places** button.
   - Drag either the green pickup (`A`) or red drop (`B`) pin to the exact desired location on the road.
   - Click **Save New Places** to immediately recompute the driving route via OSRM.
6. **Tabs & History**:
   - Switch between **In Progress (n)**, **Scheduled (n)**, **Completed**, and **All Trips**.
   - Filter trips in real-time by plate, driver name, or pickup/drop place using the search input.
   - Switch between **Split / Cards** view and **Table** view anytime.

---

### 4.2 Free Map Services & Rate Limits

FleetFlow uses free OpenStreetMap services with built-in protections:

| Service | Provider | Limits & Policy | FleetFlow Protection |
| :--- | :--- | :--- | :--- |
| **Geocoding** | Nominatim (OSM) | Max 1 request/second; mandatory custom User-Agent and Contact Email | In-memory thread lock with `time.sleep` throttling; 90-day PostgreSQL `GeoCache` table prevents redundant lookups. |
| **Routing** | OSRM Demo Server | Free public demo server for development and testing | Cached on `Trip.route_geojson`; automatic straight-line dashed fallback (`APPROXIMATE`) if the service times out. |
| **Tile Layer** | OpenStreetMap Standard | Free tile server with attribution | Visible attribution displayed: `© OpenStreetMap contributors`. Dark theme dims tiles via CSS filter without extra tile requests. |

#### Environment Variables for Map Services:
- `GEO_USER_AGENT`: Custom identification header for geocoding requests (default: `FleetFlow/1.0 (fleetflow@example.com)`).
- `GEO_CONTACT_EMAIL`: Contact email passed in HTTP requests per Nominatim usage policy (default: `admin@fleetflow.com`).
- `OSRM_URL`: Base URL for routing service (default: `https://router.project-osrm.org` for demos). Production deployments can point to a self-hosted OSRM instance.

---

### 4.3 GPS Demo Simulator (`simulate_trip_gps`)

For testing and local development, FleetFlow includes a realistic GPS simulator command that walks along a trip's stored route and generates simulated telemetry pings:

```bash
# Run simulator at 40 km/h with 2-second telemetry pings
python manage.py simulate_trip_gps <trip_id> --speed 40 --interval 2

# Fast test mode without sleep delay
python manage.py simulate_trip_gps <trip_id> --speed 60 --interval 1 --no-sleep
```

- **Safety Guard**: Refuses to run and prints a warning when `DEBUG is False`.
- **Data Integrity**: All generated telemetry points have `is_simulated=True`, ensuring they are excluded from official reports and driver recorded distance calculations.

