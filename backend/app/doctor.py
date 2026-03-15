from __future__ import annotations

import sys

from .audio import ffmpeg_available
from .config import Settings
from .transcription import WhisperService


def run() -> int:
    settings = Settings()
    settings.ensure_directories()

    whisper_service = WhisperService(settings)

    checks = {
        "ffmpeg": ffmpeg_available(),
        "whisper": whisper_service.whisper_installed(),
    }
    device = whisper_service.device()

    for name, ok in checks.items():
        status = "OK" if ok else "MISSING"
        print(f"{name}: {status}")
    print(f"device: {device}")
    print(f"data_dir: {settings.data_dir}")

    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(run())
