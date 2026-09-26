"""Check configured deployed endpoints over verified HTTPS, including redirects."""

from urllib.parse import urlsplit

import httpx

from scripts.common import required, run


def main():
    with httpx.Client(timeout=15, follow_redirects=False) as client:
        for name, suffix in (("DEPLOYED_API_URL", "/healthz"), ("DEPLOYED_WEB_URL", "/")):
            url = required(name).rstrip("/") + suffix
            if urlsplit(url).scheme != "https":
                raise ValueError("Deployed URLs must use HTTPS")
            response = client.get(url)
            if response.status_code != 200:
                raise AssertionError("HTTPS endpoint did not return 200 directly")
            if name == "DEPLOYED_API_URL":
                body = response.json()
                if body["status"] != "ok" or body["checks"]["database"] != "ok":
                    raise AssertionError("Deployed database is not healthy")
            elif "COOKED" not in response.text:
                raise AssertionError("Expected COOKED web page")
            print(f"PASS {name}: HTTPS 200")
    print(
        "Phone check still required: open both URLs on cellular data and record in SETUP_STATUS.md"
    )


if __name__ == "__main__":
    run(main)
