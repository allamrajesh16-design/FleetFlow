# FleetFlow — Driver Portal User Guide

This guide details the features and day-to-day workflow for **Drivers** using the FleetFlow mobile and desktop responsive portal.

---

## 1. Overview & Navigation

Drivers access FleetFlow via `/driver` (or `/login`). On mobile devices (< 768px), the portal displays an app-like layout with an icon-rich bottom navigation bar:

- **Home (`/driver/dashboard`)**: Daily summary, shift greeting, license expiry ring, active trip banner, and quick action cards.
- **My Trips (`/driver/trips`)**: Filter tabs for *Upcoming*, *In Progress*, and *Completed* trips.
- **Fuel (`/driver/fuel`)**: Log vehicle fuel fill-ups (liters, total cost, odometer, fuel station, receipt photo).
- **Expenses (`/driver/expenses`)**: Submit operational trip expenses (toll, parking, emergency repairs) with receipt uploads.
- **More**: Slide-out menu linking to **Trip History** (`/driver/history`), **Documents & Compliance** (`/driver/documents`), **Notifications** (`/notifications`), and **Profile** (`/profile`).

---

## 2. Shift & Trip Workflow

### 2.1 Starting an Assigned Trip
1. Navigate to **My Trips** -> **Upcoming** (or click the active trip card on the Dashboard).
2. Click **Start Trip**.
3. **Verification**: Enter the starting odometer reading (must match or exceed the vehicle's last recorded odometer reading).
4. *(Optional)* Capture and attach a dashboard/vehicle start photo.
5. Click **Confirm Start Trip**. The trip status transitions to `IN_PROGRESS`, vehicle status updates to `ON_TRIP`, and real-time GPS telemetry begins tracking.

### 2.2 Live Trip Telemetry & Location Sharing
- When on an `IN_PROGRESS` trip, the browser asks for geolocation permission.
- The platform streams live coordinates, speed (km/h), heading (degrees), and accuracy (meters) every 10 seconds to the Fleet Manager dispatch map.
- If GPS signal is lost or offline, the driver can continue driving; telemetry reconnects automatically.

### 2.3 Completing a Trip & Generating Fare
1. When reaching the destination, open the active trip and click **Complete Trip**.
2. Enter the final odometer reading. The app automatically calculates:
   $$\text{Distance Traveled (km)} = \text{End Odometer} - \text{Start Odometer}$$
   $$\text{Total Fare (₹)} = \text{Distance Traveled} \times \text{Vehicle Rate per Km}$$
3. Click **Complete Trip**. The trip status transitions to `COMPLETED`.

### 2.4 Collecting Payment
- **UPI QR**: Click **Payment QR** to present a dynamic UPI QR code on the phone screen for the customer to scan and pay.
- **Cash**: If the customer pays in cash, click **Cash Collected**. The platform registers the cash transaction and updates the driver's *Cash to Hand Over* balance for end-of-shift reconciliation with the fleet manager.

---

## 3. Fuel & Expense Submission

### 3.1 Fuel Logging
1. Tap **Fuel** from the bottom navigation.
2. Click **+ Add Fuel Entry**.
3. Select the trip/vehicle, enter liters filled, total cost in rupees, current odometer reading, and station name.
4. Upload receipt photo.
5. Submit. The log enters `PENDING` review status until approved by a Fleet Manager.

### 3.2 Expense Logging
1. Tap **Expenses** from the bottom navigation.
2. Select category (**Toll**, **Parking**, **Repair**, **Other**), enter amount and description.
3. Attach bill/receipt snapshot.
4. Submit. The submission is queued for manager review.

---

## 4. Document Management & Expiry Alerts

- View your commercial driving license, medical certificate, and ID proof under **Documents**.
- Visual badge indicators show document review status (`APPROVED`, `PENDING`, `REJECTED`).
- If any document is expiring within 30 days, a warning badge and countdown ring appear on your dashboard.

