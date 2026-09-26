import pytest


@pytest.mark.handoff
@pytest.mark.skip(reason="TODO Backend: modified artifact must prevent API startup.")
def test_artifact_checksum():
    """Pending implementation; a skip is not a passing product guarantee."""
    raise NotImplementedError
