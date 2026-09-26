import pytest


@pytest.mark.handoff
@pytest.mark.skip(reason="TODO Backend: every generated numeric claim must map to a tool result.")
def test_claim_provenance():
    """Pending implementation; a skip is not a passing product guarantee."""
    raise NotImplementedError
