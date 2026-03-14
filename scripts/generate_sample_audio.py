#!/usr/bin/env python3
from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


DEFAULT_TEXT = (
    "LessonScribe smoke test. This short clip verifies local import, transcription, "
    "timestamps, and playback synchronization."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a short spoken sample clip for local LessonScribe smoke tests."
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output WAV file path.",
    )
    parser.add_argument(
        "--text",
        default=DEFAULT_TEXT,
        help="Text to synthesize.",
    )
    return parser.parse_args()


def require_command(command: str) -> str:
    resolved = shutil.which(command)
    if not resolved:
        raise RuntimeError(f"Required command not found on PATH: {command}")
    return resolved


def generate_with_macos(text: str, output_path: Path) -> None:
    say_path = require_command("say")
    ffmpeg_path = require_command("ffmpeg")

    with tempfile.TemporaryDirectory(prefix="lessonscribe-tts-") as temp_dir:
        intermediate = Path(temp_dir) / "sample.aiff"
        subprocess.run([say_path, "-o", str(intermediate), text], check=True)
        subprocess.run(
            [
                ffmpeg_path,
                "-y",
                "-i",
                str(intermediate),
                "-ac",
                "1",
                "-ar",
                "16000",
                str(output_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def generate_with_windows(text: str, output_path: Path) -> None:
    powershell = shutil.which("pwsh") or shutil.which("powershell")
    if not powershell:
        raise RuntimeError("PowerShell was not found on PATH.")

    script = f"""
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile('{str(output_path).replace("'", "''")}')
$synth.Speak('{text.replace("'", "''")}')
$synth.Dispose()
"""
    subprocess.run([powershell, "-NoProfile", "-Command", script], check=True)


def generate_with_linux(text: str, output_path: Path) -> None:
    espeak_path = require_command("espeak")
    subprocess.run([espeak_path, "-w", str(output_path), text], check=True)


def generate_sample_audio(output_path: Path, text: str = DEFAULT_TEXT) -> Path:
    output_path = output_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    system = platform.system()
    if system == "Darwin":
        generate_with_macos(text, output_path)
    elif system == "Windows":
        generate_with_windows(text, output_path)
    elif system == "Linux":
        generate_with_linux(text, output_path)
    else:
        raise RuntimeError(f"Unsupported platform for sample audio generation: {system}")

    if not output_path.exists():
        raise RuntimeError(f"Sample audio was not created: {output_path}")

    return output_path


def main() -> int:
    args = parse_args()
    try:
        output_path = generate_sample_audio(Path(args.output), args.text)
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"Generated sample audio: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
