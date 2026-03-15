# LessonScribe

LessonScribe is a local web application for transcribing recorded lectures with OpenAI Whisper and reading the transcript in sync with audio playback.

This repository contains source code, not a packaged installer yet. To use the app today, you run a local backend and a local frontend on your computer.

## Stack

- `frontend/`: React + TypeScript + Vite
- `backend/`: FastAPI + local Whisper + FFmpeg
- `data/`: app-managed lecture storage, ignored by git

## Features In v1

- Upload `mp3`, `m4a`, or `wav` lecture recordings
- Run Whisper locally with selectable models: `turbo`, `base`, `large-v3`
- Automatically use hardware acceleration when PyTorch exposes it:
  - `cuda` for NVIDIA GPUs
  - `mps` for Apple Silicon
  - `cpu` otherwise
- Persist imported audio and transcript artifacts locally
- Display segment and word timestamps
- Highlight the active segment and current word during playback
- Click a segment or word to jump the audio player

## Quick Start

### Windows PowerShell

For a clean Windows 10 or Windows 11 setup, follow these steps:

```powershell
winget install --id Git.Git --exact --accept-package-agreements --accept-source-agreements
git clone <your-repo-url>
cd lessonscribe
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
```

Notes:

- install Git first so you can clone the repository and access the bootstrap script
- `bootstrap-windows.ps1` is the one-time setup path for Windows 10 and Windows 11 source installs
- `start-windows.ps1` is the day-to-day command after setup
- the start script opens backend and frontend logs in separate PowerShell windows and then opens the app in your browser

### macOS

If your dependencies are already installed, the shortest path is:

```bash
make dev
```

Then:

1. Open the frontend URL shown in the terminal, usually `http://127.0.0.1:5173`
2. Upload an `mp3`, `m4a`, or `wav` lecture
3. Pick a Whisper model and click `Transcribe`

`make dev` starts both the backend on port `8000` and the frontend on port `5173` in one terminal. Press `Ctrl+C` to stop both.

## Install From Scratch

### macOS

1. Install Homebrew if you do not already have it:

   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. Install Python:

   ```bash
   brew install python@3.12
   ```

3. Install Node.js:

   ```bash
   brew install node
   ```

4. Install FFmpeg:

   ```bash
   brew install ffmpeg
   ```

5. Verify the tools are available:

   ```bash
   python3 --version
   node --version
   npm --version
   ffmpeg -version
   ```

### Windows

The recommended Windows path is to let the repository bootstrap itself with `winget`.

1. Make sure `winget` is available:

   ```powershell
   winget --version
   ```

2. Install Git if you do not already have it:

   ```powershell
   winget install --id Git.Git --exact --accept-package-agreements --accept-source-agreements
   ```

3. Clone the repository:

   ```powershell
   git clone <your-repo-url>
   cd lessonscribe
   ```

4. Run the one-time bootstrap script:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1
   ```

5. Start the app:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
   ```

The bootstrap script installs or verifies:

- Python 3.12
- Node.js LTS
- FFmpeg
- backend Python dependencies
- frontend npm dependencies

After that, the day-to-day command is:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
```

If you prefer a fully manual setup, use the advanced backend and frontend sections below instead.

## Get The Project

### macOS

```bash
git clone <your-repo-url>
cd lessonscribe
```

If you already have the repository on disk, just open a terminal in the project folder.

## Daily Startup

### Windows PowerShell

After bootstrap completes, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
```

### macOS

```bash
make dev
```

Useful alternatives on macOS or other Unix-like shells:

```bash
make backend
make frontend
```

Use the separate targets if you want to run only one service.

## Backend Setup

The backend runs FastAPI, FFmpeg, and local Whisper transcription.

If you want the shortest day-to-day command after setup, use `start-windows.ps1` on Windows or `make dev` on macOS instead of starting the backend and frontend manually.

### macOS

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

### Windows PowerShell

