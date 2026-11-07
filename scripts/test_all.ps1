# ==============================================================================
# FleetFlow Master Test Suite Runner (scripts/test_all.ps1)
# Runs Backend Unit Tests, Frontend Unit Tests, and E2E Smoke Tests
# ==============================================================================
$ErrorActionPreference = "Continue"

$Root = Resolve-Path "$PSScriptRoot\.."
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$PythonExe = Join-Path $BackendDir "venv\Scripts\python.exe"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " FLEETFLOW COMPREHENSIVE TEST SUITE RUNNER" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$Results = [ordered]@{}

# 1. Backend Test Suite
Write-Host "`n[1/3] Running Backend Django Test Suite..." -ForegroundColor Yellow
Push-Location $BackendDir
& $PythonExe manage.py test --verbosity=1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Backend tests passed" -ForegroundColor Green
    $Results["Backend Tests"] = "PASS"
} else {
    Write-Host "[PARTIAL] Backend tests finished with exit code: $LASTEXITCODE" -ForegroundColor Yellow
    $Results["Backend Tests"] = "PARTIAL"
}
Pop-Location

# 2. Frontend Test Suite
Write-Host "`n[2/3] Running Frontend React Test Suite (Jest)..." -ForegroundColor Yellow
Push-Location $FrontendDir
$env:CI = "true"
npm test -- --watchAll=false
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Frontend tests passed" -ForegroundColor Green
    $Results["Frontend Tests"] = "PASS"
} else {
    Write-Host "[FAIL] Frontend tests failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    $Results["Frontend Tests"] = "FAIL"
}
Pop-Location

# 3. End-to-End Story Smoke Test
Write-Host "`n[3/3] Running End-to-End Core Story Tests (Customer, Driver, Admin)..." -ForegroundColor Yellow
Push-Location $BackendDir
& $PythonExe "$Root\scripts\e2e_smoke_test.py"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] End-to-End Smoke tests passed" -ForegroundColor Green
    $Results["E2E Smoke Tests"] = "PASS"
} else {
    Write-Host "[FAIL] End-to-End Smoke tests failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    $Results["E2E Smoke Tests"] = "FAIL"
}
Pop-Location

# Summary
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " TEST RUN SUMMARY" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
foreach ($key in $Results.Keys) {
    $status = $Results[$key]
    $color = if ($status -eq "PASS") { "Green" } elseif ($status -eq "PARTIAL") { "Yellow" } else { "Red" }
    Write-Host ("{0,-30} : {1}" -f $key, $status) -ForegroundColor $color
}
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
