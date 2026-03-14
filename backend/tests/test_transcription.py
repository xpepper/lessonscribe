from __future__ import annotations

import sys
import types

import numpy as np

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


def test_patch_mps_dtw_moves_tensor_to_cpu_before_double(monkeypatch) -> None:
    service = make_service()
    calls: list[str] = []

    class FakeCpuTensor:
        def double(self):
            calls.append("double")
            return self

        def numpy(self):
            calls.append("numpy")
            return np.array([[0.0]], dtype=np.float64)

    class FakeMpsTensor:
        is_cuda = False
        device = SimpleNamespace(type="mps")

        def cpu(self):
            calls.append("cpu")
            return FakeCpuTensor()

    fake_timing = types.SimpleNamespace(
        _lessonscribe_mps_patch=False,
        dtw=lambda x: "original",
        dtw_cpu=lambda value: value.dtype,
    )

    importlib_target = "whisper.timing"
    monkeypatch.setitem(sys.modules, importlib_target, fake_timing)

    service._patch_mps_dtw()
    result = fake_timing.dtw(FakeMpsTensor())

    assert calls == ["cpu", "double", "numpy"]
    assert result == np.dtype("float64")
