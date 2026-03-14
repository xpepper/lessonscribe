from __future__ import annotations

from pathlib import Path
from typing import Any

from .config import Settings
from .schemas import ModelInfo, TranscriptPayload, TranscriptSegment, TranscriptWord


class WhisperService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _import_whisper(self):
        try:
            import whisper  # type: ignore[import-not-found]
        except ImportError:
            return None
        return whisper

    def _import_torch(self):
        try:
            import torch  # type: ignore[import-not-found]
        except ImportError:
            return None
        return torch

    def whisper_installed(self) -> bool:
        return self._import_whisper() is not None

    def preflight(self) -> dict[str, bool]:
        return {
            "whisper_installed": self.whisper_installed(),
        }

    def _model_marker(self, model_name: str) -> Path:
        return self.settings.models_dir / f"{model_name}.ready"

    def model_available(self, model_name: str) -> bool:
        return self._model_marker(model_name).exists()

    def list_models(self) -> list[ModelInfo]:
        return [
            ModelInfo(name=model_name, available=self.model_available(model_name))
            for model_name in self.settings.supported_models
        ]

    def _validate_model(self, model_name: str) -> None:
        if model_name not in self.settings.supported_models:
            raise ValueError(f"Unsupported model '{model_name}'.")

    def _device(self) -> str:
        torch = self._import_torch()
        if torch is None:
            return "cpu"
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def download_model(self, model_name: str) -> None:
        self._validate_model(model_name)
        whisper = self._import_whisper()
        if whisper is None:
            raise RuntimeError("Whisper is not installed. Install backend dependencies first.")

        whisper.load_model(model_name, download_root=str(self.settings.models_dir), device=self._device())
        self._model_marker(model_name).write_text("ready\n")

    def transcribe(self, audio_path: Path, model_name: str) -> TranscriptPayload:
        self._validate_model(model_name)
        whisper = self._import_whisper()
        if whisper is None:
            raise RuntimeError("Whisper is not installed. Install backend dependencies first.")

        model = whisper.load_model(model_name, download_root=str(self.settings.models_dir), device=self._device())
        result = model.transcribe(
            str(audio_path),
            word_timestamps=True,
            verbose=False,
            fp16=self._device() == "cuda",
        )
        self._model_marker(model_name).write_text("ready\n")
        return normalize_transcript(result)


def normalize_transcript(raw_result: dict[str, Any]) -> TranscriptPayload:
    raw_segments = raw_result.get("segments") or []
    segments: list[TranscriptSegment] = []
    words: list[TranscriptWord] = []

    for segment_index, segment in enumerate(raw_segments):
        segment_id = f"segment-{segment_index}"
        segments.append(
            TranscriptSegment(
                id=segment_id,
                start=float(segment["start"]),
                end=float(segment["end"]),
                text=str(segment.get("text", "")).strip(),
            )
        )

        for word_index, word in enumerate(segment.get("words") or []):
            start = word.get("start")
            end = word.get("end")
            if start is None or end is None:
                continue
            words.append(
                TranscriptWord(
                    id=f"{segment_id}-word-{word_index}",
                    segmentId=segment_id,
                    start=float(start),
                    end=float(end),
                    text=str(word.get("word", "")).strip(),
                )
            )

    return TranscriptPayload(
        text=str(raw_result.get("text", "")).strip(),
        language=raw_result.get("language"),
        segments=segments,
        words=words,
    )
