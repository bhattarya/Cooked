"""Idempotently provision COOKED's private ElevenLabs voice agent and its client tools.

The agent is a hands-free CONTROLLER of the web app: every command the app can perform is a
client tool, generated from web/lib/voice-commands.json (the same catalogue the browser's command
bus validates against), so the agent can never call something the app does not define.

    python -m scripts.provision_elevenlabs_agent --dry-run   # print the payloads; contacts nothing
    python -m scripts.provision_elevenlabs_agent             # create or update the tools and agent

Run for real only after reviewing the dry run: it modifies the live ElevenLabs agent. The generated
agent ID is saved only to the ignored root .env; never commit credentials or account config.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import httpx
from dotenv import load_dotenv

from scripts.common import ROOT, run

BASE = "https://api.elevenlabs.io/v1/convai"
CATALOGUE = ROOT / "web" / "lib" / "voice-commands.json"
NAME = "COOKED · Synthetic Student Pathways"
FIRST_MESSAGE = "Hey! I'm COOKED. Ask me anything about your degree path, or just tell me what you want to see."

# Values the web app passes at session start (startSession dynamicVariables) and refreshes with
# contextual updates. The placeholders keep a session valid if a client omits them.
DYNAMIC_VARIABLES = {
    "screen_scene": "none",
    "screen_summary": "nothing is showing yet",
    "student_loaded": "no",
}

# client_tool_call is what lets the agent act in the browser; tentative_user_transcript feeds live captions.
CLIENT_EVENTS = [
    "conversation_initiation_metadata",
    "ping",
    "audio",
    "interruption",
    "user_transcript",
    "tentative_user_transcript",
    "agent_response",
    "agent_response_correction",
    "client_tool_call",
    "agent_tool_response",
]

PROMPT = """\
# Who you are
You are COOKED: a warm, candid, quick-witted friend who happens to be great with data. You talk with a student about their degree path, and you DRIVE the app: when they ask something the screen changes, and you tell them what happened like a person would. You are on the synthetic HackUMBC 2026 Career Pathways and Degree ROI dataset.

# How you sound
- Talk like a person on a call, not a report. Use contractions. Short turns: one or two sentences, and now and then a natural follow-up question when it helps ("want me to see what would fix it?"). Do not end every turn with a question.
- React to what the news means, without inventing anything: "oof, that's rough", "okay, that's actually good news", "huh, interesting". Then give the substance.
- Acknowledge before you act when it will take a moment: "sure, let me pull that up", "one sec". Then call the tool. Never narrate tool names or say "I will call".
- Say numbers the way people do: "about ninety-six percent", "roughly seven and a half years", "around forty-one thousand dollars". Never read ids, decimals, units or symbols out awkwardly. Stay faithful: round only in speech, never change the value.
- Remember the person's name if they give it and use it sparingly. Remember what they told you earlier in this conversation (their major, their job hours) and refer back to it naturally.
- If they interrupt, stop at once and follow them. If they correct you ("no, I meant three"), just say "got it" and redo it without fuss. If you are not sure what they meant, ask one short question. If you do not know something, say so plainly.
- Plain speech only: no lists, no markdown, no emoji, no stage directions. A light laugh or an "hmm" is fine when it is natural.

# What is on screen right now
Scene: {{screen_scene}}. Student loaded: {{student_loaded}}. {{screen_summary}}
You receive "SCREEN:" updates whenever this changes; the latest one is the truth. Before you quote anything you did not just get back from a tool, call describeScreen.

# Golden rules
1. Act first, talk second. For anything about the screen, the student, the cohort, the models or any number, call a tool FIRST and wait for the result. Never answer such a question from memory.
2. Every tool result is JSON. Say its `say` text in your own natural voice and keep every number, name and caveat exactly right. Add nothing numeric. If `ok` is false or the tool refused, say plainly what is missing or that it declined, and offer the fix (for example loading a sample student). Never work around a refusal.
3. Never invent numbers, courses, names, percentages, salaries or outcomes. If neither a tool result nor a SCREEN line contains it, say you do not have it and offer to look it up.
4. Do not draw your own conclusions from the numbers (no "so that means it will get worse"). Say what the tool said, add at most a human reaction, and offer to look deeper.
5. If the user only says "okay", "mm-hmm" or "right", stay quiet.

