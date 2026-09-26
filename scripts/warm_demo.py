"""Pre-render the demo path: python -m scripts.warm_demo  (make warm)

For each sample student in the workspace: the spoken lines, the alarm narration (Gemini's version
when the quota allows, otherwise the traced template) and the answers to every suggestion chip.
Each text is voiced once with ElevenLabs and stored in app.voice_clip, so the demo replays
instantly and survives a provider outage. Re-running only pays for texts not cached yet.
"""

from __future__ import annotations

import re

from api import agent
from api.engine import get_engine
from api.providers import elevenlabs, gemini
from scripts.common import run

# must match SAMPLES in web/components/agent/Workspace.tsx
SAMPLES = ["CID-510094", "CID-137153", "CID-104853"]
QUESTIONS = [
    "Am I cooked?",
    "What if I take 3 more credits a term?",
    "What if I work 10 hours a week?",
    "Stress test my plan",
    "How do I get un-cooked?",
]


def course_question(engine, cid: str) -> str:
    """Same suggestion the workspace builds from the catalog check."""
    picks = (engine.repair(cid).get("primary") or {}).get("feasibility", {}).get("picks", [])
    ids = [p["course_id"] for p in picks if re.match(r"^(CMSC|IS)", p["course_id"])]
    if len(ids) >= 2:
        return f"What if I take {ids[1]} instead of {ids[0]}?"
    return f"Can I take {ids[0]} next term?" if ids else "Can I take CMSC341 next term?"


def main():
    engine = get_engine()
    texts: list[tuple[str, str, str]] = []
    for line in ("greeting", "thanks", "ask_work", "ready"):
        texts.append((f"line:{line}", agent.say(engine, line, None)["text"], "narrator"))
    for cid in SAMPLES:
        terms = engine.people.terms_of(cid)
        load = round(float(terms[:, 0].mean())) if len(terms) else 15
        engine.narrate("alarm", cid, None, None, wait=True)  # let Gemini write + cache if it can
        n = engine.narrate("alarm", cid, None, None, wait=False)
        texts.append((f"{cid} alarm ({n['source']})", n["text"], "narrator"))
        for q in [*QUESTIONS, course_question(engine, cid)]:
            a = agent.ask(engine, cid, q, None, load)
            texts.append((f"{cid} {q}", a["text"], "coach" if a["tool"] == "find_fix" else "narrator"))

    print(f"Gemini {'on' if gemini.configured() else 'off'} · ElevenLabs {'on' if elevenlabs.configured('narrator') else 'off'}")
    counts = {"elevenlabs": 0, "cache": 0, "unavailable": 0}
    for label, text, voice in texts:
        r = engine.voice(text, voice)
        counts[r["source"]] = counts.get(r["source"], 0) + 1
        print(f"  {r['source']:<11} {voice:<8} {label[:70]}")
    print(
        f"Warmed {len(texts)} texts: {counts['elevenlabs']} rendered, {counts['cache']} already cached, "
        f"{counts['unavailable']} without voice · credits billed this run: {elevenlabs.usage['characters_billed']}"
    )


if __name__ == "__main__":
    run(main)
