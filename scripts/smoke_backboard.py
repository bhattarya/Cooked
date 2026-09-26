"""Prove recall across distinct threads; no product assistant/prompt implementation."""

from time import perf_counter, sleep
from uuid import uuid4

import httpx

from scripts.common import required, run


def main():
    base = required("BACKBOARD_BASE_URL").rstrip("/")
    if base != "https://app.backboard.io/api":
        raise ValueError("Smoke test only sends credentials to the documented provider URL")
    marker = "violet-orbit-" + uuid4().hex[:12]
    started = perf_counter()
    with httpx.Client(
        base_url=base + "/", headers={"X-API-Key": required("BACKBOARD_API_KEY")}, timeout=90
    ) as client:
        response = client.post("assistants", json={"name": "COOKED synthetic smoke test"})
        response.raise_for_status()
        assistant = response.json()["assistant_id"]
        print("Created temporary smoke assistant; cleanup runs on exit")
        try:
            a = client.post(
                "threads/messages",
                json={
                    "assistant_id": assistant,
                    "memory": "Auto",
                    "stream": False,
                    "content": f"Remember this synthetic project's mascot code exactly: {marker}.",
                },
            )
            a.raise_for_status()
            thread_a = a.json()["thread_id"]
            # Memory extraction is asynchronous. Bounded retries do not seed the answer in thread B.
            for attempt in range(3):
                sleep(5)
                b = client.post(
                    "threads/messages",
                    json={
                        "assistant_id": assistant,
                        "memory": "Readonly",
                        "stream": False,
                        "content": "What is this synthetic project's mascot code? Reply with the exact code.",
                    },
                )
                b.raise_for_status()
                body = b.json()
                if body["thread_id"] == thread_a:
                    raise AssertionError("Recall test did not create a distinct thread")
                if marker in body.get("content", ""):
                    print(f"PASS Backboard cross-thread recall: {perf_counter() - started:.3f}s")
                    return
            raise AssertionError("Memory not recalled within three attempts")
        finally:
            deleted = client.delete(f"assistants/{assistant}")
            deleted.raise_for_status()
            print("Deleted temporary assistant and threads")


if __name__ == "__main__":
    run(main)
