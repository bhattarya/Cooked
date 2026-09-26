"""Gemini (§8.5): writes calm prose around number placeholders. It never sees a number to write.

The model receives slots like {{t1}} with a *description* of each value, not the value itself,
must return JSON matching a schema, and must use only known slots. Anything else is rejected
and the deterministic template is used instead.
"""

from __future__ import annotations

import contextlib
import json
import os
import re
from urllib.parse import quote

from api.providers import net

SLOT = re.compile(r"\{\{(t\d+)\}\}")

SYSTEM = (
    "You write two or three short sentences spoken to a college student, in second person, calm "
    "and warm like a good advisor: what the numbers show, what it means, what they can do. Never "
    "blame them and never say failure; credit load and work hours are circumstances they can "
    "change. Describe what happened to students like them; never promise or predict an outcome "
    "for this student (no 'will', 'can help you', 'guarantee'). You never write digits or number "
    "words. Every quantity must be one of the provided slots, written exactly like {{t1}}, and "
    "every slot must appear exactly once."
)


def configured() -> bool:
    return bool(net.key("GEMINI_API_KEY") and os.getenv("GEMINI_MODEL"))


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", "")


def _post(body: dict, timeout: float = 60, attempts: int = 3) -> dict | None:
    """generateContent with bounded backoff on 429 (free-tier quotas are tight, §16)."""
    import time

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model_name(), safe='')}:generateContent"
    for attempt in range(attempts):
        r = net.request("POST", url, headers={"x-goog-api-key": net.key("GEMINI_API_KEY")}, json=body, timeout=timeout)
        if r.status_code == 429 and attempt < attempts - 1:
            delay = 1.5 * (2**attempt)
            # honour Google's retryDelay hint when present, capped so the UI never hangs
            with contextlib.suppress(Exception):
                for d in r.json()["error"].get("details", []):
                    if "retryDelay" in d:
                        delay = float(str(d["retryDelay"]).rstrip("s"))
            time.sleep(min(delay, 4.0))
            continue
        r.raise_for_status()
        return r.json()
    return None


def write(kind: str, facts: str, slots: dict[str, str]) -> str | None:
    """Returns text containing {{tN}} placeholders, or None on any failure."""
    if not configured():
        return None
    slot_lines = "\n".join(f"{{{{{k}}}}}: {desc}" for k, desc in slots.items())
    prompt = f"{SYSTEM}\n\nMessage type: {kind}\nFacts: {facts}\nSlots:\n{slot_lines}"
    try:
        body = _post(
            {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.3 if kind == "alarm" else 0.1,
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "OBJECT",
                        "properties": {"script": {"type": "STRING"}},
                        "required": ["script"],
                    },
                },
            },
        )
        if not body:
            return None
        parts = body["candidates"][0]["content"]["parts"]
        body = json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))
        return str(body["script"])
    except Exception:  # noqa: BLE001 -- provider failures fall back to the template
        return None


def _call(body: dict, timeout: float = 90, attempts: int = 3) -> dict | None:
    try:
        out = _post(body, timeout=timeout, attempts=attempts)
        return out["candidates"][0]["content"] if out else None
    except Exception:  # noqa: BLE001 -- provider failures fall back to local paths
        return None


_COURSE = {
    "type": "OBJECT",
    "properties": {
        "course_id": {"type": "STRING", "description": "Subject + number, e.g. CMSC 201"},
        "credits": {"type": "NUMBER"},
        "grade": {"type": "STRING", "description": "Letter grade, W, F, or empty if in progress"},
    },
    "required": ["course_id", "credits"],
}
AUDIT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "first_name": {"type": "STRING", "nullable": True},
        "major": {"type": "STRING", "enum": ["Computer Science", "Information Systems"]},
        "track": {"type": "STRING", "nullable": True},
        "entry_type": {"type": "STRING", "enum": ["First-Time Freshman", "Transfer"]},
        "residency": {"type": "STRING", "enum": ["In-State", "Out-of-State"]},
        "credits_earned": {"type": "INTEGER", "nullable": True},
        "credits_required": {"type": "INTEGER"},
        "terms": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "label": {"type": "STRING", "description": "e.g. Fall 2024, or Term 1 if unnamed"},
                    "courses": {"type": "ARRAY", "items": _COURSE},
                    "credits_attempted": {"type": "NUMBER", "nullable": True},
                    "credits_earned": {"type": "NUMBER", "nullable": True},
                    "withdrawals": {"type": "INTEGER", "nullable": True},
                },
                "required": ["label"],
            },
        },
        "in_progress": {"type": "ARRAY", "items": _COURSE},
        "completed_courses": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "Every course the audit marks complete anywhere, e.g. CMSC 201",
        },
    },
    "required": ["major", "entry_type", "terms", "in_progress", "credits_required"],
}


def parse_audit(data: bytes, mime: str) -> dict | None:
    """Degree audit (PDF or image) -> AuditProfile-shaped dict. Never asked for ids or addresses."""
    if not configured():
        return None
    import base64

    content = _call(
        {
            "contents": [
                {
                    "parts": [
                        {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}},
                        {
                            "text": "Extract this university degree audit. Give only the student's first "
                            "name (no id numbers, emails or addresses), major, track or concentration, "
                            "whether they entered as a transfer student, residency if stated, total "
                            "credits earned and required, and courses in progress. List every completed "
                            "term in order: with its courses (course id like 'CMSC 201', credits, grade) "
                            "when shown, otherwise with the term's credits attempted, credits earned and "
                            "withdrawals. Keep numbered terms as 'Term 1', 'Term 2'. Also list every course "
                            "the audit marks complete anywhere (for example a checked requirement)."
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
                "responseSchema": AUDIT_SCHEMA,
            },
        }
    )
    if not content:
        return None
    try:
        return json.loads("".join(p.get("text", "") for p in content["parts"] if not p.get("thought")))
    except Exception:  # noqa: BLE001
        return None


def route(question: str, context: str, tools: list[dict]) -> tuple[str, dict] | None:
    """Pick one agent tool for a student's question (function calling). None if unsure/unset."""
    if not configured():
        return None
    content = _call(
        {
            "systemInstruction": {
                "parts": [
                    {
                        "text": "You route a student's question about their degree plan to exactly one "
                        "tool. Never answer yourself. Course ids look like CMSC341. " + context
                    }
                ]
            },
            "contents": [{"role": "user", "parts": [{"text": question[:500]}]}],
            "tools": [{"functionDeclarations": tools}],
            "toolConfig": {"functionCallingConfig": {"mode": "ANY"}},
            "generationConfig": {"temperature": 0},
        },
        # routing sits in the conversation loop and has a local fallback: fail fast, never back off
        timeout=6,
        attempts=1,
    )
    if not content:
        return None
    for part in content.get("parts", []):
        call = part.get("functionCall")
        if call and call.get("name") in {t["name"] for t in tools}:
            return call["name"], dict(call.get("args") or {})
    return None
