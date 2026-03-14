from __future__ import annotations

import json
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError

from .audio import probe_duration
from .config import Settings
from .schemas import JobRecord, LectureMetadata, TranscriptPayload


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def derive_title(filename: str) -> str:
    stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    return stem.title() if stem else "Untitled Lecture"


class LectureStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.ensure_directories()

    def lecture_dir(self, lecture_id: str) -> Path:
        return self.settings.lectures_dir / lecture_id

    def jobs_path(self, job_id: str) -> Path:
        return self.settings.jobs_dir / f"{job_id}.json"

    def metadata_path(self, lecture_id: str) -> Path:
        return self.lecture_dir(lecture_id) / "metadata.json"

    def transcript_path(self, lecture_id: str) -> Path:
        return self.lecture_dir(lecture_id) / "transcript.json"

    def normalized_audio_path(self, lecture_id: str) -> Path:
        return self.lecture_dir(lecture_id) / "normalized.wav"

    def source_audio_path(self, lecture_id: str, extension: str) -> Path:
        return self.lecture_dir(lecture_id) / f"source{extension}"

    def _write_json_file(self, path: Path, payload: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            delete=False,
        ) as handle:
            handle.write(payload)
            temp_path = Path(handle.name)
        temp_path.replace(path)

    def create_lecture(self, source_path: Path, original_filename: str) -> LectureMetadata:
        extension = source_path.suffix.lower()
        if extension not in self.settings.allowed_extensions:
            raise ValueError(f"Unsupported file type: {extension}")

        lecture_id = uuid.uuid4().hex
        lecture_dir = self.lecture_dir(lecture_id)
        lecture_dir.mkdir(parents=True, exist_ok=True)

        stored_filename = f"source{extension}"
        destination = lecture_dir / stored_filename
        shutil.copy2(source_path, destination)
        timestamp = utc_now()
        metadata = LectureMetadata(
            id=lecture_id,
            title=derive_title(original_filename),
            original_filename=original_filename,
            stored_filename=stored_filename,
            source_extension=extension,
            duration_seconds=probe_duration(destination),
            status="uploaded",
            created_at=timestamp,
            updated_at=timestamp,
            audio_url=f"/lectures/{lecture_id}/audio",
            transcript_url=f"/lectures/{lecture_id}/transcript",
        )
        self.write_metadata(metadata)
        return metadata

    def read_metadata(self, lecture_id: str) -> LectureMetadata:
        path = self.metadata_path(lecture_id)
        if not path.exists():
            raise FileNotFoundError(lecture_id)
        return LectureMetadata.model_validate_json(path.read_text())

    def list_lectures(self) -> list[LectureMetadata]:
        lectures: list[LectureMetadata] = []
        for lecture_dir in self.settings.lectures_dir.iterdir():
            if not lecture_dir.is_dir():
                continue

            metadata_path = lecture_dir / "metadata.json"
            if not metadata_path.exists():
                continue

            try:
                lectures.append(LectureMetadata.model_validate_json(metadata_path.read_text()))
            except (OSError, ValidationError, json.JSONDecodeError):
                continue

        return sorted(lectures, key=lambda lecture: lecture.created_at, reverse=True)

    def write_metadata(self, metadata: LectureMetadata) -> LectureMetadata:
        payload = metadata.model_copy(update={"updated_at": utc_now()})
        self._write_json_file(self.metadata_path(payload.id), payload.model_dump_json(indent=2))
        return payload

    def update_metadata(self, lecture_id: str, **updates: object) -> LectureMetadata:
        metadata = self.read_metadata(lecture_id)
        updated = metadata.model_copy(update=updates)
        return self.write_metadata(updated)

    def write_job(self, job: JobRecord) -> JobRecord:
        payload = job.model_copy(update={"updated_at": utc_now()})
        self._write_json_file(self.jobs_path(payload.id), payload.model_dump_json(indent=2))
        return payload

    def read_job(self, job_id: str) -> JobRecord:
        path = self.jobs_path(job_id)
        if not path.exists():
            raise FileNotFoundError(job_id)
        return JobRecord.model_validate_json(path.read_text())

    def write_transcript(self, lecture_id: str, transcript: TranscriptPayload) -> TranscriptPayload:
        self._write_json_file(self.transcript_path(lecture_id), transcript.model_dump_json(indent=2))
        return transcript

    def read_transcript(self, lecture_id: str) -> TranscriptPayload:
        path = self.transcript_path(lecture_id)
        if not path.exists():
            raise FileNotFoundError(lecture_id)
        return TranscriptPayload.model_validate_json(path.read_text())

    def audio_file(self, lecture_id: str) -> Path:
        metadata = self.read_metadata(lecture_id)
        path = self.lecture_dir(lecture_id) / metadata.stored_filename
        if not path.exists():
            raise FileNotFoundError(path)
        return path
