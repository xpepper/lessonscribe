# LessonScribe

LessonScribe is a local web application for transcribing recorded lectures with OpenAI Whisper and reading the transcript in sync with audio playback.

## Stack

- `frontend/`: React + TypeScript + Vite
- `backend/`: FastAPI + local Whisper + FFmpeg
- `data/`: app-managed lecture storage, ignored by git

## Features In v1

- Upload `mp3`, `m4a`, or `wav` lecture recordings
- Run Whisper locally with selectable models: `turbo`, `base`, `large-v3`
- Persist imported audio and transcript artifacts locally
- Display segment and word timestamps
- Highlight the active segment and current word during playback
- Click a segment or word to jump the audio player

## Prerequisites

### macOS

1. Install Python 3.12+
2. Install Node.js 25+
3. Install FFmpeg
   - Homebrew: `brew install ffmpeg`

### Windows

1. Install Python 3.12+
2. Install Node.js 25+
3. Install FFmpeg and ensure `ffmpeg` and `ffprobe` are available on `PATH`

## Backend Setup

```bash
cd /Users/pietrodibello/Documents/workspace/ai/lessonscribe/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

On Windows PowerShell:

```powershell
cd C:\path\to\lessonscribe\backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

## Frontend Setup

```bash
cd /Users/pietrodibello/Documents/workspace/ai/lessonscribe/frontend
npm install
npm run dev
```

The Vite dev server proxies API traffic to `http://localhost:8000`.

## Running Tests

Backend:

```bash
cd /Users/pietrodibello/Documents/workspace/ai/lessonscribe/backend
source .venv/bin/activate
pytest
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

## Data Layout

Each imported lecture is stored under `data/lectures/<lecture-id>/` with:

- `source.<ext>`
- `normalized.wav`
- `transcript.json`
- `metadata.json`

Job state is stored under `data/jobs/`, and app-managed Whisper model markers live under `data/models/`.

