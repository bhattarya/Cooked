"""Backboard memory (§10): one assistant per student, memories shared across that student's threads.

The local app.memory_note table is always written first; Backboard is a mirror when configured,
so the demo never depends on it (§10.4).
"""

from __future__ import annotations

import os

from api.providers import net

BASE = "https://app.backboard.io/api"


def configured() -> bool:
    return bool(net.key("BACKBOARD_API_KEY")) and os.getenv("BACKBOARD_BASE_URL", BASE).rstrip("/") == BASE


def _post(path: str, body: dict) -> dict | None:
    try:
        r = net.request(
            "POST", f"{BASE}/{path}", headers={"X-API-Key": net.key("BACKBOARD_API_KEY")}, json=body,
            timeout=90,
        )
        r.raise_for_status()
        return r.json()
    except Exception:  # noqa: BLE001
        return None


def ensure_assistant(conn, campus_id: str) -> str | None:
    row = conn.execute(
        "SELECT backboard_assistant_id FROM app.memory_link WHERE campus_id=%s", (campus_id,)
    ).fetchone()
    if row:
        return row[0]
    if not configured():
        return None
    body = _post("assistants", {"name": f"COOKED coach {campus_id} (synthetic)"})
    if not body:
        return None
    conn.execute(
        "INSERT INTO app.memory_link(campus_id, backboard_assistant_id) VALUES (%s, %s) "
        "ON CONFLICT (campus_id) DO NOTHING",
        (campus_id, body["assistant_id"]),
    )
    return body["assistant_id"]


def remember(conn, campus_id: str, note: str) -> bool:
    if not configured():
        return False
    assistant = ensure_assistant(conn, campus_id)
    if not assistant:
        return False
    body = _post(
        "threads/messages",
        {"assistant_id": assistant, "memory": "Auto", "stream": False, "content": f"Remember: {note}"},
    )
    if body and body.get("thread_id"):
        conn.execute(
            "UPDATE app.memory_link SET thread_id=%s WHERE campus_id=%s", (body["thread_id"], campus_id)
        )
        return True
    return False


def recall(conn, campus_id: str) -> str | None:
    if not configured():
        return None
    assistant = ensure_assistant(conn, campus_id)
    if not assistant:
        return None
    body = _post(
        "threads/messages",
        {
            "assistant_id": assistant,
            "memory": "Readonly",
            "stream": False,
            "content": "In one sentence, what decisions has this student made about their plan?",
        },
    )
    return body.get("content") if body else None
