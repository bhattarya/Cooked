import pytest


@pytest.mark.handoff
@pytest.mark.skip(
    reason="TODO Backend: inspect actual training query/dataset; current IDs must be absent."
)
def test_no_current_in_training():
    """Pending implementation; a skip is not a passing product guarantee."""
    raise NotImplementedError
