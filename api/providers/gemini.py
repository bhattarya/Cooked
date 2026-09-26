"""Gemini (§8.5): writes calm prose around number placeholders. It never sees a number to write.

The model receives slots like {{t1}} with a *description* of each value, not the value itself,
must return JSON matching a schema, and must use only known slots. Anything else is rejected
and the deterministic template is used instead.
"""

from __future__ import annotations

import json
import os
import re
from urllib.parse import quote

from api.providers import net

SLOT = re.compile(r"\{\{(t\d+)\}\}")

SYSTEM = (
    "You write two or three short sentences for a student, in the calm, specific voice of an "
    "incident report: what happened, what it means, what to do next. You never write digits or "
    "number words. Every quantity must be one of the provided slots, written exactly like "
    "{{t1}}. Use each required slot once. No advice beyond the facts given. No blame."
)


def configured() -> bool:
    return bool(net.key("GEMINI_API_KEY") and os.getenv("GEMINI_MODEL"))


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", "")


def write(kind: str, facts: str, slots: dict[str, str]) -> str | None:
    """Returns text containing {{tN}} placeholders, or None on any failure."""
    if not configured():
        return None
    slot_lines = "\n".join(f"{{{{{k}}}}}: {desc}" for k, desc in slots.items())
    prompt = f"{SYSTEM}\n\nMessage type: {kind}\nFacts: {facts}\nSlots:\n{slot_lines}"
    try:
        r = net.request(
            "POST",
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(model_name(), safe='')}:generateContent",
            headers={"x-goog-api-key": net.key("GEMINI_API_KEY")},
            json={
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
        r.raise_for_status()
        parts = r.json()["candidates"][0]["content"]["parts"]
        body = json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))
        return str(body["script"])
    except Exception:  # noqa: BLE001 -- provider failures fall back to the template
        return None


def _call(body: dict) -> dict | None:
    try:
        r = net.request(
            "POST",
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(model_name(), safe='')}:generateContent",
            headers={"x-goog-api-key": net.key("GEMINI_API_KEY")},
            json=body,
            timeout=90,
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]
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
                    "label": {"type": "STRING", "description": "e.g. Fall 2024"},
                    "courses": {"type": "ARRAY", "items": _COURSE},
                },
                "required": ["label", "courses"],
            },
        },
        "in_progress": {"type": "ARRAY", "items": _COURSE},
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
                            "credits earned and required, every completed Fall or Spring term with its "
                            "courses (course id like 'CMSC 201', credits, grade), and courses in progress."
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
        }
    )
    if not content:
        return None
    for part in content.get("parts", []):
        call = part.get("functionCall")
        if call and call.get("name") in {t["name"] for t in tools}:
            return call["name"], dict(call.get("args") or {})
    return None
