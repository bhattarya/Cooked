import pytest


@pytest.mark.handoff
@pytest.mark.skip(reason="TODO Backend: fewer than 30 matched twins must refuse.")
def test_min_twin_support():
    """Pending implementation; a skip is not a passing product guarantee."""
    raise NotImplementedError
