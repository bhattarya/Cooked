"""ElevenLabs text-to-speech (§9). Clips are rendered once and cached in app.voice_clip."""

from __future__ import annotations

import os
from urllib.parse import quote

from api.providers import net

VOICES = {"narrator": "VOICE_ID_NARRATOR", "coach": "VOICE_ID_COACH"}
_denied = False  # set when ElevenLabs rejects the key, so health and the UI stop claiming voice
usage = {"clips": 0, "characters_billed": 0}  # from the character-cost response header


def denied() -> bool:
    return _denied


def voice_id(voice: str) -> str | None:
    return net.key(VOICES[voice])


def configured(voice: str) -> bool:
    return not _denied and bool(net.key("ELEVENLABS_API_KEY") and voice_id(voice) and os.getenv("ELEVENLABS_MODEL"))


def render(text: str, voice: str) -> bytes | None:
    global _denied
    if not configured(voice):
        return None
    try:
        r = net.request(
            "POST",
            f"https://api.elevenlabs.io/v1/text-to-speech/{quote(voice_id(voice), safe='')}",
            params={"output_format": "mp3_44100_128"},
            headers={"xi-api-key": net.key("ELEVENLABS_API_KEY")},
            json={"text": text, "model_id": os.getenv("ELEVENLABS_MODEL")},
            timeout=90,
        )
        if r.status_code in (401, 403):
            _denied = True  # e.g. a restricted key without text-to-speech permission
            return None
        r.raise_for_status()
        if "audio" not in r.headers.get("content-type", ""):
            return None
        # ElevenLabs reports what each render cost against the plan's character quota
        usage["clips"] += 1
        usage["characters_billed"] += int(r.headers.get("character-cost") or len(text))
        return r.content
    except Exception:  # noqa: BLE001
        return None
