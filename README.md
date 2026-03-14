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

## How To Run The App

1. Start the backend server
2. Start the frontend dev server
3. Open the frontend URL shown in the terminal, usually `http://127.0.0.1:5173`
4. Upload an `mp3`, `m4a`, or `wav` lecture
5. Pick a Whisper model and click `Transcribe`

You need two terminals open while using the app:

- Terminal 1 runs the backend on port `8000`
- Terminal 2 runs the frontend on port `5173`

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

These steps assume a user starting from zero.

1. Install Git for Windows
   - Download and install: [https://git-scm.com/download/win](https://git-scm.com/download/win)
   - Keep the default options during installation

2. Install Python 3.12 or newer
   - Download it from: [https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/)
   - During installation, make sure you check `Add Python to PATH`

3. Install Node.js
   - Download the Windows installer from: [https://nodejs.org/](https://nodejs.org/)
   - The LTS version is fine

4. Install FFmpeg
   - Download a Windows build from: [https://www.gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/)
   - Extract the archive somewhere simple, for example `C:\ffmpeg`
   - Inside that folder you should have a path similar to `C:\ffmpeg\bin`
   - Add that `bin` folder to your Windows `PATH`:
     - Open `Edit the system environment variables`
     - Click `Environment Variables`
     - Under `User variables`, select `Path`, then click `Edit`
     - Click `New`
     - Add the FFmpeg `bin` folder path
     - Confirm with `OK`

5. Open a new PowerShell window and verify everything:

   ```powershell
   py --version
   node --version
   npm --version
   ffmpeg -version
   ```

## Get The Project

### macOS

```bash
git clone <your-repo-url>
cd lessonscribe
```

### Windows PowerShell

```powershell
git clone <your-repo-url>
cd lessonscribe
```

If you already have the repository on disk, just open a terminal in the project folder.

## Backend Setup

The backend runs FastAPI, FFmpeg, and local Whisper transcription.

### macOS

```bash
cd /Users/pietrodibello/Documents/workspace/ai/lessonscribe/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

### Windows PowerShell

```powershell
cd C:\path\to\lessonscribe\backend
py -m venv .venv
.venv\Scripts\Activate.ps1
# Optional but recommended for NVIDIA GPUs: install a CUDA-enabled PyTorch build first
# using the official PyTorch install selector for your CUDA version.
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

If PowerShell blocks the activation script, run this once in the same window:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
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
cd /Users/pietrodibello/Documents/workspace/ai/lessonscribe/frontend
npm install
npm run dev
```

### Windows PowerShell

```powershell
cd C:\path\to\lessonscribe\frontend
npm install
npm run dev
```

The Vite dev server proxies API traffic to `http://localhost:8000`, so the backend should already be running first.

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
cd /Users/pietrodibello/Documents/workspace/ai/lessonscribe/backend
source .venv/bin/activate
PYTHONPATH=. pytest
```

Frontend:

```bash
cd /Users/pietrodibello/Documents/workspace/ai/lessonscribe/frontend
npm test -- --run
```

## Real Lecture Verification

Use the sample audio already present in the repo root:

- [`Lezione-biologia.m4a`](/Users/pietrodibello/Documents/workspace/ai/lessonscribe/Lezione-biologia.m4a)

Run the backend and frontend, upload that file, choose a model, transcribe it, then verify playback sync and click-to-seek in the browser.

## Quick Smoke Test

For a faster backend-only check, use the short sample clip:

- [`small-example.m4a`](/Users/pietrodibello/Documents/workspace/ai/lessonscribe/examples/small-example.m4a)

With the backend already running:

```bash
cd /Users/pietrodibello/Documents/workspace/ai/lessonscribe
python3 scripts/smoke_test_small_example.py
```

Optional overrides:

```bash
python3 scripts/smoke_test_small_example.py --model turbo
python3 scripts/smoke_test_small_example.py --audio /absolute/path/to/clip.m4a
python3 scripts/smoke_test_small_example.py --base-url http://127.0.0.1:8000
```

The script uploads the clip, starts transcription, polls job status, fetches the transcript, and exits non-zero if import/transcription/transcript retrieval fails or if segment/word timestamps are missing.

## Troubleshooting

- `ffmpeg` not found:
  - macOS: install it with Homebrew
  - Windows: make sure the FFmpeg `bin` folder is on `PATH`, then open a new terminal
- `Whisper` or backend dependencies missing:
  - activate the backend virtual environment
  - rerun `pip install -e ".[dev]"`
- GPU or Apple Silicon acceleration not being used:
  - check the top-right status card
  - if it says `Device CPU`, verify that the backend virtual environment has a PyTorch build with support for your hardware
- Frontend cannot reach backend:
  - make sure the backend terminal is still running on port `8000`
- Very slow transcription:
  - use `turbo` for faster tests
  - use the short clip in [`examples/small-example.m4a`](/Users/pietrodibello/Documents/workspace/ai/lessonscribe/examples/small-example.m4a) for quick smoke checks
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

Planned follow-up features are tracked in [future-features-plan.md](/Users/pietrodibello/Documents/workspace/ai/lessonscribe/docs/future-features-plan.md).
