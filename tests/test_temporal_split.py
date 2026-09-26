import pytest


@pytest.mark.handoff
@pytest.mark.skip(
    reason="TODO Backend: prove max(train graduation year) < min(test graduation year)."
)
def test_temporal_split():
    """Pending implementation; a skip is not a passing product guarantee."""
    raise NotImplementedError
