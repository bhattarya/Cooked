"""Provenance rule (§8.4): the language model never writes a number.

Every figure a user sees comes from a recorded tool result. Narration is assembled from
segments: plain text (which may contain no digits) and value tokens that carry the id of the
tool result they came from. `check` enforces this for every script before it is shown.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import OrderedDict

_REGISTRY: OrderedDict[str, dict] = OrderedDict()
_MAX = 20_000
DIGIT = re.compile(r"\d")
SLOT = re.compile(r"\{\{(t\d+)\}\}")


def record(tool: str, args: dict, data: dict | None = None, version: str = "") -> str:
    key = json.dumps({"tool": tool, "args": args, "v": version}, sort_keys=True, default=str)
    tr = "tr_" + hashlib.sha256(key.encode()).hexdigest()[:10]
    _REGISTRY[tr] = {"tool": tool, "args": args, "data": data or {}}
    _REGISTRY.move_to_end(tr)
    while len(_REGISTRY) > _MAX:
        _REGISTRY.popitem(last=False)
    return tr


def lookup(tr: str) -> dict | None:
    return _REGISTRY.get(tr)


def check(segments: list[dict]) -> dict:
    """ok only if no text segment holds a digit and every token maps to a known tool result."""
    stray = [s["text"] for s in segments if "text" in s and DIGIT.search(s["text"])]
    unknown = [s["tool_result_id"] for s in segments if "value" in s and s["tool_result_id"] not in _REGISTRY]
    tokens = sum(1 for s in segments if "value" in s)
    return {"tokens": tokens, "stray": stray, "unknown": unknown, "ok": not stray and not unknown}


def fill(text: str, slots: dict[str, tuple[str, str]], required: set[str]) -> list[dict] | None:
    """Turn LLM text with {{tN}} placeholders into segments; None if it breaks any rule."""
    used = set(SLOT.findall(text))
    if not used <= set(slots) or not required <= used:
        return None
    out: list[dict] = []
    pos = 0
    for m in SLOT.finditer(text):
        if m.start() > pos:
            out.append({"text": text[pos : m.start()]})
        value, tr = slots[m.group(1)]
        out.append({"value": value, "tool_result_id": tr})
        pos = m.end()
    if pos < len(text):
        out.append({"text": text[pos:]})
    return out if check(out)["ok"] else None
