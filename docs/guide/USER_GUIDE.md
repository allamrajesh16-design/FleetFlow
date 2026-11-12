# FleetFlow - Comprehensive User Guide & System Overview

Welcome to FleetFlow, an enterprise vehicle fleet, trip automation, and payment management platform.

---

## 1. Role & Permission Matrix

FleetFlow enforces strict role-based access control (RBAC) across both frontend routing guards and Django REST Framework backend viewsets:

| Feature / Resource | Customer | Driver | Fleet Manager | Admin |
| :--- | :---: | :---: | :---: | :---: |
| **Self Registration & OTP Verification** | ✅ | ✅ (Needs Approval) | ✅ (Needs Approval) | System Only |
| **Book On-Demand Car / Bike** | ✅ | ❌ | ❌ | ❌ |
| **Reserve Bus Seats** | ✅ | ❌ | ❌ | ❌ |
| **View Own Bookings & Receipts** | ✅ | ❌ | ❌ | ❌ |
| **Start / Complete Assigned Trips** | ❌ | ✅ | ❌ | ❌ |
| **Record Trip Fuel & Expenses** | ❌ | ✅ (Own Trips) | ❌ | ✅ |
| **Approve / Reject Bookings** | ❌ | ❌ | ✅ | ✅ |
| **Assign Vehicles & Drivers to Trips** | ❌ | ❌ | ✅ | ✅ |
| **Monitor Live Trips & Fleet Health** | ❌ | ❌ | ✅ | ✅ |
| **Create & Manage Bus Schedules** | ❌ | ❌ | ✅ | ✅ |
| **Verify Payment Proofs & Issue Receipts** | ❌ | ✅ (Assigned Trip) | ✅ | ✅ |
| **Approve Manager & Driver Accounts** | ❌ | ❌ | ❌ | ✅ |
| **Manage Vehicles, Rates & Capacities** | ❌ | ❌ | ✅ (View/Edit) | ✅ (Full CRUD) |
| **Upload Compliance Documents** | ❌ | ❌ | ✅ | ✅ |
| **Upload Official Payment QR Code** | ❌ | ❌ | ❌ | ✅ |
| **System-Wide Financial & Cost Reports** | ❌ | ❌ | Operations Only | ✅ (Full Financials) |

---

## 2. Glossary of Terms

- **Booking:** A customer's reservation request for an on-demand vehicle (Car/Bike) or a seat on a scheduled bus trip.
- **Trip:** An operational dispatch instance linking an approved booking with an active vehicle and an eligible driver.
- **Odometer:** The vehicle's mileage reading recorded at trip commencement and completion to calculate trip distance, fare, and fuel efficiency.
- **UTR (Unique Transaction Reference):** The 6–30 character alphanumeric payment reference code issued by the customer's bank upon completing UPI/IMPS payment.
- **Expiry Badge:** Visual color indicator displaying document or license validity (Green = Valid, Amber = Expiring in $\le$ 30 days, Red = Expired).
- **Bus Minimum Rule:** Mandatory minimum passenger count required for a bus trip to operate. If unreached 10 hours prior to departure, the schedule is cancelled.
- **QR Payment:** Contactless static UPI QR code flow allowing customers to scan and transfer funds directly to the corporate account, followed by UTR proof submission.

---

## 3. How to Open and Access FleetFlow

1. **Frontend Web Application:** Open your web browser and navigate to `http://localhost:3000`.
2. **Backend API & Swagger Documentation:** Available at `http://127.0.0.1:8000/api/docs/`.
3. **Admin Administration Portal:** Accessible at `http://127.0.0.1:8000/admin/`.

---

## 4. Troubleshooting & FAQ

### Q: Why is my registration pending approval?
**A:** Fleet Manager and Driver registrations require verification of credentials and commercial driver licenses by an Administrator before access is granted. Customers are approved automatically once email OTP verification is complete.

### Q: Why was my vehicle booking assignment blocked?
**A:** The Fleet Manager assignment engine enforces safety rules: vehicles or drivers with expired licenses, expired registrations, active maintenance records, or overlapping trip commitments are blocked from assignment.

### Q: Can a Driver add fuel logs for any vehicle?
**A:** No. Drivers can only add fuel and expense records for trips explicitly assigned to them, ensuring clean cost attribution.

### Q: What happens when a bus schedule is cancelled due to low passengers?
**A:** Customers receive automated notifications and can choose from three options: transfer to an alternative bus schedule, cancel reservation, or receive an automatic full refund.

---

## 5. Email Verification: What Can and Cannot Be Checked

When registering an account on FleetFlow, the platform performs real-time checks on the email address:

### What CAN be checked:
- **Syntax and Format**: Standard ASCII characters, single `@`, valid domain labels, total length $\le$ 254, username $\le$ 64.
- **Provider Rules**: Gmail-specific (6–30 characters, no leading/trailing or double dots) and Yahoo-specific rules (4–32 characters, starts with letter).
- **Dummy Address Rejection**: Blocks dummy addresses with 4+ identical characters in a row, $\le$ 2 unique characters on length $\ge$ 6, common keyboard runs (`qwerty`, `123456`, `asdfgh`), Shannon entropy < 1.6 on length $\ge$ 8, and dummy dictionary words (`test`, `dummy`, `demo`, `user`, etc.).
- **Domain Verification**: Blocks disposable email providers (250+ domains) and reserved/testing domains (`example.com`, `test.com`, `.local`, `.test`).
- **Domain Typos**: Suggests the correct provider when edit distance $\le$ 2 from major providers (e.g. `gmial.com` $\to$ `gmail.com`).
- **Mail Server DNS**: Confirms domain has active MX or A records (network timeouts do not block users).

### What CANNOT be checked programmatically:
- **Mailbox Existence**: A server cannot verify whether an individual mailbox exists at a provider like Google or Yahoo without actually sending mail, because mail servers disable SMTP `VRFY` and reject verification probes to prevent spam.
- **Spam Filtering**: Server checks cannot predict if a mailbox provider will place an email in the Inbox or Spam folder.

### The OTP is the Final Proof:
Because a program cannot confirm a mailbox exists without sending mail, the **6-digit email OTP is the final, definitive proof** of ownership:
- Accounts remain inactive and unusable until the OTP is verified.
- Unverified registrations older than 24 hours are automatically purged.
- Re-registering with an unverified email address safely replaces the pending account, preventing typo lockouts.


