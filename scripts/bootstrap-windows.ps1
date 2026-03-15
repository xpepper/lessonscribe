Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Test-CommandAvailable {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-PythonCommand {
    if (Test-CommandAvailable -Name "py") {
        try {
            & py -3.12 --version *> $null
            if ($LASTEXITCODE -eq 0) {
                return @("py", "-3.12")
            }
        }
        catch {
        }
    }

    if (Test-CommandAvailable -Name "python") {
        $versionText = (& python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))").Trim()
        if ([version]$versionText -ge [version]"3.12.0") {
            return @("python")
        }
    }

    throw "Python 3.12 or newer is required but was not found."
}

function Install-WingetPackageIfMissing {
    param(
        [string]$PackageId,
        [string]$CommandName,
        [string]$DisplayName
    )

    if (Test-CommandAvailable -Name $CommandName) {
        Write-Host "[ok] $DisplayName is already available."
        return
    }

    Write-Host "[install] $DisplayName via winget ($PackageId)"
    & winget install --id $PackageId --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed while installing $DisplayName."
    }

    Refresh-ProcessPath

    if (-not (Test-CommandAvailable -Name $CommandName)) {
        throw "$DisplayName still is not available after installation. Open a new PowerShell window and re-run this script."
    }
}

function Install-PythonIfMissing {
    try {
        $null = Get-PythonCommand
        Write-Host "[ok] Python 3.12 or newer is already available."
        return
    }
    catch {
    }

    Write-Host "[install] Python 3.12 via winget (Python.Python.3.12)"
    & winget install --id "Python.Python.3.12" --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed while installing Python 3.12."
    }

    Refresh-ProcessPath

    try {
        $null = Get-PythonCommand
    }
    catch {
        throw "Python 3.12 or newer still is not available after installation. Open a new PowerShell window and re-run this script."
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Command,
        [string]$WorkingDirectory
    )

    $commandName = $Command[0]
    $commandArgs = @()
    if ($Command.Length -gt 1) {
        $commandArgs = $Command[1..($Command.Length - 1)]
    }

    if ($WorkingDirectory) {
        Push-Location $WorkingDirectory
    }

    try {
        & $commandName @commandArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed: $($Command -join ' ')"
        }
    }
    finally {
        if ($WorkingDirectory) {
            Pop-Location
        }
    }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$BackendPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

Write-Step "Checking for winget"
if (-not (Test-CommandAvailable -Name "winget")) {
    throw "winget is required for Windows bootstrap. Install App Installer from Microsoft and re-run this script."
}

Write-Step "Installing or verifying system dependencies"
Install-WingetPackageIfMissing -PackageId "Git.Git" -CommandName "git" -DisplayName "Git"
Install-PythonIfMissing
Install-WingetPackageIfMissing -PackageId "OpenJS.NodeJS.LTS" -CommandName "node" -DisplayName "Node.js LTS"
Install-WingetPackageIfMissing -PackageId "Gyan.FFmpeg" -CommandName "ffmpeg" -DisplayName "FFmpeg"

Write-Step "Selecting Python"
$PythonCommand = Get-PythonCommand
Write-Host "[ok] Using $($PythonCommand -join ' ')"

Write-Step "Creating backend virtual environment"
Invoke-Checked -Command ($PythonCommand + @("-m", "venv", ".venv")) -WorkingDirectory $BackendDir

Write-Step "Installing backend dependencies"
Invoke-Checked -Command @($BackendPython, "-m", "pip", "install", "--upgrade", "pip") -WorkingDirectory $BackendDir
Invoke-Checked -Command @($BackendPython, "-m", "pip", "install", "-e", ".[dev]") -WorkingDirectory $BackendDir

Write-Step "Installing frontend dependencies"
Invoke-Checked -Command @("npm.cmd", "install") -WorkingDirectory $FrontendDir

Write-Step "Running backend doctor"
Invoke-Checked -Command @($BackendPython, "-m", "app.doctor") -WorkingDirectory $BackendDir

Write-Host ""
Write-Host "Bootstrap complete." -ForegroundColor Green
Write-Host "Daily startup command:"
Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1"
