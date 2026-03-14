#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_AUDIO = Path(__file__).resolve().parents[1] / "examples" / "small-example.m4a"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import and transcribe the short local sample clip against a running LessonScribe backend."
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="LessonScribe backend base URL.",
    )
    parser.add_argument(
        "--audio",
        default=str(DEFAULT_AUDIO),
        help="Audio clip to upload.",
    )
    parser.add_argument(
        "--model",
        default="base",
        choices=("turbo", "base", "large-v3"),
        help="Whisper model to use for the smoke test.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=180,
        help="Maximum time to wait for transcription completion.",
    )
    return parser.parse_args()


def request_json(
    method: str,
    url: str,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> dict:
    request = urllib.request.Request(url, method=method, data=body, headers=headers or {})
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def multipart_form_data(field_name: str, file_path: Path) -> tuple[bytes, str]:
    boundary = f"lessonscribe-boundary-{int(time.time() * 1000)}"
    mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    file_bytes = file_path.read_bytes()
    chunks = [
        f"--{boundary}\r\n".encode("utf-8"),
        (
            f'Content-Disposition: form-data; name="{field_name}"; filename="{file_path.name}"\r\n'
        ).encode("utf-8"),
        f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"),
        file_bytes,
        b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ]
    return b"".join(chunks), boundary


def main() -> int:
    args = parse_args()
    audio_path = Path(args.audio).expanduser().resolve()
    if not audio_path.exists():
        print(f"Audio file not found: {audio_path}", file=sys.stderr)
        return 1

    base_url = args.base_url.rstrip("/")
    print(f"Using backend: {base_url}")
    print(f"Uploading: {audio_path}")
    print(f"Model: {args.model}")

    try:
        payload, boundary = multipart_form_data("file", audio_path)
        lecture = request_json(
            "POST",
            f"{base_url}/lectures/import",
            body=payload,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        lecture_id = lecture["id"]
        print(f"Imported lecture: {lecture_id}")

        job = request_json(
            "POST",
            f"{base_url}/lectures/{lecture_id}/transcribe",
            body=json.dumps({"model": args.model}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        job_id = job["id"]
        print(f"Started job: {job_id}")

        deadline = time.time() + args.timeout_seconds
        while time.time() < deadline:
            job = request_json("GET", f"{base_url}/jobs/{job_id}")
            status = job["status"]
            print(f"Job status: {status}")
            if status == "complete":
                break
            if status == "failed":
                print(f"Transcription failed: {job.get('error') or job.get('message')}", file=sys.stderr)
                return 1
            time.sleep(2)
        else:
            print("Timed out waiting for transcription completion.", file=sys.stderr)
            return 1

        lecture = request_json("GET", f"{base_url}/lectures/{lecture_id}")
        transcript = request_json("GET", f"{base_url}/lectures/{lecture_id}/transcript")
        print(
            "Transcript summary:",
            json.dumps(
                {
                    "lecture_id": lecture_id,
                    "duration_seconds": lecture["duration_seconds"],
                    "language": transcript.get("language"),
                    "segments": len(transcript.get("segments", [])),
                    "words": len(transcript.get("words", [])),
                    "sample_text": transcript.get("text", "")[:120],
                },
                ensure_ascii=False,
            ),
        )

        if not transcript.get("segments") or not transcript.get("words"):
            print("Transcript is missing segments or words.", file=sys.stderr)
            return 1

        return 0
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code}: {detail}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"Unable to reach backend: {exc.reason}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

