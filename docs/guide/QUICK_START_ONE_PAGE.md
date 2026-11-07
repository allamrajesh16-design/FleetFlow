# FleetFlow Quick Start (One Page Reference)

A rapid 8-step operational cheat-sheet for each user role in FleetFlow.

---

## 🧑 Customer Quick Start
1. **Register:** Go to `/register`, enter details with 10-digit phone, select `Customer`.
2. **Verify OTP:** Retrieve 6-digit code from email and submit on `/verify-otp`.
3. **Sign In:** Log in at `/login` with email and password.
4. **Book a Car / Bike:** Open `/customer/book`, choose vehicle type, enter pickup/drop, review estimated fare, and confirm.
5. **Reserve Bus Seat:** Select **Bus Booking** tab, pick open route, choose seat count before the 10-hour cutoff.
6. **Track Your Ride:** Go to `/customer/bookings` to monitor status transitions in real time.
7. **Pay via QR:** Open `/customer/payments`, scan bank QR code, enter UTR transaction number, and click **Submit Proof**.
8. **Download Receipt:** Once confirmed, click **Download Receipt (PDF)**.

---

## 🚗 Driver Quick Start
1. **Sign In:** Go to `/login` with your assigned driver credentials.
2. **Check Dashboard:** View your assigned upcoming trip details and vehicle registration.
3. **Inspect Vehicle:** Check vehicle compliance badges (green means active and insured).
4. **Start Trip:** Enter initial odometer reading on the trip screen and click **Start Trip**.
5. **Share Location:** Keep location sharing active during the journey for customer tracking.
6. **Complete Trip:** Enter final odometer reading (must be $\ge$ start odometer) and submit.
7. **Record Fuel / Expense:** Attach fuel bills or toll receipts directly linked to your trip.
8. **Verify Customer Payment:** Check customer's UTR proof on the QR page and click **Confirm**.

---

## 🏢 Fleet Manager Quick Start
1. **Sign In:** Open `/login` with Fleet Manager credentials.
2. **Review Pending Bookings:** Open `/manager/bookings` to inspect customer reservation requests.
3. **Approve / Reject:** Approve ride requests or reject with a documented reason.
4. **Assign Dispatch:** Link an approved booking to an available vehicle and eligible driver (system blocks expired licenses or overlaps).
5. **Monitor Live Fleet:** Track ongoing trips on the interactive live dispatch map.
6. **Bus Schedule Oversight:** Monitor passenger thresholds on upcoming bus departures.
7. **Schedule Maintenance:** Send vehicles with high mileage or repair needs to `MAINTENANCE`.
8. **Verify Expenses:** Audit and approve driver expense claims and toll receipts.

---

## 👑 Administrator Quick Start
1. **Sign In:** Log in at `/login` with Admin credentials.
2. **User & Role Management:** Open `/admin/users` to manage staff roles, activate, or deactivate accounts.
3. **Approve Registrations:** Review pending Fleet Manager and Driver registrations on `/admin/approvals`.
4. **Manage Fleet Assets:** Add, update, or retire vehicles on `/admin/vehicles`.
5. **Set Payment QR:** Upload the company's active UPI QR image and UPI ID in `/admin/settings`.
6. **Trip & Booking Oversight:** View system-wide bookings and dispatch logs.
7. **Process Refunds:** Issue full refunds for cancelled journeys or approved customer requests.
8. **Export Financial Reports:** Generate date-filtered revenue, vehicle utilization, and cost CSV reports.

