from __future__ import annotations

import threading
import uuid

from .audio import normalize_audio
from .schemas import JobRecord
from .storage import LectureStore, utc_now
from .transcription import WhisperService


class JobConflictError(RuntimeError):
    """Raised when a second job is requested while another job is active."""


class JobManager:
    def __init__(self, store: LectureStore, transcriber: WhisperService) -> None:
        self.store = store
        self.transcriber = transcriber
        self._lock = threading.Lock()
        self._tasks: dict[str, threading.Thread] = {}
        self._active_job_id: str | None = None

    def _write_job(
        self,
        job_id: str,
        lecture_id: str,
        model: str,
        status: str,
        progress: int,
        message: str,
        error: str | None = None,
    ) -> JobRecord:
        job = JobRecord(
            id=job_id,
            lecture_id=lecture_id,
            model=model,
            status=status,  # type: ignore[arg-type]
            progress=progress,
            message=message,
            error=error,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        return self.store.write_job(job)

    def _update_job(self, job_id: str, **updates: object) -> JobRecord:
        job = self.store.read_job(job_id)
        updated = job.model_copy(update=updates)
        return self.store.write_job(updated)

    def get_job(self, job_id: str) -> JobRecord:
        return self.store.read_job(job_id)

    def start_transcription(self, lecture_id: str, model: str) -> JobRecord:
        if self._active_job_id is not None:
            active_job = self.store.read_job(self._active_job_id)
            if active_job.status not in {"complete", "failed"}:
                if active_job.lecture_id == lecture_id:
                    return active_job
                raise JobConflictError("Another transcription job is already running.")

        self.store.read_metadata(lecture_id)
        job_id = uuid.uuid4().hex
        initial = self._write_job(
            job_id=job_id,
            lecture_id=lecture_id,
            model=model,
            status="preparing",
            progress=5,
            message="Preparing lecture for transcription.",
        )
        self.store.update_metadata(
            lecture_id,
            status="preparing",
            selected_model=model,
            active_job_id=job_id,
        )
        task = threading.Thread(
            target=self._run,
            args=(job_id, lecture_id, model),
            daemon=True,
        )
        self._tasks[job_id] = task
        self._active_job_id = job_id
        task.start()
        return initial

    def _run(self, job_id: str, lecture_id: str, model: str) -> None:
        with self._lock:
            try:
                if not self.transcriber.model_available(model):
                    self._update_job(
                        job_id,
                        status="downloading-model",
                        progress=15,
                        message=f"Downloading Whisper model '{model}'.",
                    )
                    self.store.update_metadata(lecture_id, status="downloading-model")
                    self.transcriber.download_model(model)

                self._update_job(
                    job_id,
                    status="transcribing",
                    progress=40,
                    message="Transcribing lecture with Whisper.",
                )
                self.store.update_metadata(lecture_id, status="transcribing")

                source_path = self.store.audio_file(lecture_id)
                normalized_path = self.store.normalized_audio_path(lecture_id)
                normalize_audio(source_path, normalized_path)

                transcript = self.transcriber.transcribe(normalized_path, model)
                self.store.write_transcript(lecture_id, transcript)
                self.store.update_metadata(
                    lecture_id,
                    status="complete",
                    has_transcript=True,
                    detected_language=transcript.language,
                    active_job_id=None,
                )
                self._update_job(
                    job_id,
                    status="complete",
                    progress=100,
                    message="Transcription complete.",
                )
            except Exception as exc:  # pragma: no cover - exercised through tests
                self.store.update_metadata(
                    lecture_id,
                    status="failed",
                    active_job_id=None,
                )
                self._update_job(
                    job_id,
                    status="failed",
                    progress=100,
                    message="Transcription failed.",
                    error=str(exc),
                )
            finally:
                self._active_job_id = None
