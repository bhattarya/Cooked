"""The voice agent's tools are generated from web/lib/voice-commands.json.

These tests keep the three consumers of that catalogue honest: the ElevenLabs provisioning payload,
the browser command bus (web/lib/commands.ts) and the backend's Model Lab request schema. None of
them touches the network or needs credentials.
"""

from __future__ import annotations

import json
import re
import typing

import httpx
import pytest

from api.schemas import ModelLabRequest
from scripts import provision_elevenlabs_agent as prov

CATALOGUE = prov.load_catalogue()
COMMANDS = {c["name"]: c for c in CATALOGUE["commands"]}
PLAN = prov.build_plan(CATALOGUE, "voice_test_id")
TOOLS = {t["name"]: t["payload"]["tool_config"] for t in PLAN["tools"]}


def test_every_command_becomes_a_client_tool_with_matching_parameters():
    assert set(TOOLS) == set(COMMANDS)
    for name, cfg in TOOLS.items():
        spec = COMMANDS[name]
        assert cfg["type"] == "client"
        assert re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", cfg["name"])
        assert cfg["description"] == spec["description"]
        assert cfg["expects_response"] is True
        assert 1 <= cfg["response_timeout_secs"] <= 120
        want = spec["parameters"].get("properties", {})
        got = cfg.get("parameters", {}).get("properties", {})
        assert set(got) == set(want), name
        assert set(cfg.get("parameters", {}).get("required", [])) == set(
            spec["parameters"].get("required", [])
        ), name
        for prop, definition in want.items():
            assert got[prop]["type"] == definition["type"]
            assert got[prop]["description"] == definition["description"]
            assert got[prop].get("enum") == definition.get("enum")


def test_tools_without_arguments_send_no_parameters_block():
    for name in ("describeScreen", "nextScene", "previousScene", "runStressTest", "findRepair"):
        assert "parameters" not in TOOLS[name]


def test_agent_attaches_every_tool_and_can_receive_tool_calls():
    agent = PLAN["agent"]["conversation_config"]
    assert len(agent["agent"]["prompt"]["tool_ids"]) == len(COMMANDS)
    # Without client_tool_call the browser never hears the agent's tool requests.
    assert "client_tool_call" in agent["conversation"]["client_events"]
    assert "user_transcript" in agent["conversation"]["client_events"]
    assert agent["agent"]["prompt"]["enable_parallel_tool_calls"] is False
    assert PLAN["agent"]["platform_settings"]["auth"]["enable_auth"] is True


def test_prompt_names_every_tool_and_never_undefined_variables():
    prompt = PLAN["agent"]["conversation_config"]["agent"]["prompt"]["prompt"]
    for name in COMMANDS:
        assert re.search(rf"\b{name}\b", prompt), f"prompt never mentions {name}"
    used = set(re.findall(r"\{\{(\w+)\}\}", prompt))
    defined = set(
        PLAN["agent"]["conversation_config"]["agent"]["dynamic_variables"][
            "dynamic_variable_placeholders"
        ]
    )
    assert used <= defined, f"prompt uses variables with no default: {used - defined}"
    # The non-negotiables must survive any prompt edit.
    for phrase in ("Never invent numbers", "No Response", "synthetic", "fewer than 30"):
        assert phrase in prompt


def test_scenario_fields_match_the_backend_model_lab_schema():
    fields = {f["name"]: f for f in CATALOGUE["scenario_fields"]}
    model = ModelLabRequest.model_fields
    assert set(fields) == set(model)
    assert set(COMMANDS["setScenario"]["parameters"]["properties"]["field"]["enum"]) == set(model)
    for name, spec in fields.items():
        annotation = model[name].annotation
        if spec["kind"] == "enum":
            assert set(spec["options"]) == set(typing.get_args(annotation)), name
            continue
        bounds = {"min": None, "max": None}
        for meta in model[name].metadata:
            if getattr(meta, "ge", None) is not None:
                bounds["min"] = meta.ge
            if getattr(meta, "le", None) is not None:
                bounds["max"] = meta.le
        assert (spec["min"], spec["max"]) == (bounds["min"], bounds["max"]), name
        assert spec["kind"] == ("int" if annotation is int else "float"), name


def test_show_scene_enum_matches_scene_list():
    assert COMMANDS["showScene"]["parameters"]["properties"]["scene"]["enum"] == [
        s["id"] for s in CATALOGUE["scenes"]
    ]
    assert COMMANDS["loadSampleStudent"]["parameters"]["properties"]["which"]["enum"] == [
        s["key"] for s in CATALOGUE["samples"]
    ]


def test_typescript_command_bus_knows_every_catalogue_command():
    source = (prov.ROOT / "web" / "lib" / "commands.ts").read_text()
    for name in COMMANDS:
        assert re.search(rf"\b{name}\b", source), f"web/lib/commands.ts has no {name}"


def test_same_tool_ignores_api_defaults_but_sees_real_changes():
    desired = prov.tool_config(COMMANDS["showScene"])
    stored = {
        **desired,
        "assignments": [],
        "tool_call_sound": None,
        "parameters": {
            **desired["parameters"],
            "description": "",
            "properties": {
                "scene": {
                    **desired["parameters"]["properties"]["scene"],
                    "is_system_provided": False,
                    "allowed_values": None,
                }
            },
        },
    }
    assert prov.same_tool(stored, desired)
    assert not prov.same_tool({**stored, "description": "older wording"}, desired)
    no_args = prov.tool_config(COMMANDS["nextScene"])
    assert prov.same_tool({**no_args, "parameters": {"type": "object", "properties": {}}}, no_args)


def test_dry_run_prints_valid_json_and_never_contacts_anything(monkeypatch, capsys):
    secret = "sk_test_do_not_print_me"
    monkeypatch.setenv("ELEVENLABS_API_KEY", secret)

    def no_network(*args, **kwargs):
        raise AssertionError("--dry-run must not open an HTTP client")

    monkeypatch.setattr(httpx, "Client", no_network)
    monkeypatch.setattr(prov, "save_id", no_network)
    prov.main(["--dry-run"])
    out = capsys.readouterr()
    assert secret not in out.out and secret not in out.err
    plan = json.loads(out.out)
    assert [t["name"] for t in plan["tools"]] == list(COMMANDS)
    assert plan["agent"]["conversation_config"]["agent"]["first_message"]


@pytest.mark.parametrize("name", list(COMMANDS))
def test_slow_commands_get_a_longer_timeout(name):
    cfg = TOOLS[name]
    assert cfg["response_timeout_secs"] == (30 if COMMANDS[name]["slow"] else 10)
