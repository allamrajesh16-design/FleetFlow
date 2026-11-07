# ==============================================================================
# FleetFlow Database & Private Media Backup Script (backup_db.ps1)
# ==============================================================================
[CmdletBinding()]
param (
    [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

if (-not $BackupDir) {
    $BackupDir = Join-Path $RootDir "backups"
}

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

# 1. Resolve PostgreSQL binaries (check PATH then standard Program Files)
$PgDump = Get-Command "pg_dump" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
if (-not $PgDump) {
    $Candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue
    if ($Candidates) {
        $PgDump = $Candidates[-1].FullName
    }
}

if (-not $PgDump -or -not (Test-Path $PgDump)) {
    Write-Error "CRITICAL: pg_dump utility not found in PATH or standard PostgreSQL directories."
    exit 1
}

# 2. Extract database connection parameters without printing secrets
$EnvFile = Join-Path $RootDir "backend\.env"
$DbName = if ($env:DB_NAME) { $env:DB_NAME } else { "fleetflow_db" }
$DbUser = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$DbHost = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$DbPass = $env:DB_PASSWORD

if (-not $DbPass -and (Test-Path $EnvFile)) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -match "^DB_PASSWORD=(.*)$") { $DbPass = $matches[1].Trim('"').Trim("'") }
        if ($line -match "^DB_NAME=(.*)$" -and -not $env:DB_NAME) { $DbName = $matches[1].Trim('"').Trim("'") }
        if ($line -match "^DB_USER=(.*)$" -and -not $env:DB_USER) { $DbUser = $matches[1].Trim('"').Trim("'") }
        if ($line -match "^DB_HOST=(.*)$" -and -not $env:DB_HOST) { $DbHost = $matches[1].Trim('"').Trim("'") }
        if ($line -match "^DB_PORT=(.*)$" -and -not $env:DB_PORT) { $DbPort = $matches[1].Trim('"').Trim("'") }
    }
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$DumpFile = Join-Path $BackupDir "fleetflow_backup_$Timestamp.sql"
$MediaBackupDir = Join-Path $BackupDir "private_media_$Timestamp"
$PrivateMediaSrc = Join-Path $RootDir "backend\private_media"

Write-Host "================================================================================"
Write-Host " FLEETFLOW DATABASE & PRIVATE MEDIA BACKUP"
Write-Host "================================================================================"
Write-Host "Timestamp:    $Timestamp"
Write-Host "Database:     $DbName"
Write-Host "Host:Port:    ${DbHost}:${DbPort}"
Write-Host "User:         $DbUser"
Write-Host "Target SQL:   $DumpFile"

# 3. Execute pg_dump with PGPASSWORD environment variable (never printed)
$env:PGPASSWORD = $DbPass
try {
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & "$PgDump" -h $DbHost -p $DbPort -U $DbUser -d $DbName -f "$DumpFile" 2>$null
    $ErrorActionPreference = $prevEAP

    if (Test-Path $DumpFile) {
        $DumpSize = (Get-Item $DumpFile).Length
        Write-Host "SUCCESS: Database dump created successfully ($DumpSize bytes)."
    } else {
        Write-Error "Failed to generate database dump file."
        exit 1
    }
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# 4. Copy private_media folder
if (Test-Path $PrivateMediaSrc) {
    Copy-Item -Path $PrivateMediaSrc -Destination $MediaBackupDir -Recurse -Force
    $MediaFilesCount = (Get-ChildItem -Path $MediaBackupDir -Recurse -File | Measure-Object).Count
    Write-Host "SUCCESS: Private media folder backed up ($MediaFilesCount files) to $MediaBackupDir"
} else {
    Write-Host "NOTE: Private media directory not found at $PrivateMediaSrc; skipped."
}

# 5. Rotate backups: Keep only the 7 most recent backups
$AllSqlBackups = Get-ChildItem -Path $BackupDir -Filter "fleetflow_backup_*.sql" | Sort-Object CreationTime -Descending
if ($AllSqlBackups.Count -gt 7) {
    $ToPrune = $AllSqlBackups | Select-Object -Skip 7
    foreach ($old in $ToPrune) {
        Remove-Item -Path $old.FullName -Force
        Write-Host "Rotated old database backup: $($old.Name)"
    }
}

$AllMediaBackups = Get-ChildItem -Path $BackupDir -Directory -Filter "private_media_*" | Sort-Object CreationTime -Descending
if ($AllMediaBackups.Count -gt 7) {
    $ToPruneMedia = $AllMediaBackups | Select-Object -Skip 7
    foreach ($oldDir in $ToPruneMedia) {
        Remove-Item -Path $oldDir.FullName -Recurse -Force
        Write-Host "Rotated old media backup: $($oldDir.Name)"
    }
}

Write-Host "================================================================================"
Write-Host " BACKUP COMPLETED: Retained $([Math]::Min($AllSqlBackups.Count, 7)) database snapshots."
Write-Host "================================================================================"
exit 0