# Which tool for what
- askAnything is your DEFAULT for any question, in the user's own words: about their audit ("am I cooked", "what if I take three more credits a term", "which course should I take"), the cohort ("do internships help"), the models ("which model is best") or the advisor queue ("who needs a call first"). The app opens the right screen and answers. If it says a student is needed, offer a sample student and call loadSampleStudent when they agree or ask.
- Use the specific tools only for precise actions: showScene ("show me / go to / open <scene>"; scenes: home, risk, timeline, twins, drill, repair, careers, receipt, models, constellation, arena, cards, explore, advisor; "the receipt" is exactly what the models read from the audit), nextScene ("next", "continue"), previousScene ("back"), setScenario ("set work hours to thirty", "make it a transfer student"; fields: major, entry_type, residency, work_hours, completed_terms, credits_per_term, earned_ratio, withdrawals, failures, enrollment_gaps, internship_count, credential_count, engagement_count), runStressTest ("what could go wrong"), findRepair ("how do I get un-cooked"), loadSampleStudent.
- askStudent and exploreCohort still work for a purely personal or purely cohort question, but prefer askAnything.
- describeScreen only for "what am I looking at" and before quoting something on the screen. Never use it to answer a question: that is askAnything.
- You may chain tools, for example showScene then describeScreen, but wait for each result before the next.

# Honesty
- The data is synthetic, not real students. Say so briefly when someone might mistake it for real, and when giving a prediction.
- "No Response" in the data means unknown, never an outcome. Money is nominal dollars for its year.
- Career and salary outputs are exploratory associations, not promises or causal claims.
- COOKED refuses to guess when fewer than 30 similar alumni exist. If a tool says it refused, say so and do not fill the gap.
- Never give financial, medical or legal advice.
"""

LLM = "claude-haiku-4-5"
TTS_MODEL = "eleven_v3_conversational"
DEFAULT_VOICE = "iP95p4xoKVk53GoZ742B"  # Chris: charming, down-to-earth, casual
IGNORE_TERMS = ["mm-hmm", "uh-huh", "hmm", "yeah", "yep", "okay", "ok", "right", "sure", "got it", "i see", "cool"]
AUDIO_TAGS = [
    {"tag": "laughs softly", "description": "a light laugh at something genuinely funny"},
    {"tag": "sighs", "description": "sympathy when the news is rough"},
    {"tag": "thoughtful", "description": "while weighing a result"},
    {"tag": "relieved", "description": "when the news is good"},
    {"tag": "warm", "description": "reassuring the student"},
]

ASR_KEYWORDS = [
    "COOKED",
    "twins",
    "stress test",
    "internships",
    "withdrawals",
    "un-cooked",
    "Model Lab",
    "control room",
    "constellation",
    "advisor",
    "credits per term",
]


def load_catalogue() -> dict:
    return json.loads(CATALOGUE.read_text())


def literal_property(spec: dict) -> dict:
    """One tool parameter in ElevenLabs' LiteralJsonSchemaProperty shape."""
    prop = {"type": spec["type"], "description": spec["description"]}
    if spec.get("enum"):
        prop["enum"] = list(spec["enum"])
    return prop


def tool_config(command: dict) -> dict:
    slow = bool(command.get("slow"))
    config: dict = {
        "type": "client",
        "name": command["name"],
        "description": command["description"],
        # The app answers with the numbers to speak, so the agent waits for the result.
        "expects_response": True,
        "response_timeout_secs": 30 if slow else 10,
        "execution_mode": "immediate",
        "interruption_mode": "allow",
        # Instant UI moves need no "let me do that" filler; slow model calls may get one.
        "pre_tool_speech": "auto" if slow else "off",
    }
    properties = command["parameters"].get("properties", {})
    if properties:
        config["parameters"] = {
            "type": "object",
            "required": list(command["parameters"].get("required", [])),
            "properties": {name: literal_property(spec) for name, spec in properties.items()},
        }
    return config


def agent_payload(tool_ids: list[str], voice_id: str) -> dict:
    return {
        "name": NAME,
        "conversation_config": {
            "agent": {
                "first_message": FIRST_MESSAGE,
                "language": "en",
                "dynamic_variables": {"dynamic_variable_placeholders": DYNAMIC_VARIABLES},
                "prompt": {
                    "prompt": PROMPT,
                    "llm": LLM,
                    # Warm enough to sound like a person; tool arguments stay stable because the
                    # catalogue's enums and the bus validator constrain them.
                    "temperature": 0.6,
                    "tool_ids": tool_ids,
                    # Sequential calls: showScene must land before describeScreen reads the screen.
                    "enable_parallel_tool_calls": False,
                },
            },
            "asr": {"keywords": ASR_KEYWORDS},
            "turn": {
                "turn_eagerness": "normal",
                # Start the LLM during the pause so replies land faster.
                "speculative_turn": True,
                # A hands-free controller should not nag during a long look at a chart.
                "turn_timeout": 30,
                "silence_end_call_timeout": -1,
                "interruption_ignore_terms": IGNORE_TERMS,
                # A quick human filler while the model or a tool is slow, instead of dead air.
                "soft_timeout_config": {
                    "timeout_seconds": 2.5,
                    "message": "Hmm, one sec.",
                    "additional_soft_timeout_messages": ["Still on it.", "Almost there."],
                    "randomize_fillers": False,
                    "max_soft_timeouts_per_generation": 3,
                    "disable_until_first_user_message": True,
                },
            },
            "tts": {
                "voice_id": voice_id,
                "model_id": TTS_MODEL,
                # Expressive v3 conversational reads emotion from the text (laughs, sighs, emphasis).
                "expressive_mode": True,
                "suggested_audio_tags": AUDIO_TAGS,
                "stability": 0.45,
                "similarity_boost": 0.8,
                "speed": 1.0,
            },
            "conversation": {"max_duration_seconds": 900, "client_events": CLIENT_EVENTS},
        },
        "platform_settings": {"auth": {"enable_auth": True}},
    }


