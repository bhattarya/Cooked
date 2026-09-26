"""Idempotently provision COOKED's private ElevenLabs voice agent and client tools.

Run explicitly after setting ELEVENLABS_API_KEY. The generated agent ID is saved only to
the ignored root .env; never commit credentials or account-specific configuration.
"""

from __future__ import annotations

import os

import httpx
from dotenv import load_dotenv

from scripts.common import ROOT, run

BASE = "https://api.elevenlabs.io/v1/convai"
NAME = "COOKED · Synthetic Student Pathways"
PROMPT = (
    "You are COOKED, a conversational guide to the synthetic HackUMBC 2026 Career Pathways "
    "and Degree ROI dataset. For every data question, call a tool first and wait for its "
    "response. Use exploreCohort for cohort patterns and askStudent for a student who has "
    "uploaded an audit. Speak only to values, sample sizes, and caveats returned by the "
    "tool; read a personal tool answer exactly. Never invent student records, grades, "
    "employment outcomes, or causal claims. No Response means unknown. Money is nominal "
    "by year. For a personal prediction before an audit, invite the user to upload one. "
    "Keep replies brief, natural, and clear."
)


def request(client: httpx.Client, method: str, path: str, **kwargs) -> dict:
    response = client.request(method, f"{BASE}{path}", **kwargs)
    if not response.is_success:
        # Provider errors may include request details. Print only status and a short code.
        try:
            detail = response.json().get("detail", {})
            code = detail.get("status", "unknown") if isinstance(detail, dict) else "unknown"
        except ValueError:
            code = "unknown"
        raise RuntimeError(f"ElevenLabs {method} {path} returned HTTP {response.status_code} ({code})")
    return response.json()


def ensure_tool(client: httpx.Client, existing: list[dict], name: str, description: str) -> str:
    match = next((t for t in existing if t.get("tool_config", {}).get("name") == name), None)
    if match:
        return match["id"]
    body = {"tool_config": {
        "type": "client", "name": name, "description": description,
        "expects_response": True, "response_timeout_secs": 30,
        "parameters": {"type": "object", "required": ["question"], "properties": {
            "question": {"type": "string", "description": "The student's full natural-language question"},
        }},
    }}
    created = request(client, "POST", "/tools", json=body)
    return created["id"]


def save_id(agent_id: str) -> None:
    path = ROOT / ".env"
    if not path.exists():
        raise RuntimeError("Create the ignored root .env before provisioning the agent")
    lines = path.read_text().splitlines()
    entry = f"ELEVENLABS_AGENT_ID={agent_id}"
    lines = [entry if line.startswith("ELEVENLABS_AGENT_ID=") else line for line in lines]
    if not any(line.startswith("ELEVENLABS_AGENT_ID=") for line in path.read_text().splitlines()):
        lines.append(entry)
    path.write_text("\n".join(lines) + "\n")


def main() -> None:
    load_dotenv(ROOT / ".env")
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured")
    with httpx.Client(headers={"xi-api-key": key}, timeout=25) as client:
        tools = request(client, "GET", "/tools", params={"page_size": 100}).get("tools", [])
        cohort_id = ensure_tool(client, tools, "exploreCohort", "Look up a grounded aggregate comparison in the synthetic cohort and update the on-screen chart. Call for work, load, internship, major, destination, and cost questions.")
        student_id = ensure_tool(client, tools, "askStudent", "After an audit is uploaded, compute a plan-specific risk, course, what-if, drill, or repair answer and update the on-screen visual.")
        agents = request(client, "GET", "/agents", params={"page_size": 100}).get("agents", [])
        agent = next((a for a in agents if a.get("name") == NAME), None)
        if agent:
            agent_id = agent["agent_id"]
        else:
            created = request(client, "POST", "/agents/create", json={
                "name": NAME,
                "conversation_config": {
                    "agent": {
                        "first_message": "Hey, I'm COOKED. Tell me what you're planning, or ask what the synthetic data says.",
                        "language": "en",
                        "prompt": {"prompt": PROMPT, "llm": "gemini-2.5-flash", "temperature": 0.1, "tool_ids": [cohort_id, student_id]},
                    },
                    # Agents currently require the English-specific v2 Flash/Turbo family.
                    "tts": {"voice_id": os.getenv("VOICE_ID_NARRATOR", "cjVigY5qzO86Huf0OWal"), "model_id": "eleven_flash_v2"},
                    "conversation": {"max_duration_seconds": 600},
                },
                "platform_settings": {"auth": {"enable_auth": True}},
            })
            agent_id = created["agent_id"]
        save_id(agent_id)
        print(f"COOKED ElevenLabs agent ready: {agent_id}")


if __name__ == "__main__":
    run(main)
