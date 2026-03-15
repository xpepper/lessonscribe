"""Tests for LectureStore file I/O, including encoding correctness."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config import Settings
from app.schemas import JobRecord, LectureMetadata, TranscriptPayload, TranscriptSegment, TranscriptWord
from app.storage import LectureStore


@pytest.fixture()
def store(tmp_path: Path) -> LectureStore:
    settings = Settings(data_dir=tmp_path)
    return LectureStore(settings)


def _minimal_metadata(lecture_id: str) -> LectureMetadata:
    return LectureMetadata(
        id=lecture_id,
        title="Perché è così",
        original_filename="lecture.mp3",
        stored_filename="source.mp3",
        source_extension=".mp3",
        duration_seconds=10.0,
        status="uploaded",
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
    )


def _minimal_transcript() -> TranscriptPayload:
    segment = TranscriptSegment(id="s1", start=0.0, end=5.0, text="perché è così")
    word = TranscriptWord(id="w1", segmentId="s1", start=0.0, end=1.0, text="perché")
    return TranscriptPayload(
        text="perché è così — cioè: bàrbara",
        language="it",
        segments=[segment],
        words=[word],
    )


def _minimal_job(lecture_id: str) -> JobRecord:
    return JobRecord(
        id="job-1",
        lecture_id=lecture_id,
        model="turbo",
        status="complete",
        progress=100,
        message="perché è così",
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
    )


class TestUtf8Encoding:
    """JSON files are written as UTF-8; reads must use the same encoding.

    On Windows with a non-UTF-8 system locale (e.g. cp1252 for Italian),
    Path.read_text() without an explicit encoding defaults to the system
    locale and misinterprets multi-byte UTF-8 sequences, turning 'è'
    (U+00E8, encoded as 0xC3 0xA8 in UTF-8) into the two Latin-1
    characters 'Ã¨'.
    """

    def test_metadata_roundtrip_preserves_accented_characters(self, store: LectureStore) -> None:
        metadata = _minimal_metadata("lecture-abc")
        store.settings.lectures_dir.joinpath("lecture-abc").mkdir(parents=True, exist_ok=True)
        store.write_metadata(metadata)

        # Simulate what Windows with cp1252 system locale would do without
        # an explicit encoding: re-read the UTF-8 bytes as cp1252.
        raw_bytes = store.metadata_path("lecture-abc").read_bytes()
        misread = raw_bytes.decode("cp1252", errors="replace")
        assert "Ã" in misread, "precondition: cp1252 misreads UTF-8 accented chars"

        # The actual store must return the correct text.
        loaded = store.read_metadata("lecture-abc")
        assert loaded.title == "Perché è così"

    def test_transcript_roundtrip_preserves_accented_characters(self, store: LectureStore) -> None:
        lecture_id = "lecture-abc"
        store.settings.lectures_dir.joinpath(lecture_id).mkdir(parents=True, exist_ok=True)
        transcript = _minimal_transcript()
        store.write_transcript(lecture_id, transcript)

        raw_bytes = store.transcript_path(lecture_id).read_bytes()
        misread = raw_bytes.decode("cp1252", errors="replace")
        assert "Ã" in misread, "precondition: cp1252 misreads UTF-8 accented chars"

        loaded = store.read_transcript(lecture_id)
        assert loaded.text == "perché è così — cioè: bàrbara"
        assert loaded.segments[0].text == "perché è così"
        assert loaded.words[0].text == "perché"

    def test_job_roundtrip_preserves_accented_characters(self, store: LectureStore) -> None:
        job = _minimal_job("lecture-abc")
        store.write_job(job)

        raw_bytes = store.jobs_path("job-1").read_bytes()
        misread = raw_bytes.decode("cp1252", errors="replace")
        assert "Ã" in misread, "precondition: cp1252 misreads UTF-8 accented chars"

        loaded = store.read_job("job-1")
        assert loaded.message == "perché è così"

    def test_list_lectures_preserves_accented_characters(self, store: LectureStore) -> None:
        metadata = _minimal_metadata("lecture-abc")
        store.settings.lectures_dir.joinpath("lecture-abc").mkdir(parents=True, exist_ok=True)
        store.write_metadata(metadata)

        lectures = store.list_lectures()
        assert len(lectures) == 1
        assert lectures[0].title == "Perché è così"
