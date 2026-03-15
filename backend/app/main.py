from __future__ import annotations

import asyncio
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .audio import ffmpeg_available
from .config import Settings, settings as default_settings
from .jobs import JobConflictError, JobManager
from .schemas import (
    DownloadModelRequest,
    HealthCheck,
    JobRecord,
    LectureMetadata,
    ModelInfo,
    TranscriptPayload,
    TranscribeLectureRequest,
)
from .storage import LectureStore
from .transcription import WhisperService


def create_app(
    app_settings: Settings | None = None,
    transcriber: WhisperService | None = None,
) -> FastAPI:
    settings = app_settings or default_settings
    settings.ensure_directories()
    store = LectureStore(settings)
    whisper_service = transcriber or WhisperService(settings)
    job_manager = JobManager(store, whisper_service)

    app = FastAPI(title="LessonScribe API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin, "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.settings = settings
    app.state.store = store
    app.state.transcriber = whisper_service
    app.state.job_manager = job_manager

    @app.get("/health", response_model=HealthCheck)
    def health() -> HealthCheck:
        whisper_status = whisper_service.preflight()
        ffmpeg_ok = ffmpeg_available()
        return HealthCheck(
            status="ok" if ffmpeg_ok and whisper_status["whisper_installed"] else "degraded",
            ffmpeg_available=ffmpeg_ok,
            whisper_installed=whisper_status["whisper_installed"],
            cuda_available=whisper_status["cuda_available"],
            mps_available=whisper_status["mps_available"],
            inference_device=whisper_status["inference_device"],
            data_dir=str(settings.data_dir),
            supported_models=list(settings.supported_models),
        )

    @app.get("/models", response_model=list[ModelInfo])
    def models() -> list[ModelInfo]:
        return whisper_service.list_models()

    @app.post("/models/download", response_model=ModelInfo)
    async def download_model(payload: DownloadModelRequest) -> ModelInfo:
        if payload.name not in settings.supported_models:
            raise HTTPException(status_code=400, detail="Unsupported Whisper model.")
        try:
            await asyncio.to_thread(whisper_service.download_model, payload.name)
        except Exception as exc:  # pragma: no cover - external dependency
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return ModelInfo(name=payload.name, available=True)

    @app.post("/lectures/import", response_model=LectureMetadata)
    async def import_lecture(file: UploadFile = File(...)) -> LectureMetadata:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in settings.allowed_extensions:
            raise HTTPException(status_code=400, detail="Unsupported file type.")

        temp_dir = Path(tempfile.mkdtemp(prefix="lessonscribe-upload-"))
        temp_path = temp_dir / f"upload{suffix}"
        try:
            with temp_path.open("wb") as handle:
                shutil.copyfileobj(file.file, handle)
            metadata = store.create_lecture(temp_path, file.filename or temp_path.name)
            return metadata
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        finally:
            await file.close()
            shutil.rmtree(temp_dir, ignore_errors=True)

    @app.get("/lectures", response_model=list[LectureMetadata])
    def lectures() -> list[LectureMetadata]:
        return store.list_lectures()

    @app.get("/lectures/{lecture_id}", response_model=LectureMetadata)
    def lecture(lecture_id: str) -> LectureMetadata:
        try:
            return store.read_metadata(lecture_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Lecture not found.") from exc

    @app.delete("/lectures/{lecture_id}", status_code=204)
    def delete_lecture(lecture_id: str, force: bool = False) -> Response:
        try:
            metadata = store.read_metadata(lecture_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Lecture not found.") from exc

        if metadata.active_job_id:
            try:
                job = job_manager.get_job(metadata.active_job_id)
            except FileNotFoundError:
                job = None

            if job is not None and job.status not in {"complete", "failed", "canceled"}:
                if not force:
                    raise HTTPException(
                        status_code=409,
                        detail="Lecture cannot be deleted while transcription is running.",
                    )
                try:
                    job_manager.cancel_job(metadata.active_job_id)
                except FileNotFoundError:
                    pass

        try:
            store.delete_lecture(lecture_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Lecture not found.") from exc
        return Response(status_code=204)

    @app.post("/lectures/{lecture_id}/transcribe", response_model=JobRecord)
    async def transcribe_lecture(lecture_id: str, payload: TranscribeLectureRequest) -> JobRecord:
        if payload.model not in settings.supported_models:
            raise HTTPException(status_code=400, detail="Unsupported Whisper model.")
        try:
            return job_manager.start_transcription(lecture_id, payload.model)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Lecture not found.") from exc
        except JobConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/jobs/{job_id}", response_model=JobRecord)
    def job(job_id: str) -> JobRecord:
        try:
            return job_manager.get_job(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Job not found.") from exc

    @app.get("/lectures/{lecture_id}/transcript", response_model=TranscriptPayload)
    def transcript(lecture_id: str) -> TranscriptPayload:
        try:
            return store.read_transcript(lecture_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Transcript not found.") from exc

    @app.put("/lectures/{lecture_id}/transcript", response_model=TranscriptPayload)
    def update_transcript(lecture_id: str, payload: TranscriptPayload) -> TranscriptPayload:
        try:
            store.read_metadata(lecture_id)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Lecture not found.")
        return store.write_transcript(lecture_id, payload)

    @app.get("/lectures/{lecture_id}/audio")
    def audio(lecture_id: str) -> FileResponse:
        try:
            audio_path = store.audio_file(lecture_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Audio not found.") from exc
        return FileResponse(audio_path)

    return app


app = create_app()
