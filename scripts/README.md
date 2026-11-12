# FleetFlow Scripts Catalog

This directory contains automated verification, testing, crawling, deployment assistance, database operations, and environment audit scripts for the FleetFlow platform.

---

## 1. Full Verification & CI/CD Suite

- **`test_all.ps1`**: Master PowerShell test runner. Executes backend tests, frontend tests, builds, linting, secret audits, and end-to-end smoke verification.
- **`e2e_smoke_test.py`**: Python end-to-end test verifying the full customer-to-driver workflow (registration, vehicle booking, approval, assignment, odometer start, complete, QR payment, receipt download).
- **`crawl_all.js`**: Comprehensive Puppeteer crawler. Navigates every route across all 4 roles (**ADMIN**, **FLEET_MANAGER**, **DRIVER**, **CUSTOMER**, and **PUBLIC**) at both Desktop (1366px) and Mobile (360px) viewports, asserting zero console errors, zero 4xx/5xx network failures, zero unhandled rejections, and zero horizontal overflows.
- **`scan_secrets.py`**: Security scanner searching for sensitive tokens, hardcoded private keys, passwords, and leaked credentials across the codebase.
- **`check_axe.js`**: Automated accessibility evaluation runner using Axe-Core for WCAG 2.1 AA compliance.

---

## 2. Database Backup & Disaster Recovery

- **`backup_db.ps1`**: Executes `pg_dump` targeting PostgreSQL, securely pulls credentials from `.env` without printing secrets, backs up uploaded `private_media/`, and enforces automatic retention rotation (keeping the 7 most recent backups).
- **`restore_db.ps1`**: Restores database dumps and private media files using `pg_restore`/`psql`.
- **`test_backup_restore.ps1`**: Automated drill verifying that `backup_db.ps1` and `restore_db.ps1` produce a valid, round-trip restorable database snapshot.

---

## 3. Scope & Visual Regression Verification

- **`scope_guard.js`**: Captures SHA-256 snapshots of backend and frontend source trees, detects accidental file changes outside designated scopes, and runs pixel-by-pixel visual diffs (under 0.5% threshold) using headless browser screenshots.
- **`verify_responsive_matrix.js`**: Tests all layouts across the responsive breakpoint matrix (Phone: 320px, 360px, 414px; Tablet: 768px, 1024px; Laptop/Desktop: 1280px, 1366px, 1440px, 1920px).
- **`check_driver_widths.js`**: Verifies driver portal responsiveness and layout integrity at narrow viewport widths.

---

## 4. Local Development & Demo Utilities

- **`serve_spa.js`**: Fast, lightweight Node.js HTTP server hosting the compiled production React single-page application (`frontend/build/`) with clean SPA route fallbacks to `index.html`.
- **`prepare_monitor_demo_data.py`**: Seeds real-time telemetry coordinates, active trips, and geocoded locations for live map demonstration.

