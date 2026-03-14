from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("LESSONSCRIBE_DATA_DIR", REPO_ROOT / "data")))
    lectures_dir: Path = field(init=False)
    jobs_dir: Path = field(init=False)
    models_dir: Path = field(init=False)
    allowed_extensions: tuple[str, ...] = (".mp3", ".m4a", ".wav")
    supported_models: tuple[str, ...] = ("turbo", "base", "large-v3")
    frontend_origin: str = os.getenv("LESSONSCRIBE_FRONTEND_ORIGIN", "http://localhost:5173")

    def __post_init__(self) -> None:
        object.__setattr__(self, "lectures_dir", self.data_dir / "lectures")
        object.__setattr__(self, "jobs_dir", self.data_dir / "jobs")
        object.__setattr__(self, "models_dir", self.data_dir / "models")

    def ensure_directories(self) -> None:
        for directory in (self.data_dir, self.lectures_dir, self.jobs_dir, self.models_dir):
            directory.mkdir(parents=True, exist_ok=True)


settings = Settings()
