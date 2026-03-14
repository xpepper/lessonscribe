from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def probe_duration(audio_path: Path) -> float:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(audio_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    payload = json.loads(result.stdout)
    duration = payload.get("format", {}).get("duration")
    if duration is None:
        raise RuntimeError(f"Unable to determine duration for {audio_path.name}.")
    return float(duration)


def normalize_audio(source_path: Path, normalized_path: Path) -> Path:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        str(normalized_path),
    ]
    subprocess.run(command, capture_output=True, text=True, check=True)
    return normalized_path

