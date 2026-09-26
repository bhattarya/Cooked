"""Render exactly 200 characters, save audio, and report subscription credit-counter delta."""

from urllib.parse import quote

import httpx

from scripts.common import ROOT, required, run


def main():
    text = (
        "This is a synthetic COOKED audio check. No real student information is used. "
        "Listen for a clear and calm voice while we verify playback and record the service usage. "
    )
    text = (text + "The audio check is complete. " * 3)[:200]
    with httpx.Client(
        base_url="https://api.elevenlabs.io/v1/",
        timeout=90,
        headers={"xi-api-key": required("ELEVENLABS_API_KEY")},
    ) as client:
        before = client.get("user/subscription")
        before.raise_for_status()
        response = client.post(
            "text-to-speech/" + quote(required("VOICE_ID_NARRATOR"), safe=""),
            params={"output_format": "mp3_44100_128"},
            json={"text": text, "model_id": required("ELEVENLABS_MODEL")},
        )
        response.raise_for_status()
        if not response.content or "audio" not in response.headers.get("content-type", ""):
            raise AssertionError("Expected audio bytes")
        path = ROOT / "data/smoke/elevenlabs.mp3"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(response.content)
        after = client.get("user/subscription")
        after.raise_for_status()
    delta = after.json()["character_count"] - before.json()["character_count"]
    print(f"Rendered 200 characters; usage-counter delta={delta}; bytes={len(response.content)}")
    print(
        "Saved data/smoke/elevenlabs.mp3. Listen manually; concurrent account use can affect delta."
    )


if __name__ == "__main__":
    run(main)