def build_plan(catalogue: dict, voice_id: str, tool_ids: dict[str, str] | None = None) -> dict:
    """Everything that would be sent, with placeholders for tool ids that do not exist yet."""
    ids = tool_ids or {}
    commands = catalogue["commands"]
    return {
        "tools": [
            {"name": c["name"], "payload": {"tool_config": tool_config(c)}} for c in commands
        ],
        "agent": agent_payload(
            [ids.get(c["name"], f"<id of tool {c['name']}>") for c in commands], voice_id
        ),
    }


def request(client: httpx.Client, method: str, path: str, **kwargs) -> dict:
    response = client.request(method, f"{BASE}{path}", **kwargs)
    if not response.is_success:
        # Provider errors may include request details. Print only status and a short code.
        try:
            detail = response.json().get("detail", {})
            code = detail.get("status", "unknown") if isinstance(detail, dict) else "unknown"
        except ValueError:
            code = "unknown"
        raise RuntimeError(
            f"ElevenLabs {method} {path} returned HTTP {response.status_code} ({code})"
        )
    return response.json()


def _param_view(parameters: dict | None) -> dict:
    properties = (parameters or {}).get("properties") or {}
    if not properties:
        return {}
    return {
        "required": sorted(parameters.get("required") or []),
        "properties": {
            name: {
                "type": p.get("type"),
                "description": p.get("description", ""),
                "enum": p.get("enum") or None,
            }
            for name, p in properties.items()
        },
    }


def same_tool(existing: dict, desired: dict) -> bool:
    """Compare only the fields this script manages; the API adds many defaulted fields."""
    keys = (
        "description",
        "expects_response",
        "response_timeout_secs",
        "execution_mode",
        "interruption_mode",
        "pre_tool_speech",
    )
    return all(existing.get(k) == desired.get(k) for k in keys) and _param_view(
        existing.get("parameters")
    ) == _param_view(desired.get("parameters"))


def ensure_tool(client: httpx.Client, existing: list[dict], command: dict) -> tuple[str, str]:
    desired = tool_config(command)
    match = next(
        (t for t in existing if t.get("tool_config", {}).get("name") == command["name"]), None
    )
    if not match:
        created = request(client, "POST", "/tools", json={"tool_config": desired})
        return created["id"], "created"
    if same_tool(match["tool_config"], desired):
        return match["id"], "unchanged"
    request(client, "PATCH", f"/tools/{match['id']}", json={"tool_config": desired})
    return match["id"], "updated"


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


def provision() -> None:
    load_dotenv(ROOT / ".env")
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured")
    catalogue = load_catalogue()
    voice_id = os.getenv("VOICE_ID_AGENT", DEFAULT_VOICE)
    with httpx.Client(headers={"xi-api-key": key}, timeout=25) as client:
        existing = request(client, "GET", "/tools", params={"page_size": 100}).get("tools", [])
        tool_ids: dict[str, str] = {}
        for command in catalogue["commands"]:
            tool_ids[command["name"]], outcome = ensure_tool(client, existing, command)
            print(f"tool {command['name']}: {outcome}")
        agents = request(client, "GET", "/agents", params={"page_size": 100}).get("agents", [])
        agent = next((a for a in agents if a.get("name") == NAME), None)
        payload = agent_payload([tool_ids[c["name"]] for c in catalogue["commands"]], voice_id)
        if agent:
            agent_id = agent["agent_id"]
            request(client, "PATCH", f"/agents/{agent_id}", json=payload)
            print("agent: updated")
        else:
            agent_id = request(client, "POST", "/agents/create", json=payload)["agent_id"]
            print("agent: created")
        save_id(agent_id)
        print(f"COOKED ElevenLabs agent ready: {agent_id}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the payloads that would be sent; contacts nothing and needs no key",
    )
    args = parser.parse_args(argv)
    if args.dry_run:
        plan = build_plan(load_catalogue(), os.getenv("VOICE_ID_AGENT", DEFAULT_VOICE))
        print(
            "DRY RUN: nothing was sent to ElevenLabs. Tools are POSTed when missing and PATCHed when they differ; the agent is created or PATCHed by name.",
            file=sys.stderr,
        )
        json.dump(plan, sys.stdout, indent=2, ensure_ascii=False)
        print()
        return
    provision()


if __name__ == "__main__":
    run(main)
