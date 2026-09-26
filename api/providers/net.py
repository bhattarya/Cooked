"""The only way the API talks to the outside world.

`DEMO_MODE=1` (or `allow(False)` in tests) blocks every outbound call, so the demo path is
provably served from Postgres caches and local models (§5.4, test_cache_replay).
"""

from __future__ import annotations

import os

import httpx

_allowed = True


class NetworkDisabled(RuntimeError):
    pass


def allow(flag: bool) -> None:
    global _allowed
    _allowed = flag


def enabled() -> bool:
    return _allowed and os.getenv("DEMO_MODE", "0") != "1"


def request(method: str, url: str, **kwargs) -> httpx.Response:
    if not enabled():
        raise NetworkDisabled("outbound network disabled (demo replay)")
    kwargs.setdefault("timeout", 45)
    with httpx.Client() as client:
        return client.request(method, url, **kwargs)


def key(name: str) -> str | None:
    value = os.getenv(name, "")
    return value if value and "CHANGE_ME" not in value else None
