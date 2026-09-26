from ml.watchtower import CLOSE_BELOW, OPEN_AT, hysteresis


def run(risks):
    is_open, events = False, []
    for r in risks:
        d = hysteresis(is_open, r)
        events.append(d)
        is_open = (is_open or d == "open") and d != "resolve"
    return events


def test_hovering_risk_opens_once_and_does_not_flap():
    hover = [OPEN_AT - 0.01, OPEN_AT + 0.01] * 5
    events = run(hover)
    assert events.count("open") == 1 and events.count("resolve") == 0


def test_alarm_resolves_only_below_the_lower_threshold():
    events = run([0.5, CLOSE_BELOW + 0.01, CLOSE_BELOW - 0.01, 0.3, OPEN_AT])
    assert events == ["open", "keep", "resolve", "keep", "open"]
