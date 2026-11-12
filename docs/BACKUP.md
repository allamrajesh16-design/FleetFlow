# FleetFlow Backup & Disaster Recovery Guide (`docs/BACKUP.md`)

This document outlines the backup, rotation, and recovery procedures for the FleetFlow PostgreSQL database and private compliance media.

---

## 1. Overview & Strategy

FleetFlow handles mission-critical fleet tracking, driver compliance documentation, payment receipts, and trip reservations. Disaster recovery comprises:
- **Relational Data**: PostgreSQL database containing users, bookings, trips, payments, maintenance logs, and audit entries.
- **Private Compliance Media**: Driver licenses, insurance certificates, PUC documents, and QR payment proof screenshots located in `backend/private_media/`.

Both assets are backed up in synchronization using automated timestamped archives.

---

## 2. Backup Automation (`scripts/backup_db.ps1`)

The backup script generates a point-in-time SQL dump and an exact snapshot of private compliance media.

### Features
1. **Zero Secret Printing**: Reads credentials from the environment (`$env:DB_PASSWORD`) or `backend/.env`. The password is never logged or displayed on screen.
2. **Timestamped Files**: Database dumps are named `fleetflow_backup_yyyyMMdd_HHmmss.sql` and placed in the `backups/` directory.
3. **Automated Retention & Rotation**: Automatically prunes older backups, strictly maintaining the **last 7 database snapshots** and **last 7 media folders**.
4. **Media Synchronization**: Copies all files from `backend/private_media/` into `backups/private_media_yyyyMMdd_HHmmss/`.

### Usage
```powershell
# From project root:
powershell -ExecutionPolicy Bypass -File scripts\backup_db.ps1
```

---

## 3. Restoration Procedure (`scripts/restore_db.ps1`)

The restoration script restores database tables and compliance files into the active or specified database.

### Usage
```powershell
# Restore latest backup into active database
powershell -ExecutionPolicy Bypass -File scripts\restore_db.ps1

# Restore specific snapshot into a target database
powershell -ExecutionPolicy Bypass -File scripts\restore_db.ps1 -BackupFile "backups\fleetflow_backup_20261107_120656.sql" -TargetDb "fleetflow_db"
```

---

## 4. Automated Verification Test (`scripts/test_backup_restore.ps1`)

FleetFlow includes an automated integration test that verifies backup integrity without disrupting live data:
1. Counts records across `accounts_user`, `vehicles_vehicle`, `bookings_booking`, and `trips_trip` in the production database.
2. Generates a fresh backup using `backup_db.ps1`.
3. Creates a temporary test database (`fleetflow_restore_test_temp`).
4. Restores the backup snapshot into the temporary database.
5. Verifies that row counts match 100%.
6. Drops the temporary database.

### Running Verification
```powershell
powershell -ExecutionPolicy Bypass -File scripts\test_backup_restore.ps1
```

---

## 5. Security & Git Isolation

- The `backups/` directory is strictly excluded from Git tracking via `.gitignore`.
- Database dumps and media archives are stored locally or synced to encrypted off-site cloud storage (e.g., AWS S3 with KMS encryption).
- Passwords and database credentials must never be committed to Git.

