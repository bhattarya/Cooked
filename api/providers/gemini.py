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


DEFAULT_MODELS = "gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview,gemini-3.1-flash-lite"


def configured() -> bool:
    return bool(net.key("GEMINI_API_KEY") and os.getenv("GEMINI_MODEL"))


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", "")


def model_chain() -> list[str]:
    """GEMINI_MODEL first, then GEMINI_MODELS (comma list), deduped, falling back to defaults."""
    primary = model_name()
    extra = [m.strip() for m in os.getenv("GEMINI_MODELS", DEFAULT_MODELS).split(",") if m.strip()]
    seen, out = set(), []
    for m in ([primary] if primary else []) + extra:
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out


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


def _post_model(model: str, body: dict, timeout: float) -> tuple[dict | None, str | None]:
    """One attempt against one model. Returns (json, None) or (None, reason) where reason is
    'retry' (try the next model / caller may retry same request), 'timeout' or None (hard fail,
    don't bother with the rest of the chain)."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model, safe='')}:generateContent"
    try:
        r = net.request("POST", url, headers={"x-goog-api-key": net.key("GEMINI_API_KEY")}, json=body, timeout=timeout)
    except Exception as exc:  # noqa: BLE001 -- includes httpx timeouts
        return None, "timeout" if "imeout" in type(exc).__name__ else "retry"
    if r.status_code == 429 or r.status_code >= 500 or r.status_code == 404:
        return None, "retry"
    try:
        r.raise_for_status()
    except Exception:  # noqa: BLE001
        return None, None
    return r.json(), None


def _post_chain(body: dict, per_attempt_timeout: float = 25, total_budget: float = 45) -> tuple[dict | None, str | None]:
    """Try each model in `model_chain()` in order, advancing on 429/404/5xx/timeout, until the
    total time budget runs out. Returns (json, None) or (None, 'timeout'|'busy'|'unreadable')."""
    import time

    deadline = time.monotonic() + total_budget
    last_reason = "unreadable"
    for model in model_chain():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return None, "timeout"
        out, reason = _post_model(model, body, timeout=min(per_attempt_timeout, remaining))
        if out is not None:
            return out, None
        last_reason = "timeout" if reason == "timeout" else "busy" if reason == "retry" else "unreadable"
    return None, last_reason


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


AUDIT_PROMPT = (
    "Extract this university degree audit. Give only the student's first "
    "name (no id numbers, emails or addresses), major, track or concentration, "
    "whether they entered as a transfer student, residency if stated, total "
    "credits earned and required, and courses in progress. List every completed "
    "term in order: with its courses (course id like 'CMSC 201', credits, grade) "
    "when shown, otherwise with the term's credits attempted, credits earned and "
    "withdrawals. Keep numbered terms as 'Term 1', 'Term 2'. Also list every course "
    "the audit marks complete anywhere (for example a checked requirement)."
)


def parse_audit_ex(data: bytes, mime: str) -> tuple[dict | None, str | None]:
    """Degree audit (PDF or image) -> (AuditProfile-shaped dict, None) or (None, reason), where
    reason is 'timeout' | 'busy' | 'unreadable'. Falls back across `model_chain()`; thinking is
    disabled (extraction needs no chain-of-thought and it only adds latency/quota use)."""
    if not configured():
        return None, "unconfigured"
    import base64

    body = {
        "contents": [
            {
                "parts": [
                    {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}},
                    {"text": AUDIT_PROMPT},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": AUDIT_SCHEMA,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    out, reason = _post_chain(body, per_attempt_timeout=25, total_budget=45)
    if out is None:
        return None, reason
    try:
        content = out["candidates"][0]["content"]
        return json.loads("".join(p.get("text", "") for p in content["parts"] if not p.get("thought"))), None
    except Exception:  # noqa: BLE001
        return None, "unreadable"


def parse_audit(data: bytes, mime: str) -> dict | None:
    """Back-compat wrapper over `parse_audit_ex` for other callers (routing, narration tests)."""
    parsed, _ = parse_audit_ex(data, mime)
    return parsed


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
