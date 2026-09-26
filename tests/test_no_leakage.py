import pytest


@pytest.mark.handoff
@pytest.mark.skip(
    reason="TODO Backend: validate actual snapshot feature columns against §7.1 quarantine."
)
def test_no_leakage():
    """Pending implementation; a skip is not a passing product guarantee."""
    raise NotImplementedError
