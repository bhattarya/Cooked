"""One synthetic structured-generation request; no application prompts or agents."""

import json
from time import perf_counter
from urllib.parse import quote

import httpx

from scripts.common import required, run


def main():
    model = quote(required("GEMINI_MODEL"), safe="")
    start = perf_counter()
    with httpx.Client(timeout=60) as client:
        response = client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": required("GEMINI_API_KEY")},
            json={
                "contents": [{"parts": [{"text": "Return a JSON object with status set to ok."}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "OBJECT",
                        "properties": {"status": {"type": "STRING", "enum": ["ok"]}},
                        "required": ["status"],
                    },
                },
            },
        )
        response.raise_for_status()
    parts = response.json()["candidates"][0]["content"]["parts"]
    result = json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))
    if result != {"status": "ok"}:
        raise AssertionError("Unexpected structured response")
    print(f"PASS Gemini JSON generation: {perf_counter() - start:.3f}s")


if __name__ == "__main__":
    run(main)
