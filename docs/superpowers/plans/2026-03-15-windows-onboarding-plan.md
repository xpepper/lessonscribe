# Windows Onboarding Implementation Plan

Date: 2026-03-15
Spec: `docs/superpowers/specs/2026-03-15-windows-onboarding-design.md`
Scope: Implement the first Windows onboarding slice with script-based setup and startup.

## End State

LessonScribe offers a Windows-first source workflow where:

- one bootstrap PowerShell script installs prerequisites and project dependencies
- one startup PowerShell script launches the app for day-to-day use
- the backend exposes a doctor command for preflight validation
- the README documents the Windows script workflow first

## Delivery Strategy

This work can be delivered as a small vertical slice:

1. add a backend doctor command that exposes preflight status
2. add a Windows bootstrap script that consumes it
3. add a Windows start script for daily use
4. update the README around the new workflow
5. run verification

## Phase 1: Backend Doctor

### Step 1. Add `python -m app.doctor`

Type: Earning
Goal: Provide a stable preflight command for scripts and manual troubleshooting.

Tasks:

- add a small module under `backend/app`
- reuse existing FFmpeg and Whisper/device checks
- ensure settings directories can be created
- print a compact summary and return non-zero on hard setup failures

Done when:

- the command can run from the backend virtual environment
- missing FFmpeg or missing Whisper dependencies produce a failing exit code

## Phase 2: Bootstrap Script

### Step 2. Add `scripts/bootstrap-windows.ps1`

Type: Earning
Goal: Collapse one-time Windows setup into one documented command.

Tasks:

- verify `winget` exists
- install or verify Git, Python 3.12, Node LTS, and FFmpeg
- create `backend/.venv`
- install backend dependencies
- install frontend dependencies
- call the doctor command and print the result

Done when:

- the script is readable, idempotent enough for retries, and self-contained
- a user does not need to activate the backend virtual environment manually

## Phase 3: Daily Startup Script

### Step 3. Add `scripts/start-windows.ps1`

Type: Earning
Goal: Make daily app startup a single Windows-friendly command.

Tasks:

- verify bootstrap output exists
- open backend and frontend in PowerShell windows
- wait briefly for the frontend URL
- open the app in the default browser

Done when:

- users can start the app from the repository root with one PowerShell command
- logs remain visible without extra tools

## Phase 4: Documentation

### Step 4. Update the README

Type: Earning
Goal: Make the script-based Windows path the primary documented flow.

Tasks:

- add a Windows quick-start section near the top
- replace manual FFmpeg `PATH` editing in the primary path
- keep manual backend/frontend startup as fallback documentation
- explain the new bootstrap and start commands clearly

Done when:

- the README reflects the scripts as the recommended Windows path
- Windows users are not told to use `make dev` as their main entry point

## Phase 5: Verification

### Step 5. Run checks and review the scripts

Type: Earning
Goal: Avoid claiming completion without evidence.

Tasks:

- run backend tests
- run frontend tests
- run the frontend build
- review PowerShell syntax and command paths carefully

Suggested commands:

- `cd backend && pytest`
- `cd frontend && npm test -- --run`
- `cd frontend && npm run build`

Done when:

- automated checks pass
- the new scripts are consistent with the repository layout

## Notes for Implementation

- Prefer direct executable paths over shell activation in PowerShell.
- Keep Windows-specific assumptions confined to the PowerShell scripts and README.
- Do not rewrite the existing Make workflow; keep it for macOS and developer use.
