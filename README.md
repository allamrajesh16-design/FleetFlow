# FleetFlow - Smart Vehicle Fleet & Trip Management System

[![CI/CD Pipeline](https://github.com/fleetflow/fleetflow/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python Version](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)
[![Node Version](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org/)
[![WCAG 2.1 AA](https://img.shields.io/badge/Accessibility-WCAG%202.1%20AA-success.svg)](scripts/check_axe.js)
[![Test Coverage](https://img.shields.io/badge/Coverage-88%25-brightgreen.svg)](scripts/test_all.ps1)

FleetFlow is an enterprise-grade SaaS vehicle fleet and trip management platform built for transport operators, corporate fleets, drivers, and passengers. It provides end-to-end trip dispatch, real-time GPS tracking, driver license and compliance document lifecycle management, automated intercity bus scheduling with the 10-hour rule, QR code payments with receipt generation, and role-based analytics.

---

## 1. Features by Role

### 👑 System Administrator (Admin)
- **Role & Access Governance**: Review and approve or reject Fleet Manager registrations; activate/deactivate accounts.
- **Fleet-Wide Overview**: High-level metrics (active vehicles, drivers on trips, total revenue, pending approvals).
- **Payment Settings**: Configure company UPI ID and static QR code templates.
- **Financial Controls & Refunds**: Inspect all payment transactions, verify UTR numbers, and process refunds.
- **Reporting**: Export detailed audit logs and datasets (CSV format) for trips, payments, and fleet utilization.

### 🏢 Fleet Manager
- **Driver Verification**: Onboard drivers, inspect licenses and background checks, and approve/reject driver profiles.
- **Fleet Inventory**: Register and update vehicles (Cars, Vans, Buses) with seating capacity, rates per km, and service statuses.
- **Trip Dispatch**: Assign active drivers and vehicles to customer bookings with concurrency locking (`select_for_update`).
- **Intercity Bus Scheduling**: Create fixed-route departures, set passenger seat pricing, and manage capacity.
- **Fuel & Document Approvals**: Review driver-submitted fuel refill logs and vehicle compliance certificates (Insurance, PUC, Permits).

### 🚗 Driver (Mobile-Optimized Portal)
- **Daily Dashboard**: View assigned trips, scheduled departures, and navigation routes.
- **Trip Lifecycle Execution**: Start trips with initial odometer readings, stream live GPS coordinates, and complete trips with ending odometer readings.
- **Digital Payments**: Display static or dynamic QR codes to passengers and confirm cash/UPI payments.
- **Fuel & Document Submissions**: Log fuel purchases (with automated price per liter checks) and upload vehicle compliance documents.

### 👤 Customer (Passenger Portal)
- **Ride Booking**: Book private vehicles (Car, Bike) with instant distance and fare estimates.
- **Bus Seat Reservations**: Reserve seats on scheduled intercity bus departures.
- **Live GPS Tracking**: Monitor driver position and route progress in real time during ongoing trips.
- **Digital UPI Payments**: Scan QR code, pay via any UPI app, enter UTR reference, and upload payment screenshots.
- **PDF Invoices**: Download ReportLab-generated trip receipts with QR verification codes.

---

## 2. Environment Variables Table

### Backend (`backend/.env`)

| Variable Name | Required | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `SECRET_KEY` | **Yes** | *None* | Django cryptographic secret key (min 32 characters). |
| `DEBUG` | **Yes** | `False` | Debug mode (`True` for local development, `False` for production). |
| `DJANGO_SETTINGS_MODULE` | No | `config.settings` | Settings module (`config.settings_prod` for production). |
| `ALLOWED_HOSTS` | **Yes** | `localhost,127.0.0.1` | Comma-separated list of permitted hostnames/IPs. |
| `CORS_ALLOWED_ORIGINS` | **Yes** | `http://localhost:3000` | Permitted cross-origin frontend URLs. |
| `CSRF_TRUSTED_ORIGINS` | No | *Empty* | Trusted origins for HTTPS and reverse proxies. |
| `DB_NAME` | **Yes** | `fleetflow_db` | PostgreSQL database name. |
| `DB_USER` | **Yes** | `postgres` | PostgreSQL username. |
| `DB_PASSWORD` | **Yes** | *None* | PostgreSQL password (fail-fast startup check if empty in prod). |
| `DB_HOST` | **Yes** | `localhost` | PostgreSQL database host address. |
| `DB_PORT` | **Yes** | `5432` | PostgreSQL database port. |
| `JWT_SECRET_KEY` | **Yes** | *None* | Dedicated secret key for signing JWT tokens. |
| `PAYMENT_MODE` | No | `STATIC_QR` | Payment operational mode (`STATIC_QR` or `MOCK_GATEWAY`). |
| `EMAIL_BACKEND` | No | `smtp.EmailBackend` | Django email backend (`smtp`, `console`, or `filebased`). |
| `EMAIL_HOST` | No | `smtp.gmail.com` | SMTP host address. |
| `EMAIL_PORT` | No | `587` | SMTP port number. |
| `EMAIL_HOST_USER` | No | *Empty* | SMTP sender email username. |
| `EMAIL_HOST_PASSWORD` | No | *Empty* | SMTP application-specific password. |
| `DEFAULT_FROM_EMAIL` | No | `FleetFlow <noreply@...>` | Outgoing sender display header. |

### Frontend (`frontend/.env`)

| Variable Name | Required | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `REACT_APP_API_URL` | **Yes** | `http://localhost:8000/api` | Base REST API URL for backend calls. |
| `PORT` | No | `3000` | Port for the React development server. |

---

## 3. Windows Setup & Quickstart

### Prerequisites
- Python 3.12+ installed and added to `PATH`.
- Node.js 18+ and npm installed.
- PostgreSQL 15+ installed and running on port 5432.
- Git installed.

### Step 1: Database Setup
Open PowerShell and create the database:
```powershell
# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE fleetflow_db;"
```

### Step 2: Backend Setup
```powershell
cd C:\Users\RAJESH\Desktop\FleetFlow\backend

# Create and activate Python virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment file
Copy-Item .env.example .env
# Edit .env with your PostgreSQL password and secrets

# Run migrations and seed data
python manage.py migrate
python manage.py check --deploy

# Start backend development server
python manage.py runserver 127.0.0.1:8000
```

### Step 3: Frontend Setup
Open a separate PowerShell window:
```powershell
cd C:\Users\RAJESH\Desktop\FleetFlow\frontend

# Install dependencies
npm install

# Configure environment file
Copy-Item .env.example .env

# Start React development server
npm start
# Opens http://localhost:3000 in your browser
```

---

## 4. Automation & Maintenance Scripts

All operational, test, and backup scripts are in the `scripts/` directory:

| Script Path | Description | How to Run |
| :--- | :--- | :--- |
| `scripts\test_all.ps1` | Runs backend tests, frontend Jest tests, and E2E smoke tests. | `.\scripts\test_all.ps1` |
| `scripts\backup_db.ps1` | Creates timestamped `pg_dump` backups, retains last 7, copies media. | `.\scripts\backup_db.ps1` |
| `scripts\restore_db.ps1` | Restores SQL dump and private media into target database. | `.\scripts\restore_db.ps1 -BackupFile ...` |
| `scripts\test_backup_restore.ps1` | Backs up DB, restores into temp DB, asserts row counts, cleans up. | `.\scripts\test_backup_restore.ps1` |
| `scripts\e2e_smoke_test.py` | Validates Customer booking, Driver trip execution, and Admin approval. | `python scripts\e2e_smoke_test.py` |
| `scripts\scan_secrets.py` | Scans workspace files for leaked passwords, private keys, or API tokens. | `python scripts\scan_secrets.py` |
| `scripts\check_axe.js` | Automated axe-core accessibility audit across 7 core pages. | `node scripts\check_axe.js` |
| `scripts\scope_guard.js` | Enforces visual and code boundary protection before and after changes. | `node scripts\scope_guard.js compare` |

---

## 5. Testing & Code Coverage

FleetFlow maintains a strict testing regime across backend, frontend, and integration layers:

- **Backend Unit & API Tests**: 153 test cases covering permissions, authentication, OTP codes, bookings, trips, payments, and security headers.
  ```powershell
  cd backend; .\venv\Scripts\python.exe manage.py test
  ```
- **Code Coverage**: All core apps exceed the 80% coverage threshold:
  - `accounts`: 85%
  - `bookings`: 88%
  - `payments`: 89%
  - `trips`: 89%
  - **Total Overall**: **88%**
- **Frontend Jest Tests**: 101 tests passing across 14 test suites with zero failures.
  ```powershell
  cd frontend; npm test -- --watchAll=false
  ```
- **Accessibility (axe-core)**: All 7 primary screens pass WCAG 2.1 AA with **0 serious or critical violations**.
  ```powershell
  node scripts\check_axe.js
  ```

---

## 6. Scheduled Background Jobs

FleetFlow contains four automated background routines executed via management commands:

1. **`check_bus_schedules`**: Evaluates intercity bus departures. If a bus reaches its booking deadline (10 hours prior to departure) and has fewer than the required passenger count, the schedule is cancelled, affected passengers receive notifications, and resolution options are offered.
2. **`expire_payment_qr`**: Automatically expires unconfirmed payment transactions exceeding the 10-minute timeout window.
3. **`maintenance_alerts`**: Evaluates vehicle odometer readings against maintenance thresholds and creates alerts.
4. **`document_alerts`**: Analyzes vehicle compliance certificates and driver licenses expiring in 30, 15, 7, or 1 days (and expired), dispatching notifications via deduplicated `AlertLog`.

To run all background jobs continuously in development:
```powershell
cd backend; .\venv\Scripts\python.exe manage.py run_scheduled_jobs
```

---

## 7. How Payments Work

```text
[Customer Books Trip] ──> [Manager Approves & Dispatches Driver] ──> [Driver Starts & Completes Trip]
                                                                                   │
                                                                         (Auto-generates Payment)
                                                                                   ▼
[PDF Receipt Issued] <── [Driver / Admin Confirms UTR] <── [Customer Scans QR & Enters UTR]
```

1. **Trip Completion**: When the driver completes a trip with the final odometer reading, `create_trip_payments(trip)` auto-creates an `UNPAID` payment record.
2. **QR Code Display**: Customer accesses `/payments/{id}/pay-info/` to view the organization UPI ID and static QR code.
3. **UTR Submission**: Customer makes the transfer on Google Pay / PhonePe / Paytm and submits their 12-digit UTR reference via `/payments/{id}/submit-proof/`.
4. **Verification & Audit**: Driver or Fleet Manager checks the incoming transaction on their bank account and clicks **Confirm Payment** via `/payments/{id}/confirm/`.
5. **Receipt Generation**: Status transitions to `PAID`, issuing a unique receipt reference (e.g. `FF-2026-000042`) and generating a downloadable ReportLab PDF invoice.

---

## 8. Troubleshooting Guide

### Port Conflicts
- **Port 8000 (Backend)**: If port 8000 is occupied, find and terminate the process:
  ```powershell
  Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force
  ```
- **Port 3000 (Frontend)**: React prompts to switch to port 3001 automatically, or set `$env:PORT="3001"`.

### CORS Issues
- If API calls fail with `CORS policy: No 'Access-Control-Allow-Origin' header`:
  1. Check `backend/.env` contains `CORS_ALLOWED_ORIGINS=http://localhost:3000`.
  2. Verify no trailing slashes are present in the origin URL.

### Database Connection Failures
- If Django reports `OperationalError: connection to server at "localhost", port 5432 failed`:
  1. Verify PostgreSQL service is running: `Get-Service postgresql*`.
  2. Verify password in `backend/.env` matches your local PostgreSQL installation.

### Email Delivery in Development
- For local testing without an SMTP server, set in `backend/.env`:
  ```ini
  EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
  ```
  All registration OTPs and password reset codes will print directly to the backend terminal log.

---

## 9. Email Verification: What Can and Cannot Be Checked

When a user signs up on FleetFlow, the registration system performs real-time automated validation on the email address:

### What CAN be checked:
- **Syntax & Normalization**: Standard ASCII characters, exactly one `@`, valid domain labels, length limits (<= 64 for local part, <= 254 total).
- **Provider Rules**: Enforces Gmail rules (6-30 characters, only letters, digits, and dots, no leading/trailing or consecutive dots) and Yahoo rules (4-32 characters, starts with a letter).
- **Dummy Pattern Detection**: Rejects dummy addresses including characters repeated 4+ times, <= 2 unique characters on length >= 6, keyboard/sequential runs (`qwerty`, `123456`, `asdfgh`), Shannon entropy < 1.6 on length >= 8, and dummy dictionary words (`test`, `demo`, `dummy`, `user`, etc.).
- **Domain Verification**: Blocks disposable domains (250+ domains in `backend/accounts/data/disposable_domains.txt`), reserved/test domains (`example.com`, `test.com`, `.local`, `.test`), and domains lacking MX or A records.
- **Typo Suggestions**: Automatically flags typos within edit distance <= 2 for popular domains (`gmial.com`, `hotmial.com`, `outlok.com`) and offers a one-click button to fix the address.

### What CANNOT be checked programmatically:
- **Individual Mailbox Existence**: A server cannot verify whether a specific mailbox exists at a provider like Google or Yahoo without actually sending an email. Most mail providers disable SMTP `VRFY` and catch-all probes to prevent spam harvesting.
- **Spam Filtering & Inbox Placement**: Server-side checks cannot determine if a mail provider's anti-spam engine will deliver to inbox vs spam.

### The OTP is the Final Proof:
Because a program cannot confirm a mailbox exists without sending mail, FleetFlow relies on the **6-digit OTP as the final proof** of email ownership:
- An account is completely unusable until the email OTP is entered and verified.
- Unverified sign-ups older than 24 hours are automatically cleaned up (`python manage.py purge_unverified`).
- Re-registering with an unverified email replaces the pending record with fresh credentials and OTP, ensuring real owners are never locked out by accidental typos.

---

## 10. Documentation Links

- [30 Essentials Master Checklist](docs/ESSENTIALS_CHECKLIST.md)
- [Database Backup & Restore Guide](docs/BACKUP.md)
- [Production Deployment Guide (Docker, VPS, Cloud)](docs/DEPLOYMENT.md)
- [Complete API Endpoints Reference](docs/API_ENDPOINTS.md)
- [OpenAPI 3.0 Specification (YAML)](docs/openapi.yaml)
- [Contributing Guidelines](CONTRIBUTING.md)
- [License (MIT)](LICENSE)
