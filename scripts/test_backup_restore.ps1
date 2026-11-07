# ==============================================================================
# FleetFlow Backup & Restore Verification Test (test_backup_restore.ps1)
# Verifies that backup_db.ps1 and restore_db.ps1 work end-to-end by creating
# a temporary database, restoring into it, and asserting row counts match.
# ==============================================================================
[CmdletBinding()]
param ()

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$TempDbName = "fleetflow_restore_test_temp"

Write-Host "================================================================================"
Write-Host " RUNNING DATABASE BACKUP & RESTORE VERIFICATION TEST"
Write-Host "================================================================================"

# 1. Resolve PostgreSQL utilities
$Psql = Get-Command "psql" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
if (-not $Psql) {
    $BinDir = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue
    if ($BinDir) { $Psql = $BinDir[-1].FullName }
}

$EnvFile = Join-Path $RootDir "backend\.env"
$DbUser = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$DbHost = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$SourceDb = if ($env:DB_NAME) { $env:DB_NAME } else { "fleetflow_db" }
$DbPass = $env:DB_PASSWORD

if (-not $DbPass -and (Test-Path $EnvFile)) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -match "^DB_PASSWORD=(.*)$") { $DbPass = $matches[1].Trim('"').Trim("'") }
    }
}

$env:PGPASSWORD = $DbPass

try {
    # 2. Count rows in source database
    Write-Host "[1/5] Counting records in source database '$SourceDb'..."
    $Tables = @("accounts_user", "vehicles_vehicle", "bookings_booking", "trips_trip")
    $SourceCounts = @{}
    foreach ($tbl in $Tables) {
        $cnt = & "$Psql" -h $DbHost -p $DbPort -U $DbUser -d $SourceDb -tAc "SELECT count(*) FROM $tbl;" 2>$null
        $SourceCounts[$tbl] = [int]($cnt.Trim())
        Write-Host "   - $tbl : $($SourceCounts[$tbl]) rows"
    }

    # 3. Trigger backup
    Write-Host "`n[2/5] Creating fresh timestamped backup..."
    $BackupScript = Join-Path $ScriptDir "backup_db.ps1"
    & powershell -ExecutionPolicy Bypass -File "$BackupScript"
    if ($LASTEXITCODE -ne 0) { throw "backup_db.ps1 failed!" }

    $LatestBackup = Get-ChildItem -Path (Join-Path $RootDir "backups") -Filter "fleetflow_backup_*.sql" | Sort-Object CreationTime -Descending | Select-Object -First 1
    Write-Host "   Using backup file: $($LatestBackup.Name)"

    # 4. Prepare clean temporary target database
    Write-Host "`n[3/5] Initializing temporary database '$TempDbName'..."
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & "$Psql" -h $DbHost -p $DbPort -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $TempDbName WITH (FORCE);" 2>$null | Out-Null
    & "$Psql" -h $DbHost -p $DbPort -U $DbUser -d postgres -c "CREATE DATABASE $TempDbName;" 2>$null | Out-Null
    $ErrorActionPreference = $prevEAP

    # 5. Restore into temporary database
    Write-Host "`n[4/5] Restoring backup into '$TempDbName'..."
    $RestoreScript = Join-Path $ScriptDir "restore_db.ps1"
    & powershell -ExecutionPolicy Bypass -File "$RestoreScript" -BackupFile "$($LatestBackup.FullName)" -TargetDb "$TempDbName"
    if ($LASTEXITCODE -ne 0) { throw "restore_db.ps1 failed!" }

    # 6. Verify row counts in restored database
    Write-Host "`n[5/5] Verifying row counts in restored database '$TempDbName'..."
    $AllMatch = $true
    foreach ($tbl in $Tables) {
        $restoredCnt = & "$Psql" -h $DbHost -p $DbPort -U $DbUser -d $TempDbName -tAc "SELECT count(*) FROM $tbl;" 2>$null
        $intRestored = [int]($restoredCnt.Trim())
        $expected = $SourceCounts[$tbl]

        if ($intRestored -eq $expected -and $intRestored -ge 0) {
            Write-Host "   ✅ $tbl : $intRestored / $expected (MATCH)"
        } else {
            Write-Host "   ❌ $tbl : $intRestored / $expected (MISMATCH)"
            $AllMatch = $false
        }
    }

    if (-not $AllMatch) {
        throw "Row count verification failed in restored database!"
    }

    Write-Host "`n================================================================================"
    Write-Host " RESULT: PASS - Full database backup and restore verified successfully!"
    Write-Host "================================================================================"

} finally {
    # Cleanup temporary database
    Write-Host "Cleaning up temporary test database '$TempDbName'..."
    & "$Psql" -h $DbHost -p $DbPort -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $TempDbName WITH (FORCE);" 2>$null | Out-Null
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
exit 0
