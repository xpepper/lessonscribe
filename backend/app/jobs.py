from __future__ import annotations

import threading
import uuid

from .audio import normalize_audio
from .schemas import JobRecord
from .storage import LectureStore, utc_now
from .transcription import WhisperService


class JobConflictError(RuntimeError):
    """Raised when a second job is requested while another job is active."""


class JobCanceledError(RuntimeError):
    """Raised when a running job observes a cancellation request."""


class JobManager:
    def __init__(self, store: LectureStore, transcriber: WhisperService) -> None:
        self.store = store
        self.transcriber = transcriber
        self._lock = threading.Lock()
        self._tasks: dict[str, threading.Thread] = {}
        self._active_job_id: str | None = None
        self._cancel_requested_job_ids: set[str] = set()

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

    def cancel_job(self, job_id: str) -> JobRecord:
        job = self.store.read_job(job_id)
        if job.status in {"complete", "failed", "canceled"}:
            return job

        self._cancel_requested_job_ids.add(job_id)
        canceled_job = self._update_job(
            job_id,
            status="canceled",
            progress=100,
            message="Transcription canceled by user.",
            error=None,
        )
        self._safe_update_metadata(job.lecture_id, status="canceled", active_job_id=None)
        return canceled_job

    def start_transcription(self, lecture_id: str, model: str) -> JobRecord:
        if self._active_job_id is not None:
            active_job = self.store.read_job(self._active_job_id)
            active_task = self._tasks.get(self._active_job_id)
            if active_task is not None and active_task.is_alive():
                if active_job.lecture_id == lecture_id:
                    return active_job
                raise JobConflictError("Another transcription job is already running.")
            self._active_job_id = None

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

    def _safe_update_metadata(self, lecture_id: str, **updates: object) -> None:
        try:
            self.store.update_metadata(lecture_id, **updates)
        except FileNotFoundError:
            return

    def _cancel_requested(self, job_id: str) -> bool:
        return job_id in self._cancel_requested_job_ids

    def _raise_if_canceled(self, job_id: str) -> None:
        if self._cancel_requested(job_id):
            raise JobCanceledError(job_id)

    def _mark_job_canceled(self, job_id: str, lecture_id: str) -> None:
        try:
            current = self.store.read_job(job_id)
        except FileNotFoundError:
            return

        if current.status != "canceled":
            self._update_job(
                job_id,
                status="canceled",
                progress=100,
                message="Transcription canceled by user.",
                error=None,
            )
        self._safe_update_metadata(lecture_id, status="canceled", active_job_id=None)

    def _run(self, job_id: str, lecture_id: str, model: str) -> None:
        with self._lock:
            try:
                self._raise_if_canceled(job_id)
                if not self.transcriber.model_available(model):
                    self._update_job(
                        job_id,
                        status="downloading-model",
                        progress=15,
                        message=f"Downloading Whisper model '{model}'.",
                    )
                    self._safe_update_metadata(lecture_id, status="downloading-model")
                    self.transcriber.download_model(model)

                self._raise_if_canceled(job_id)
                self._update_job(
                    job_id,
                    status="transcribing",
                    progress=40,
                    message="Transcribing lecture with Whisper.",
                )
                self._safe_update_metadata(lecture_id, status="transcribing")

                source_path = self.store.audio_file(lecture_id)
                normalized_path = self.store.normalized_audio_path(lecture_id)
                normalize_audio(source_path, normalized_path)

                self._raise_if_canceled(job_id)
                transcript = self.transcriber.transcribe(normalized_path, model)
                self._raise_if_canceled(job_id)
                self.store.write_transcript(lecture_id, transcript)
                self._safe_update_metadata(
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
            except JobCanceledError:
                self._mark_job_canceled(job_id, lecture_id)
            except FileNotFoundError:
                if self._cancel_requested(job_id):
                    self._mark_job_canceled(job_id, lecture_id)
                else:
                    self._safe_update_metadata(
                        lecture_id,
                        status="failed",
                        active_job_id=None,
                    )
                    self._update_job(
                        job_id,
                        status="failed",
                        progress=100,
                        message="Transcription failed.",
                        error="Lecture assets are no longer available.",
                    )
            except Exception as exc:  # pragma: no cover - exercised through tests
                if self._cancel_requested(job_id):
                    self._mark_job_canceled(job_id, lecture_id)
                else:
                    self._safe_update_metadata(
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
                self._cancel_requested_job_ids.discard(job_id)
