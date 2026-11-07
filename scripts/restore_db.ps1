# ==============================================================================
# FleetFlow Database & Private Media Restore Script (restore_db.ps1)
# ==============================================================================
[CmdletBinding()]
param (
    [string]$BackupFile = "",
    [string]$TargetDb = "",
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$BackupDir = Join-Path $RootDir "backups"

# 1. Resolve PostgreSQL utilities
$Psql = Get-Command "psql" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
$PgRestore = Get-Command "pg_restore" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue

if (-not $Psql -or -not $PgRestore) {
    $BinDir = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin" -ErrorAction SilentlyContinue
    if ($BinDir) {
        $LatestBin = $BinDir[-1].FullName
        if (-not $Psql) { $Psql = Join-Path $LatestBin "psql.exe" }
        if (-not $PgRestore) { $PgRestore = Join-Path $LatestBin "pg_restore.exe" }
    }
}

if (-not (Test-Path $Psql) -or -not (Test-Path $PgRestore)) {
    Write-Error "CRITICAL: PostgreSQL client utilities (psql/pg_restore) not found."
    exit 1
}

# 2. Extract database connection parameters without printing secrets
$EnvFile = Join-Path $RootDir "backend\.env"
$DbUser = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$DbHost = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$DefaultDbName = if ($env:DB_NAME) { $env:DB_NAME } else { "fleetflow_db" }
$DbPass = $env:DB_PASSWORD

if (-not $DbPass -and (Test-Path $EnvFile)) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -match "^DB_PASSWORD=(.*)$") { $DbPass = $matches[1].Trim('"').Trim("'") }
        if ($line -match "^DB_NAME=(.*)$" -and -not $env:DB_NAME) { $DefaultDbName = $matches[1].Trim('"').Trim("'") }
        if ($line -match "^DB_USER=(.*)$" -and -not $env:DB_USER) { $DbUser = $matches[1].Trim('"').Trim("'") }
        if ($line -match "^DB_HOST=(.*)$" -and -not $env:DB_HOST) { $DbHost = $matches[1].Trim('"').Trim("'") }
        if ($line -match "^DB_PORT=(.*)$" -and -not $env:DB_PORT) { $DbPort = $matches[1].Trim('"').Trim("'") }
    }
}

$DestDb = if ($TargetDb) { $TargetDb } else { $DefaultDbName }

# 3. Resolve backup file to restore
if (-not $BackupFile) {
    $Latest = Get-ChildItem -Path $BackupDir -Filter "fleetflow_backup_*.sql" | Sort-Object CreationTime -Descending | Select-Object -First 1
    if (-not $Latest) {
        Write-Error "No backup files found in $BackupDir."
        exit 1
    }
    $BackupFile = $Latest.FullName
}

if (-not (Test-Path $BackupFile)) {
    Write-Error "Specified backup file not found: $BackupFile"
    exit 1
}

Write-Host "================================================================================"
Write-Host " FLEETFLOW DATABASE & PRIVATE MEDIA RESTORE"
Write-Host "================================================================================"
Write-Host "Source Backup: $BackupFile"
Write-Host "Target DB:     $DestDb"
Write-Host "Host:Port:     ${DbHost}:${DbPort}"
Write-Host "User:          $DbUser"

$env:PGPASSWORD = $DbPass
$prevEAP = $ErrorActionPreference
try {
    $ErrorActionPreference = "SilentlyContinue"
    # Check if target database exists; if not, create it
    $dbExists = & "$Psql" -h $DbHost -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DestDb';" 2>$null
    if ($dbExists -and $dbExists.Trim() -ne "1") {
        Write-Host "Target database '$DestDb' does not exist. Creating..."
        & "$Psql" -h $DbHost -p $DbPort -U $DbUser -d postgres -c "CREATE DATABASE $DestDb;" 2>$null | Out-Null
    }

    # Execute restore via psql
    & "$Psql" -h $DbHost -p $DbPort -U $DbUser -d $DestDb -f "$BackupFile" 2>$null | Out-Null
    $ErrorActionPreference = $prevEAP

    Write-Host "SUCCESS: Database restored into '$DestDb'."

    # 4. Restore private_media if folder exists and not restoring into a temp db
    if (-not $TargetDb -or $TargetDb -eq $DefaultDbName) {
        $MatchingMedia = Get-ChildItem -Path $BackupDir -Directory -Filter "private_media_*" | Sort-Object CreationTime -Descending | Select-Object -First 1
        $TargetMedia = Join-Path $RootDir "backend\private_media"
        if ($MatchingMedia -and (Test-Path $MatchingMedia.FullName)) {
            Copy-Item -Path "$($MatchingMedia.FullName)\*" -Destination $TargetMedia -Recurse -Force
            Write-Host "SUCCESS: Restored private media files from $($MatchingMedia.Name)."
        }
    }
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "================================================================================"
Write-Host " RESTORATION COMPLETE"
Write-Host "================================================================================"
exit 0
