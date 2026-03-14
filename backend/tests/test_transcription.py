from __future__ import annotations

from types import SimpleNamespace

from app.config import Settings
from app.transcription import WhisperService


def make_service() -> WhisperService:
    return WhisperService(Settings())


def test_device_prefers_cuda(monkeypatch) -> None:
    service = make_service()
    fake_torch = SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: True),
        backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: True)),
    )

    monkeypatch.setattr(service, "_import_torch", lambda: fake_torch)

    assert service.device() == "cuda"


def test_device_falls_back_to_mps(monkeypatch) -> None:
    service = make_service()
    fake_torch = SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: False),
        backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: True)),
    )

    monkeypatch.setattr(service, "_import_torch", lambda: fake_torch)

    assert service.device() == "mps"


def test_device_falls_back_to_cpu(monkeypatch) -> None:
    service = make_service()
    fake_torch = SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: False),
        backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: False)),
    )

    monkeypatch.setattr(service, "_import_torch", lambda: fake_torch)

    assert service.device() == "cpu"
