"""Create a working local .env for development: python -m scripts.bootstrap_env

Copies .env.example, generates separate random passwords for the owner, app_rw and agent_ro
database roles and a session signing secret (AUTH_SECRET),
points all three URLs at the local Docker database (picking a free port if 5432
is taken), and leaves provider keys blank. Never overwrites an existing .env.
"""

from __future__ import annotations

import re
import secrets
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def free_port(preferred: int = 5432) -> int:
    for port in [preferred, *range(55432, 55532)]:
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise SystemExit("No free local port for Postgres; set POSTGRES_PORT in .env yourself")


def main() -> None:
    env = ROOT / ".env"
    if env.exists():
        text = env.read_text()
        if not re.search(r"^AUTH_SECRET=.{32,}$", text, flags=re.MULTILINE):
            # sessions need a signing secret; add one without touching anything else
            text = re.sub(r"^AUTH_SECRET=.*\n?", "", text, flags=re.MULTILINE).rstrip("\n")
            env.write_text(text + f"\nAUTH_SECRET={secrets.token_hex(32)}\n")
            print(".env exists; added a generated AUTH_SECRET")
        else:
            print(".env already exists; leaving it untouched")
        return
    text = (ROOT / ".env.example").read_text()
    owner, app, agent = (secrets.token_hex(16) for _ in range(3))
    port = free_port()
    url = f"localhost:{port}/cooked?sslmode=disable"
    values = {
        "DATABASE_URL": f"postgresql://owner:{owner}@{url}",
        "DATABASE_URL_APP": f"postgresql://app_rw:{app}@{url}",
        "DATABASE_URL_AGENT": f"postgresql://agent_ro:{agent}@{url}",
        "POSTGRES_PASSWORD": owner,
        "POSTGRES_PORT": str(port),
        "NEXT_PUBLIC_API_URL": "http://localhost:8000",
        "CORS_ORIGINS": "http://localhost:3000",
        "AUTH_SECRET": secrets.token_hex(32),
    }
    for key, value in values.items():
        text, n = re.subn(rf"^{key}=.*$", f"{key}={value}", text, flags=re.MULTILINE)
        if not n:
            text += f"\n{key}={value}"
    env.write_text(text)
    env.chmod(0o600)
    print(f"Created .env (Postgres on localhost:{port}, generated role passwords, provider keys blank)")


if __name__ == "__main__":
    sys.exit(main())
