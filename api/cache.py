"""Phase 1 checks only; backend owns cache keys, rendering and replay."""


def check_cache(conn) -> str:
    conn.execute("SELECT hash FROM app.voice_clip LIMIT 1").fetchone()
    return "ok"
