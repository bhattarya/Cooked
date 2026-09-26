import shutil

import pytest
from fastapi.testclient import TestClient

from ml.model_interface import ARTIFACT, ArtifactError, Models, verify
from scripts.common import ROOT


@pytest.fixture
def tampered(tmp_path):
    shutil.copytree(ROOT / "models", tmp_path / "models")
    path = tmp_path / "models" / ARTIFACT
    data = bytearray(path.read_bytes())
    data[len(data) // 2] ^= 0xFF
    path.write_bytes(bytes(data))
    return tmp_path / "models"


def test_frozen_artifacts_verify():
    assert verify(ROOT / "models")["version"].startswith("cooked-v1")


def test_modified_artifact_is_rejected(tampered):
    with pytest.raises(ArtifactError, match="checksum mismatch"):
        Models.load(tampered)


def test_api_refuses_to_start_with_a_modified_artifact(tampered, monkeypatch):
    monkeypatch.setenv("MODEL_ARTIFACT_DIR", str(tampered))
    from api.main import app

    with pytest.raises(ArtifactError), TestClient(app):
        pass
