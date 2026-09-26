import pytest


@pytest.mark.handoff
@pytest.mark.skip(
    reason="TODO Backend: real demo routes must replay with outbound network disabled."
)
def test_cache_replay():
    """Pending implementation; a skip is not a passing product guarantee."""
    raise NotImplementedError
