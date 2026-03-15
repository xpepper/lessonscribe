# Windows Onboarding Design

Date: 2026-03-15
Status: Approved for planning and implementation
Scope: Reduce Windows 10 and Windows 11 setup friction for source-based users by replacing manual multi-step startup with a one-time bootstrap script and a daily PowerShell start script.

## Goal

Make the Windows source workflow feel native enough that a user with admin rights can:

- run one documented PowerShell bootstrap command for one-time setup
- run one documented PowerShell start command for day-to-day use
- avoid manual FFmpeg `PATH` edits and repeated backend/frontend startup steps

This slice intentionally optimizes for Windows users running from source rather than a packaged desktop installer.

## Current Baseline

Today the repository asks Windows users to:

- install Git, Python, Node.js, and FFmpeg manually
- add FFmpeg to `PATH` by hand
- create and activate a backend virtual environment
- install backend and frontend dependencies in separate directories
- work around PowerShell execution policy when activation is blocked
- start backend and frontend separately, or use `make dev`

That flow works for developers, but it is not a natural Windows onboarding experience.

## Chosen Approach

Add two Windows-first scripts under [`scripts/`](../../../scripts):

- `bootstrap-windows.ps1` for one-time setup
- `start-windows.ps1` for day-to-day startup

This approach was chosen because it:

- preserves the current architecture
- keeps onboarding changes small and reversible
- delivers a clear Windows entry point without introducing packaging work yet

## User Experience

### One-Time Setup

Windows users should be able to run one PowerShell command from the repository root that:

- verifies `winget` is available
- installs or verifies Git, Python 3.12, Node LTS, and FFmpeg
- creates the backend virtual environment
- installs backend dependencies
- installs frontend dependencies
- runs a preflight check and prints a short summary

### Daily Startup

Windows users should be able to run one PowerShell command from the repository root that:

- verifies the bootstrap output exists
- starts the backend from the virtual environment without activating it in the shell
- starts the frontend in a separate PowerShell window
- opens the app in the browser once the frontend is reachable

The startup path should not require `make`, shell activation, or manual directory changes.

## Implementation Design

### Bootstrap Script

`bootstrap-windows.ps1` should:

- require PowerShell
- install missing system dependencies with `winget`
- fail fast with clear messages when `winget` or an installer command fails
- create `backend/.venv` with Python 3.12 when available
- install backend dependencies with `backend/.venv/Scripts/python.exe -m pip install -e ".[dev]"`
- install frontend dependencies with `npm.cmd install`
- run a backend doctor/preflight command at the end

The script should not rely on shell activation, because that is a common Windows failure mode.

### Start Script

`start-windows.ps1` should:

- verify `backend/.venv/Scripts/python.exe` exists
- verify `frontend/node_modules` exists
- start the backend with the virtualenv Python directly
- start the frontend with `npm.cmd run dev`
- keep the backend and frontend logs visible in their own PowerShell windows
- open `http://127.0.0.1:5173` after the frontend becomes available

Opening separate windows is acceptable in this slice because it keeps logs accessible and avoids adding a Windows-specific process supervisor.

### Backend Doctor

Add a small backend module runnable with:

- `python -m app.doctor`

It should verify:

- `ffmpeg` and `ffprobe` are available
- Whisper imports successfully
- the inferred device is reported
- the app data directories can be created

The output should be concise and automation-friendly so the bootstrap script can use it directly.

## README Changes

Update [README.md](../../../README.md) so that it:

- adds a Windows quick-start section near the top
- makes the PowerShell scripts the primary Windows path
- leaves manual backend/frontend commands as an advanced fallback
- removes the need for manual FFmpeg `PATH` editing in the primary path

## Failure Handling

- If `winget` is unavailable, the bootstrap script should stop and explain that App Installer / `winget` is required.
- If dependency installation fails, the bootstrap script should stop with the exact failing command context.
- If the backend or frontend bootstrap artifacts are missing, the start script should instruct the user to rerun the bootstrap script.
- If the frontend does not come up within a reasonable time, the start script should report that instead of silently waiting forever.

## Testing

This slice should be verified with:

- static review of the PowerShell scripts
- backend tests
- frontend tests
- frontend build

Manual Windows execution is ideal later, but this implementation should still be structured so the logic is auditable from the repository alone.

## Out of Scope

This slice does not include:

- a packaged desktop installer
- bundled FFmpeg binaries in the repository
- Windows-specific UI changes inside the app
- background service management
- auto-update or repair flows

## Follow-Up Direction

If the Windows source-based path proves stable, the next product-level step for non-technical users is a packaged desktop experience that owns process startup, dependency provisioning, and shortcuts.

## Workflow Note

The brainstorming skill calls for a spec-review subagent before planning. That step is intentionally not executed here because the current session instructions do not allow spawning sub-agents unless the user explicitly requests delegated or sub-agent work.
