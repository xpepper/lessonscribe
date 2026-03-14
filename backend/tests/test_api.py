from __future__ import annotations

import time
import wave
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.schemas import TranscriptPayload
from app.transcription import WhisperService


class FakeWhisperService(WhisperService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self._available: set[str] = {"turbo"}

    def whisper_installed(self) -> bool:
        return True

    def cuda_available(self) -> bool:
        return False

    def mps_available(self) -> bool:
        return False

    def download_model(self, model_name: str) -> None:
        self._available.add(model_name)
        self._model_marker(model_name).write_text("ready\n")

    def model_available(self, model_name: str) -> bool:
        return model_name in self._available

    def transcribe(self, audio_path: Path, model_name: str):
        self._available.add(model_name)
        return TranscriptPayload.model_validate(
            {
                "text": "ciao mondo",
                "language": "it",
                "segments": [
                    {"id": "segment-0", "start": 0.0, "end": 1.4, "text": "ciao mondo"},
                ],
                "words": [
                    {
                        "id": "segment-0-word-0",
                        "segmentId": "segment-0",
                        "start": 0.0,
                        "end": 0.6,
                        "text": "ciao",
                    },
                    {
                        "id": "segment-0-word-1",
                        "segmentId": "segment-0",
                        "start": 0.7,
                        "end": 1.2,
                        "text": "mondo",
                    },
                ],
            }
        )


def write_test_wav(path: Path) -> None:
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        wav_file.writeframes(b"\x00\x00" * 16000)


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(data_dir=tmp_path / "data")
    app = create_app(settings, transcriber=FakeWhisperService(settings))
    return TestClient(app)


def test_import_rejects_unsupported_file(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.post(
        "/lectures/import",
        files={"file": ("notes.txt", b"nope", "text/plain")},
    )

    assert response.status_code == 400


def test_health_reports_inference_device(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["inference_device"] == "cpu"
    assert payload["cuda_available"] is False
    assert payload["mps_available"] is False


def test_import_copies_audio_into_app_storage(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    audio_path = tmp_path / "sample.wav"
    write_test_wav(audio_path)

    with audio_path.open("rb") as handle:
        response = client.post(
            "/lectures/import",
            files={"file": ("sample.wav", handle, "audio/wav")},
        )

    assert response.status_code == 200
    payload = response.json()
    stored_path = tmp_path / "data" / "lectures" / payload["id"] / payload["stored_filename"]
    assert stored_path.exists()


def test_list_lectures_returns_newest_first(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    first_audio_path = tmp_path / "first.wav"
    second_audio_path = tmp_path / "second.wav"
    write_test_wav(first_audio_path)
    write_test_wav(second_audio_path)

    with first_audio_path.open("rb") as handle:
        first_response = client.post(
            "/lectures/import",
            files={"file": ("first.wav", handle, "audio/wav")},
        )
    time.sleep(0.01)
    with second_audio_path.open("rb") as handle:
        second_response = client.post(
            "/lectures/import",
            files={"file": ("second.wav", handle, "audio/wav")},
        )

    assert first_response.status_code == 200
    assert second_response.status_code == 200

    response = client.get("/lectures")

    assert response.status_code == 200
    payload = response.json()
    assert [lecture["original_filename"] for lecture in payload] == ["second.wav", "first.wav"]
    assert all(lecture["has_transcript"] is False for lecture in payload)


def test_happy_path_import_transcribe_and_fetch_transcript(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    audio_path = tmp_path / "sample.wav"
    write_test_wav(audio_path)

    with audio_path.open("rb") as handle:
        import_response = client.post(
            "/lectures/import",
            files={"file": ("sample.wav", handle, "audio/wav")},
        )

    lecture = import_response.json()
    job_response = client.post(
        f"/lectures/{lecture['id']}/transcribe",
        json={"model": "base"},
    )
    assert job_response.status_code == 200
    job_id = job_response.json()["id"]

    final_status = None
    for _ in range(40):
        final_status = client.get(f"/jobs/{job_id}")
        payload = final_status.json()
        if payload["status"] in {"complete", "failed"}:
            break
        time.sleep(0.05)

    assert final_status is not None
    assert final_status.status_code == 200
    assert final_status.json()["status"] == "complete"

    lecture_response = client.get(f"/lectures/{lecture['id']}")
    assert lecture_response.json()["has_transcript"] is True

    transcript_response = client.get(f"/lectures/{lecture['id']}/transcript")
    assert transcript_response.status_code == 200
    transcript = transcript_response.json()
    assert transcript["segments"][0]["start"] == 0.0
    assert transcript["words"][0]["text"] == "ciao"

    audio_response = client.get(f"/lectures/{lecture['id']}/audio")
    assert audio_response.status_code == 200


def test_list_lectures_includes_transcribed_and_untranscribed_items(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    first_audio_path = tmp_path / "transcribed.wav"
    second_audio_path = tmp_path / "pending.wav"
    write_test_wav(first_audio_path)
    write_test_wav(second_audio_path)

    with first_audio_path.open("rb") as handle:
        first_import_response = client.post(
            "/lectures/import",
            files={"file": ("transcribed.wav", handle, "audio/wav")},
        )
    with second_audio_path.open("rb") as handle:
        second_import_response = client.post(
            "/lectures/import",
            files={"file": ("pending.wav", handle, "audio/wav")},
        )

    lecture = first_import_response.json()
    job_response = client.post(
        f"/lectures/{lecture['id']}/transcribe",
        json={"model": "base"},
    )
    assert job_response.status_code == 200
    job_id = job_response.json()["id"]

    for _ in range(40):
        job = client.get(f"/jobs/{job_id}")
        if job.json()["status"] in {"complete", "failed"}:
            break
        time.sleep(0.05)

    response = client.get("/lectures")

    assert first_import_response.status_code == 200
    assert second_import_response.status_code == 200
    assert response.status_code == 200
    payload = response.json()
    by_name = {lecture["original_filename"]: lecture for lecture in payload}
    assert by_name["transcribed.wav"]["has_transcript"] is True
    assert by_name["pending.wav"]["has_transcript"] is False