```powershell
cd backend
py -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
# Optional but recommended for NVIDIA GPUs: install a CUDA-enabled PyTorch build first
# using the official PyTorch install selector for your CUDA version.
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

If you want a quick setup check without starting the server:

```powershell
.\.venv\Scripts\python.exe -m app.doctor
```

### Hardware Acceleration Notes

- LessonScribe selects the best available PyTorch device in this order: `cuda`, then `mps`, then `cpu`.
- Windows users with an NVIDIA GPU need a CUDA-enabled PyTorch build in the backend virtual environment. If PyTorch only reports CPU support, LessonScribe will also run on CPU.
- Apple Silicon users can benefit from PyTorch's `mps` backend when it is available in the backend environment.
- The app shows the selected runtime device in the top-right status card.

## Frontend Setup

The frontend is the local web UI.

### macOS

```bash
cd frontend
npm install
npm run dev
```

### Windows PowerShell

```powershell
cd frontend
npm install
npm run dev
```

The Vite dev server proxies API traffic to `http://localhost:8000`, so the backend should already be running first.

If you use `start-windows.ps1` on Windows or `make dev` on macOS, the backend and frontend start together and you can skip the separate startup steps below.

## Open The App

Once both servers are running:

1. Look at the frontend terminal output
2. Open the local URL it prints, usually `http://127.0.0.1:5173`
3. Check that the top-right status says:
   - `Ready`
   - `FFmpeg found`
   - `Whisper installed`
   - `Device CUDA`, `Device MPS`, or `Device CPU`

If the status says `Setup needed`, one of the local dependencies is missing or not available on `PATH`.

## First Transcription

1. Click `Upload audio`
2. Choose a lecture recording
3. Select a model
   - `turbo`: faster
   - `base`: balanced
   - `large-v3`: slower but usually more accurate
4. Click `Transcribe`
5. Wait for the job to finish
6. Press `Play`
7. Click a segment or word in the transcript to jump playback

## Running Tests

Backend:

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. pytest
```

Frontend:

```bash
cd frontend
npm test -- --run
```

## Quick Smoke Test

For a backend-only check, run the smoke test against a generated local sample clip:

```bash
python3 scripts/smoke_test_small_example.py
```

Optional overrides:

```bash
python3 scripts/smoke_test_small_example.py --model turbo
python3 scripts/smoke_test_small_example.py --text "This is a custom generated sample for Whisper."
python3 scripts/smoke_test_small_example.py --audio path/to/clip.m4a
python3 scripts/smoke_test_small_example.py --base-url http://127.0.0.1:8000
```

The script uploads the generated clip or the clip you pass with `--audio`, starts transcription, polls job status, fetches the transcript, and exits non-zero if import/transcription/transcript retrieval fails or if segment/word timestamps are missing.

## Troubleshooting

- `ffmpeg` not found:
  - macOS: install it with Homebrew
  - Windows: rerun `powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1`
- `Whisper` or backend dependencies missing:
  - Windows: run `.\.venv\Scripts\python.exe -m app.doctor` from `backend/`
  - rerun `pip install -e ".[dev]"`
- GPU or Apple Silicon acceleration not being used:
  - check the top-right status card
  - if it says `Device CPU`, verify that the backend virtual environment has a PyTorch build with support for your hardware
- Frontend cannot reach backend:
  - make sure the backend terminal is still running on port `8000`
- Very slow transcription:
  - use `turbo` for faster tests
  - use the generated smoke-test clip or pass a short clip with `--audio`
- generated smoke-test audio not working:
  - macOS requires `say` and `ffmpeg`
  - Windows requires PowerShell speech synthesis
  - Linux requires `espeak`
  - if local generation is unavailable, pass your own file with `--audio`
- Poor transcript quality:
  - try `large-v3`
  - make sure the recording is clear and the spoken language matches what Whisper can detect well

## Data Layout

Each imported lecture is stored under `data/lectures/<lecture-id>/` with:

- `source.<ext>`
- `normalized.wav`
- `transcript.json`
- `metadata.json`

Job state is stored under `data/jobs/`, and app-managed Whisper model markers live under `data/models/`.

## Future Roadmap

Planned follow-up features are tracked in [future-features-plan.md](docs/future-features-plan.md).
