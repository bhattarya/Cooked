import pytest


@pytest.mark.handoff
@pytest.mark.skip(reason="TODO Backend: hovering risk must not repeatedly open/close an alarm.")
def test_alarm_hysteresis():
    """Pending implementation; a skip is not a passing product guarantee."""
    raise NotImplementedError
