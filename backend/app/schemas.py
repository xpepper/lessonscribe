from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


JobState = Literal[
    "uploaded",
    "preparing",
    "downloading-model",
    "transcribing",
    "canceled",
    "complete",
    "failed",
]


class HealthCheck(BaseModel):
    status: Literal["ok", "degraded"]
    ffmpeg_available: bool
    whisper_installed: bool
    cuda_available: bool
    mps_available: bool
    inference_device: Literal["cpu", "cuda", "mps"]
    data_dir: str
    supported_models: list[str]


class ModelInfo(BaseModel):
    name: str
    available: bool


class DownloadModelRequest(BaseModel):
    name: str


class TranscribeLectureRequest(BaseModel):
    model: str


class TranscriptSegment(BaseModel):
    id: str
    start: float
    end: float
    text: str


class TranscriptWord(BaseModel):
    id: str
    segmentId: str
    start: float
    end: float
    text: str


class TranscriptPayload(BaseModel):
    text: str
    language: str | None = None
    segments: list[TranscriptSegment]
    words: list[TranscriptWord]


class LectureMetadata(BaseModel):
    id: str
    title: str
    original_filename: str
    stored_filename: str
    source_extension: str
    duration_seconds: float
    status: JobState
    selected_model: str | None = None
    detected_language: str | None = None
    has_transcript: bool = False
    created_at: str
    updated_at: str
    active_job_id: str | None = None
    audio_url: str | None = None
    transcript_url: str | None = None


class JobRecord(BaseModel):
    id: str
    lecture_id: str
    model: str
    status: JobState
    progress: int = Field(ge=0, le=100)
    message: str
    error: str | None = None
    created_at: str
    updated_at: str
