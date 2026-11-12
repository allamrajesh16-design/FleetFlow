# ==============================================================================
# FleetFlow Master Test Suite Runner (scripts/test_all.ps1)
# Comprehensive verification across backend, frontend, responsive, security, and E2E
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
Write-Host "`n[1/7] Running Backend Django Test Suite..." -ForegroundColor Yellow
Push-Location $BackendDir
& $PythonExe manage.py test --verbosity=1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Backend tests passed" -ForegroundColor Green
    $Results["Backend Tests"] = "PASS"
} else {
    Write-Host "[FAIL] Backend tests finished with exit code: $LASTEXITCODE" -ForegroundColor Red
    $Results["Backend Tests"] = "FAIL"
}
Pop-Location

# 2. Frontend Test Suite
Write-Host "`n[2/7] Running Frontend React Test Suite (Jest)..." -ForegroundColor Yellow
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

# 3. Production Build Compilation
Write-Host "`n[3/7] Running Production Build Compilation (npm run build)..." -ForegroundColor Yellow
Push-Location $FrontendDir
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Production build compiled with 0 errors" -ForegroundColor Green
    $Results["Production Build"] = "PASS"
} else {
    Write-Host "[FAIL] Production build failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    $Results["Production Build"] = "FAIL"
}
Pop-Location

# 4. Design System & Static Quality Checks
Write-Host "`n[4/7] Running Design System & Accessibility Checks..." -ForegroundColor Yellow
Push-Location $FrontendDir
npm run check:images
$imgExit = $LASTEXITCODE
npm run check:contrast
$contrastExit = $LASTEXITCODE
npm run check:responsive
$respExit = $LASTEXITCODE

if ($imgExit -eq 0 -and $contrastExit -eq 0 -and $respExit -eq 0) {
    Write-Host "[PASS] Images, contrast, and responsive checks passed" -ForegroundColor Green
    $Results["Design & Responsive Checks"] = "PASS"
} else {
    Write-Host "[FAIL] One or more design/accessibility checks failed" -ForegroundColor Red
    $Results["Design & Responsive Checks"] = "FAIL"
}
Pop-Location

# 5. Security & Secrets Scanner
Write-Host "`n[5/7] Running Security & Leaked Secrets Audit..." -ForegroundColor Yellow
Push-Location $BackendDir
& $PythonExe "$Root\scripts\scan_secrets.py"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] 0 leaked secrets or private keys in repository" -ForegroundColor Green
    $Results["Secrets Audit"] = "PASS"
} else {
    Write-Host "[FAIL] Secrets scanner detected issues" -ForegroundColor Red
    $Results["Secrets Audit"] = "FAIL"
}
Pop-Location

# 6. End-to-End Story Smoke Test
Write-Host "`n[6/7] Running End-to-End Core Story Tests (Customer, Driver, Admin)..." -ForegroundColor Yellow
Push-Location $BackendDir
& $PythonExe "$Root\scripts\e2e_smoke_test.py"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] End-to-End Smoke tests passed" -ForegroundColor Green
    $Results["E2E Story Smoke Tests"] = "PASS"
} else {
    Write-Host "[FAIL] End-to-End Smoke tests failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    $Results["E2E Story Smoke Tests"] = "FAIL"
}
Pop-Location

# 7. Comprehensive Browser Route Crawler
Write-Host "`n[7/7] Running Browser Route Crawler (crawl_all.js)..." -ForegroundColor Yellow
Push-Location $Root
node "$Root\scripts\crawl_all.js"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Automated crawl completed with 0 errors across all roles & viewports" -ForegroundColor Green
    $Results["Automated Browser Crawl"] = "PASS"
} else {
    Write-Host "[FAIL] Browser crawl detected issues" -ForegroundColor Red
    $Results["Automated Browser Crawl"] = "FAIL"
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
    Write-Host ("{0,-35} : {1}" -f $key, $status) -ForegroundColor $color
}
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
