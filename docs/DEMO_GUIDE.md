# FleetFlow - 10-12 Minute Live Demo Guide

This document provides a step-by-step presentation script for showcasing FleetFlow to stakeholders, evaluators, or clients.

---

## Demo Accounts & Credentials

> [!IMPORTANT]
> All demo accounts share the uniform environment password configured via **`DEMO_PASSWORD`** in `.env`. Do not share passwords in public recordings or repositories.

| Role | Email Address | Display Name / Identifier |
| :--- | :--- | :--- |
| **System Admin** | `admin@fleetflow.com` | FleetFlow Super Administrator |
| **Fleet Manager** | `manager@fleetflow.com` | Operations Lead Rajesh |
| **Driver 1** | `driver1@fleetflow.com` | Suresh Kumar (License: AP05-2022-001) |
| **Driver 2** | `driver2@fleetflow.com` | Ramesh Varma (License: AP05-2022-002) |
| **Driver 3** | `driver3@fleetflow.com` | Venkat Rao (License: AP05-2022-003) |
| **Customer 1** | `customer1@fleetflow.com` | Anil Sharma |
| **Customer 2** | `customer2@fleetflow.com` | Pooja Reddy |

---

## Step-by-Step 10-12 Minute Script

### ⏱️ Minute 0:00 - 1:30 | Introduction & Public Portal
- **Actor / Screen**: Unauthenticated Visitor / Landing Page (`/`).
- **What to Click**: Scroll through the Landing Page; click the **Explore Fleet** and **Features** sections.
- **Expected Result**: Clean dark/light modern UI showing available vehicle types, live statistics, and role login options.
- **What to Say**:
  > *"FleetFlow is a unified platform connecting corporate fleet operators, dispatch managers, drivers, and commuters into a single real-time workflow."*

---

### ⏱️ Minute 1:30 - 3:00 | Customer Booking Workflow
- **Actor / Screen**: Log in as Customer `customer1@fleetflow.com`.
- **What to Click**: Navigate to **Book a Ride** (`/customer/book`). Select **Car**, enter Pickup: `Vijayawada Central`, Drop: `Guntur Junction`, select tomorrow's date, passengers: `3`, click **Confirm Booking Request**.
- **Expected Result**: Booking is created with status badge **PENDING APPROVAL** and visible in **My Bookings**.
- **What to Say**:
  > *"Customers can book private cars, vans, or buses with estimated distances and upfront transparency, which immediately sends an actionable request to fleet operations."*

---

### ⏱️ Minute 3:00 - 4:45 | Fleet Manager Approval & Dispatch Center
- **Actor / Screen**: Switch to Fleet Manager `manager@fleetflow.com`.
- **What to Click**:
  1. Go to **Approvals** (`/manager/approvals` or `/manager/bookings`). Click on Customer 1's pending booking. Click **Approve Booking**.
  2. Go to **Dispatch Center** (`/manager/assignments`). Select Customer 1's booking from the ticket queue.
  3. The system checks real availability (active status, no overlapping trip, valid documents, adequate seating). Select an available vehicle and driver. Click **Dispatch Trip**.
  4. View live route & GPS monitoring at **Trip Monitoring** (`/manager/trips`).
- **Expected Result**: Booking updates to **APPROVED** and an active Trip is generated with status **SCHEDULED**.
- **What to Say**:
  > *"Fleet managers maintain full operational oversight in the Dispatch Center, verifying vehicle maintenance readiness and driver availability before authorizing trip dispatches."*

---

### ⏱️ Minute 4:45 - 6:30 | Driver Mobile Experience & Trip Execution
- **Actor / Screen**: Switch to Driver `driver1@fleetflow.com` (Simulated Mobile Screen or Phone-width View).
- **What to Click**:
  1. Open Driver Dashboard (`/driver/dashboard`). Click **Start Trip** on the scheduled trip.
  2. Enter starting odometer reading: `15400`. Tap **Confirm Start**.
  3. Trip transitions to `IN_PROGRESS`. Location sharing broadcasts GPS coordinates.
  4. Tap **Complete Trip**, enter ending odometer: `15442`.
- **Expected Result**: System automatically computes 42 km traversed, updates vehicle odometer, and calculates total fare (e.g., ₹756.00).
- **What to Say**:
  > *"Our touch-friendly mobile driver portal guarantees accountability with odometer verification and effortless live GPS coordinate broadcasting."*

---

### ⏱️ Minute 6:30 - 8:00 | Live Tracking, UPI Payment & Driver Confirmation
- **Actor / Screen**:
  1. Customer tab (`customer1@fleetflow.com`): Open **My Bookings** -> Click **Pay Now** (`/customer/payments/:id/pay`).
  2. Review dynamic UPI QR code. Enter UTR reference: `UTR987654321012`. Click **Submit Payment Proof**.
  3. Switch to Driver tab: Driver taps **Confirm Payment**.
  4. Switch back to Customer: Page updates to **PAID**. Click **Download Receipt PDF**.
- **Expected Result**: Status changes to PAID; ReportLab PDF receipt downloads with company branding, tax breakdown, and QR verification stamp.
- **What to Say**:
  > *"Customers settle payments seamlessly using standard Indian UPI apps, while drivers verify transactions immediately to close the trip loop."*

---

### ⏱️ Minute 8:00 - 9:30 | Intercity Bus Scheduling & Automated 10-Hour Rule
- **Actor / Screen**: Fleet Manager / Admin (`manager@fleetflow.com`).
- **What to Click**:
  1. Go to **Bus Schedules** (`/fleet/bus-schedules`). View scheduled departures and passenger load factor.
  2. Explain the automated 10-hour rule: If passenger bookings do not meet the minimum threshold (10 seats) 10 hours before departure, the background job automatically cancels the trip.
  3. Show Customer notification options: Passenger receives instant alert with 3 choices: Alternative Vehicle, Reschedule, or Refund.
- **What to Say**:
  > *"FleetFlow safeguards profitability through intelligent scheduled jobs that automatically cancel under-subscribed intercity buses and offer customers immediate rebooking or refunds."*

---

### ⏱️ Minute 9:30 - 11:00 | Admin Governance, Analytics & Reports
- **Actor / Screen**: System Admin `admin@fleetflow.com`.
- **What to Click**:
  1. Navigate to **Admin Dashboard** (`/admin/dashboard`): Inspect fleet overview cards, trip breakdown, and total revenue.
  2. Navigate to **Reports** (`/admin/reports`): Click **Export Trips CSV** and **Export Financials CSV**.
  3. Navigate to **Payment QR Settings**: Show customizable global UPI ID and QR image upload.
- **Expected Result**: Financial metrics update live; clean CSV files download with timestamps.
- **What to Say**:
  > *"Administrators possess complete organizational governance, including revenue oversight, custom payment gateway configurations, and one-click compliance CSV reporting."*

---

### ⏱️ Minute 11:00 - 12:00 | Summary & Q&A
- **What to Say**:
  > *"In summary, FleetFlow delivers a modern, resilient, role-secured platform built on Django REST Framework and React, complete with scheduled background automations and offline UPI reconciliation."*
