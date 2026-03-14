from __future__ import annotations

import threading
import time
import wave
from pathlib import Path

from fastapi.testclient import TestClient

import app.jobs as jobs_module
from app.config import Settings
from app.main import create_app
from app.schemas import JobRecord, TranscriptPayload
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


class BlockingWhisperService(FakeWhisperService):
    def __init__(self, settings: Settings, started: threading.Event, release: threading.Event) -> None:
        super().__init__(settings)
        self.started = started
        self.release = release

    def transcribe(self, audio_path: Path, model_name: str):
        self.started.set()
        self.release.wait(timeout=5)
        return super().transcribe(audio_path, model_name)


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


def test_delete_lecture_removes_it_from_storage_and_library(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    audio_path = tmp_path / "sample.wav"
    write_test_wav(audio_path)

    with audio_path.open("rb") as handle:
        import_response = client.post(
            "/lectures/import",
            files={"file": ("sample.wav", handle, "audio/wav")},
        )

    assert import_response.status_code == 200
    lecture = import_response.json()
    lecture_path = tmp_path / "data" / "lectures" / lecture["id"]
    assert lecture_path.exists()

    delete_response = client.delete(f"/lectures/{lecture['id']}")

    assert delete_response.status_code == 204
    assert not lecture_path.exists()
    assert client.get("/lectures").json() == []


def test_delete_lecture_returns_404_for_unknown_id(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.delete("/lectures/missing-lecture")

    assert response.status_code == 404


def test_delete_lecture_returns_409_when_transcription_is_running(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    audio_path = tmp_path / "sample.wav"
    write_test_wav(audio_path)

    with audio_path.open("rb") as handle:
        import_response = client.post(
            "/lectures/import",
            files={"file": ("sample.wav", handle, "audio/wav")},
        )

    assert import_response.status_code == 200
    lecture = import_response.json()
    store = client.app.state.store
    running_job = JobRecord(
        id="job-running",
        lecture_id=lecture["id"],
        model="turbo",
        status="transcribing",
        progress=50,
        message="Transcribing lecture with Whisper.",
        error=None,
        created_at="2026-03-14T09:00:00+00:00",
        updated_at="2026-03-14T09:00:00+00:00",
    )
    store.write_job(running_job)
    store.update_metadata(lecture["id"], active_job_id=running_job.id, status="transcribing")

    response = client.delete(f"/lectures/{lecture['id']}")

    assert response.status_code == 409
    assert response.json()["detail"] == "Lecture cannot be deleted while transcription is running."
    assert (tmp_path / "data" / "lectures" / lecture["id"]).exists()


def test_force_delete_running_lecture_cancels_job_and_removes_storage(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    audio_path = tmp_path / "sample.wav"
    write_test_wav(audio_path)

    with audio_path.open("rb") as handle:
        import_response = client.post(
            "/lectures/import",
            files={"file": ("sample.wav", handle, "audio/wav")},
        )

    assert import_response.status_code == 200
    lecture = import_response.json()
    store = client.app.state.store
    running_job = JobRecord(
        id="job-running",
        lecture_id=lecture["id"],
        model="turbo",
        status="transcribing",
        progress=50,
        message="Transcribing lecture with Whisper.",
        error=None,
        created_at="2026-03-14T09:00:00+00:00",
        updated_at="2026-03-14T09:00:00+00:00",
    )
    store.write_job(running_job)
    store.update_metadata(lecture["id"], active_job_id=running_job.id, status="transcribing")

    response = client.delete(f"/lectures/{lecture['id']}?force=true")

    assert response.status_code == 204
    assert client.get(f"/jobs/{running_job.id}").json()["status"] == "canceled"
    assert not (tmp_path / "data" / "lectures" / lecture["id"]).exists()


def test_force_delete_running_thread_does_not_recreate_deleted_lecture(tmp_path: Path, monkeypatch) -> None:
    started = threading.Event()
    release = threading.Event()
    settings = Settings(data_dir=tmp_path / "data")
    app = create_app(settings, transcriber=BlockingWhisperService(settings, started, release))
    client = TestClient(app)
    monkeypatch.setattr(jobs_module, "normalize_audio", lambda source, destination: destination.write_bytes(b"wav"))

    audio_path = tmp_path / "sample.wav"
    write_test_wav(audio_path)

    with audio_path.open("rb") as handle:
        import_response = client.post(
            "/lectures/import",
            files={"file": ("sample.wav", handle, "audio/wav")},
        )

    assert import_response.status_code == 200
    lecture = import_response.json()
    lecture_path = tmp_path / "data" / "lectures" / lecture["id"]

    job_response = client.post(
        f"/lectures/{lecture['id']}/transcribe",
        json={"model": "turbo"},
    )
    assert job_response.status_code == 200
    job_id = job_response.json()["id"]
    assert started.wait(timeout=2)

    delete_response = client.delete(f"/lectures/{lecture['id']}?force=true")
    assert delete_response.status_code == 204
    assert not lecture_path.exists()
    assert client.get(f"/jobs/{job_id}").json()["status"] == "canceled"

    release.set()

    for _ in range(40):
        if not lecture_path.exists():
            break
        time.sleep(0.05)

    assert not lecture_path.exists()
    assert client.get(f"/lectures/{lecture['id']}").status_code == 404
    assert client.get(f"/jobs/{job_id}").json()["status"] == "canceled"


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
