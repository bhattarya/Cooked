"""ElevenLabs text-to-speech (§9). Clips are rendered once and cached in app.voice_clip."""

from __future__ import annotations

import os
from urllib.parse import quote

from api.providers import net

VOICES = {"narrator": "VOICE_ID_NARRATOR", "coach": "VOICE_ID_COACH"}


def voice_id(voice: str) -> str | None:
    return net.key(VOICES[voice])


def configured(voice: str) -> bool:
    return bool(net.key("ELEVENLABS_API_KEY") and voice_id(voice) and os.getenv("ELEVENLABS_MODEL"))


def render(text: str, voice: str) -> bytes | None:
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
        r.raise_for_status()
        return r.content if "audio" in r.headers.get("content-type", "") else None
    except Exception:  # noqa: BLE001
        return None
