Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-PathExists {
    param([string]$PathValue, [string]$FailureMessage)
    if (-not (Test-Path $PathValue)) {
        throw $FailureMessage
    }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$BackendPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
$FrontendModules = Join-Path $FrontendDir "node_modules"
$ShellPath = (Get-Process -Id $PID).Path
$FrontendUrl = "http://127.0.0.1:5173"

Write-Step "Checking bootstrap output"
Test-PathExists -PathValue $BackendPython -FailureMessage "Missing backend virtual environment. Run powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 first."
Test-PathExists -PathValue $FrontendModules -FailureMessage "Missing frontend dependencies. Run powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 first."

Write-Step "Starting backend"
$BackendCommand = "& '$BackendPython' -m uvicorn app.main:app --reload --port 8000"
Start-Process -FilePath $ShellPath -WorkingDirectory $BackendDir -ArgumentList @("-NoExit", "-Command", $BackendCommand) | Out-Null

Write-Step "Starting frontend"
$FrontendCommand = "npm.cmd run dev"
Start-Process -FilePath $ShellPath -WorkingDirectory $FrontendDir -ArgumentList @("-NoExit", "-Command", $FrontendCommand) | Out-Null

Write-Step "Waiting for the frontend"
$frontendReady = $false
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    try {
        Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
        $frontendReady = $true
        break
    }
    catch {
    }
}

if ($frontendReady) {
    Write-Host "[ok] Opening $FrontendUrl"
    Start-Process $FrontendUrl | Out-Null
}
else {
    Write-Warning "Frontend did not become reachable within 60 seconds. Check the opened backend and frontend windows."
}

Write-Host ""
Write-Host "LessonScribe is starting in separate PowerShell windows." -ForegroundColor Green
Write-Host "Close those windows when you want to stop the app."
