# FleetFlow - Pre-Submission Manual Test Checklist

Tick each box before final evaluation to ensure 100% test and operational readiness.

---

## 1. Authentication & Security
- [ ] **Public Registration**: Can register Customer, Driver, Fleet Manager (`/register`).
- [ ] **Role Protection on Registration**: Verifying that choosing "Admin" during public registration is strictly blocked or ignored.
- [ ] **Email OTP Verification**: OTP screen prompts for 6-digit code (`/verify-otp`); invalid codes show clear error message.
- [ ] **Approval Gate**:
  - [ ] Driver cannot log in until approved by Fleet Manager or Admin.
  - [ ] Fleet Manager cannot log in until approved by Admin.
  - [ ] Status message "Account pending approval" displays clearly.
- [ ] **Rate Limiting (DRF Throttling)**: More than 10 logins/min or 5 OTP attempts/min returns `HTTP 429 Too Many Requests`.
- [ ] **Token Refresh**: Access token refreshes silently on HTTP 401 without logging out active users.
- [ ] **Logout**: Logs user out, purges localStorage tokens, and redirects cleanly to `/login`.

---

## 2. Customer Workflows
- [ ] **Customer Dashboard**: Displays total bookings, active trips, and quick action cards (`/customer/dashboard`).
- [ ] **Vehicle Booking**:
  - [ ] Pickup, drop, date, passenger inputs validate correctly (`/customer/book`).
  - [ ] Booking is created with `PENDING` status.
- [ ] **Bus Seat Booking**:
  - [ ] Intercity bus schedules display available seats, departure times, and fares (`/customer/bus-booking`).
  - [ ] Seat booking fails gracefully if within 10 hours of departure (Bus 10-hour rule).
- [ ] **My Bookings**: Filterable by status (All, Pending, Approved, Completed, Cancelled) (`/customer/bookings`).
- [ ] **Live Tracking**: Displays driver name, vehicle plate, trip status, and coordinates update in real time (`/customer/bookings/:id/tracking`).
- [ ] **Payment Flow**:
  - [ ] Opens Payment page with organization UPI QR code and total amount (`/customer/payments/:id/pay`).
  - [ ] Submits UTR reference number and payment proof screenshot.
  - [ ] Transitions to `PAYMENT_INITIATED` status.
- [ ] **PDF Receipt**:
  - [ ] Upon confirmation, displays `PAID` badge.
  - [ ] Clicking "Download Receipt" delivers branded ReportLab PDF receipt.
- [ ] **Cancelled Bus Notification**:
  - [ ] Passenger receives alert if bus under-capacity auto-cancels.
  - [ ] Passenger can select Alternative Vehicle, Reschedule, or Refund.

---

## 3. Fleet Manager Workflows
- [ ] **Fleet Manager Dashboard**: Displays vehicle counts, driver availability, and pending bookings (`/fleet/dashboard`).
- [ ] **Vehicle Inventory**: Add, view, edit status (`ACTIVE`, `IN_SERVICE`, `RETIRED`) (`/fleet/vehicles`).
- [ ] **Driver Management**:
  - [ ] Review pending driver registrations and license numbers (`/fleet/drivers`).
  - [ ] Approve or reject driver profiles.
- [ ] **Booking Approval & Dispatch**:
  - [ ] Approve pending customer booking (`/fleet/bookings`).
  - [ ] Dispatch trip: Assign active vehicle and available driver (`/fleet/dispatch`).
- [ ] **Bus Schedule Management**: Create new intercity departure routes and view booked seat counts (`/fleet/bus-schedules`).
- [ ] **Maintenance Alerts**: View alerts for vehicles nearing service thresholds (`/fleet/maintenance`).

---

## 4. Driver Workflows (Mobile View)
- [ ] **Mobile Interface**: Center-aligned on desktop, native feel on mobile (360px - 480px) (`/driver/dashboard`).
- [ ] **Shift Toggle**: Driver can switch status between `AVAILABLE` and `OFF_DUTY`.
- [ ] **Start Trip**:
  - [ ] Enters start odometer reading with validation.
  - [ ] Trip status transitions to `IN_PROGRESS`.
- [ ] **Live Location Broadcasting**: Hook activates and sends GPS coordinates every 10 seconds.
- [ ] **Complete Trip**:
  - [ ] Enters ending odometer reading (must be $\ge$ starting reading).
  - [ ] System computes distance and displays final fare.
- [ ] **Payment Confirmation**:
  - [ ] Displays static payment QR to customer.
  - [ ] Driver inspects customer UTR reference and confirms receipt.
- [ ] **Trip History**: Displays list of past trips with distance and fare summary (`/driver/history`).

---

## 5. Admin Workflows
- [ ] **Admin Dashboard**: Live metrics for total vehicles, drivers, trips, bookings, and revenue (`/admin/dashboard`).
- [ ] **User & Manager Approvals**: Review and approve pending Fleet Manager accounts (`/admin/users`).
- [ ] **Payment QR Settings**:
  - [ ] Update organization UPI ID.
  - [ ] Upload static QR image (restricted to JPG/PNG/WEBP, under 2MB).
- [ ] **Payment Refunds**:
  - [ ] Review all transaction references and payment statuses (`/admin/payments`).
  - [ ] Issue refund for `PAID` booking; status updates to `REFUNDED`.
- [ ] **CSV Reports**: Export Trips, Payments, and Fleet Utilization reports (`/admin/reports`).

---

## 6. Scheduled Background Jobs
- [ ] `check_bus_schedules`: Automatically cancels bus departures with fewer than 10 passengers at the 10-hour mark.
- [ ] `expire_payment_qr`: Expires unconfirmed payments after time window.
- [ ] `maintenance_alerts`: Triggers maintenance warnings based on vehicle mileage.
- [ ] `run_scheduled_jobs`: Runner executes continuously in terminal without unhandled exceptions.

---

## 7. Automated Test Suites
- [ ] Backend tests: `python manage.py test` (All tests pass with 0 failures, 0 errors).
- [ ] System checks: `python manage.py check` (0 issues).
- [ ] Migrations check: `python manage.py makemigrations --check` (0 missing migrations).
- [ ] Permission matrix test: `python manage.py test core.test_permission_matrix` (5 test suites pass).
- [ ] Frontend build: `npm run build` (0 warnings, 0 errors).
