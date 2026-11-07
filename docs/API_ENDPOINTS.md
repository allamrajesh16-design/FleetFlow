# FleetFlow - API Endpoints Reference

Base URL: `http://127.0.0.1:8000/api`

---

## 1. Authentication & Accounts (`/api/auth/`)

| Method | Endpoint | Allowed Roles | Description | Throttling |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/register/` | Public (No Login) | Register Customer, Driver, or Fleet Manager | 10 / min |
| `POST` | `/auth/verify-otp/` | Public (No Login) | Verify email OTP code | 5 / min |
| `POST` | `/auth/resend-otp/` | Public (No Login) | Request fresh OTP email | 5 / min |
| `POST` | `/auth/login/` | Public (No Login) | Authenticate user, check approval, return JWT | 10 / min |
| `POST` | `/auth/token/refresh/` | Any Authenticated | Refresh expired access JWT | Standard |
| `POST` | `/auth/forgot-password/` | Public (No Login) | Request password reset token via email | 5 / min |
| `POST` | `/auth/reset-password/` | Public (No Login) | Reset password with token | Standard |
| `GET` | `/auth/profile/` | Any Authenticated | Get currently authenticated user profile | Standard |
| `PUT/PATCH` | `/auth/profile/` | Any Authenticated | Update user profile details | Standard |
| `GET` | `/auth/approvals/` | Admin, Fleet Manager | List users pending registration approval | Standard |
| `POST` | `/auth/approvals/{id}/approve/` | Admin (for FM), Admin/FM (for Drivers) | Approve pending registration | Standard |
| `POST` | `/auth/approvals/{id}/reject/` | Admin, Fleet Manager | Reject pending registration | Standard |

---

## 2. Vehicles & Inventory (`/api/vehicles/`)

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/vehicles/` | Any Authenticated | List all vehicles (filterable by type, status) |
| `POST` | `/vehicles/` | Admin, Fleet Manager | Register new vehicle in fleet |
| `GET` | `/vehicles/{id}/` | Any Authenticated | Retrieve vehicle specifications & history |
| `PUT/PATCH` | `/vehicles/{id}/` | Admin, Fleet Manager | Update vehicle details & status |
| `DELETE` | `/vehicles/{id}/` | Admin, Fleet Manager | Remove vehicle from fleet |
| `GET` | `/vehicles/types/` | Any Authenticated | List available vehicle categories |
| `GET` | `/vehicles/{id}/maintenance/` | Admin, Fleet Manager | View maintenance log history |
| `POST` | `/vehicles/{id}/maintenance/` | Admin, Fleet Manager | Record vehicle maintenance service |

---

## 3. Drivers (`/api/drivers/`)

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/drivers/` | Admin, Fleet Manager | List all registered drivers with statuses |
| `GET` | `/drivers/me/` | Driver | Get driver's own profile and shift status |
| `GET` | `/drivers/{id}/` | Admin, Fleet Manager | View driver license and assignment history |
| `PATCH` | `/drivers/me/status/` | Driver | Toggle driver status (`AVAILABLE`, `ON_TRIP`, `OFF_DUTY`) |
| `PATCH` | `/drivers/{id}/` | Admin, Fleet Manager | Update driver status or license details |

---

## 4. Bookings & Bus Schedules (`/api/bookings/` & `/api/bus-schedules/`)

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/bookings/` | Customer (own), Driver (assigned), Admin, FM (all) | List bookings |
| `POST` | `/bookings/` | Customer, Admin, Fleet Manager | Create private vehicle or bus seat booking |
| `GET` | `/bookings/{id}/` | Customer (own), Driver (assigned), Admin, FM (all) | Booking details |
| `POST` | `/bookings/{id}/approve/` | Admin, Fleet Manager | Approve customer booking request |
| `POST` | `/bookings/{id}/cancel/` | Customer (own), Admin, FM | Cancel booking |
| `GET` | `/bookings/{id}/tracking/` | Customer (own), Driver (assigned), Admin, FM | Live GPS tracking snapshot |
| `POST` | `/bookings/{id}/bus-response/` | Customer (own) | Submit option choice if bus cancelled |
| `GET` | `/bus-schedules/` | Any Authenticated | List available intercity bus departures |
| `POST` | `/bus-schedules/` | Admin, Fleet Manager | Schedule new intercity bus departure |
| `GET` | `/bus-schedules/{id}/` | Any Authenticated | Retrieve bus schedule passenger occupancy |
| `PATCH` | `/bus-schedules/{id}/` | Admin, Fleet Manager | Update bus departure status or timing |

---

## 5. Trips & GPS Tracking (`/api/trips/`)

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/trips/` | Driver (own), Admin, Fleet Manager (all) | List trip records |
| `POST` | `/trips/assign/` | Admin, Fleet Manager | Dispatch trip by assigning vehicle & driver |
| `GET` | `/trips/{id}/` | Driver (own), Admin, Fleet Manager (all) | Retrieve trip details |
| `POST` | `/trips/{id}/start/` | Driver (assigned) | Start trip with starting odometer reading |
| `POST` | `/trips/{id}/complete/` | Driver (assigned) | Complete trip with ending odometer & fare |
| `POST` | `/trips/{id}/location/` | Driver (assigned) | Broadcast real-time GPS coordinates |
| `GET` | `/trips/{id}/tracking/` | Driver, Customer (linked), Admin, FM | Fetch latest trip tracking trajectory |

---

## 6. Payments, Receipts & Refunds (`/api/payments/`)

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/payments/` | Customer (own), Driver (own trips), Admin, FM (all) | List payment records |
| `GET` | `/payments/{id}/` | Customer (own), Driver (own trips), Admin, FM (all) | Payment details |
| `GET` | `/payments/{id}/pay-info/` | Customer (own), Driver, Admin, FM | Get amount, UPI ID and QR code image |
| `POST` | `/payments/{id}/submit-proof/` | Customer (own) | Submit UTR reference & proof screenshot |
| `POST` | `/payments/{id}/confirm/` | Driver (assigned), Admin, Fleet Manager | Verify and confirm UPI payment |
| `POST` | `/payments/{id}/refund/` | Admin Only | Process refund for a PAID payment |
| `GET` | `/payments/{id}/receipt/pdf/` | Customer (own), Driver, Admin, FM | Download ReportLab PDF trip receipt |
| `GET` | `/payments/qr-setting/` | Any Authenticated | Get current organization UPI payment settings |
| `POST/PUT` | `/payments/qr-setting/` | Admin Only | Configure UPI ID and upload static QR image |

---

## 7. Dashboards & Reports (`/api/dashboard/` & `/api/reports/`)

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/dashboard/admin/` | Admin Only | Fleet-wide revenue, active counts, and analytics |
| `GET` | `/dashboard/fleet-manager/` | Fleet Manager, Admin | Operational stats, vehicles, pending approvals |
| `GET` | `/dashboard/driver/` | Driver Only | Today's trips, completed counts, recent earnings |
| `GET` | `/dashboard/customer/` | Customer Only | Active bookings, completed rides, quick actions |
| `GET` | `/reports/trips/` | Admin Only | Trips CSV / JSON report export |
| `GET` | `/reports/payments/` | Admin Only | Financial & payment CSV / JSON report export |
| `GET` | `/reports/utilization/` | Admin Only | Fleet utilization report export |
