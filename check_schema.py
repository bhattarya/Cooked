import os
import httpx
from api.providers import claude, net

def check_schema():
    body = {
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": 100,
        "tools": [
            {
                "name": "extract_audit",
                "description": "Extract the student's degree audit.",
                "input_schema": claude.AUDIT_SCHEMA
            }
        ],
        "tool_choice": {"type": "tool", "name": "extract_audit"},
        "messages": [{"role": "user", "content": "Extract the audit from this dummy text."}]
    }

    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": net.key("ANTHROPIC_API_KEY") or "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }

    r = httpx.post(url, headers=headers, json=body)
    print("Status Code:", r.status_code)
    print("Response:", r.text)

if __name__ == "__main__":
    check_schema()
