"""No-op process for deployment wiring; backend owns Watchtower implementation."""

import signal
import threading


def main():
    stopped = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stopped.set())
    print("COOKED worker placeholder running; no jobs scheduled", flush=True)
    stopped.wait()


if __name__ == "__main__":
    main()
