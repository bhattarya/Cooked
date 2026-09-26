"""Real browser -> web -> API -> DB; measure the health request, not page build time."""

import os
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

from scripts.common import required, run


def main():
    web = required("DEPLOYED_WEB_URL")
    api = required("DEPLOYED_API_URL").rstrip("/") + "/healthz"
    for url in (web, api):
        if urlsplit(url).scheme != "https" and urlsplit(url).hostname not in (
            "localhost",
            "127.0.0.1",
        ):
            raise ValueError("Use HTTPS for remote smoke tests")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.getenv("PLAYWRIGHT_CHANNEL") or None)
        try:
            page = browser.new_page()
            with page.expect_response(lambda response: response.url == api) as received:
                page.goto(web, wait_until="networkidle")
            response = received.value
            body = response.json()
            if (
                response.status != 200
                or body["checks"]["database"] != "ok"
                or body["checks"]["cache"] != "ok"
            ):
                raise AssertionError("Browser health request failed")
            page.get_by_test_id("connection-status").filter(has_text="Connected.").wait_for()
            timing = response.request.timing
            elapsed = timing["responseEnd"] / 1000
            print(f"Observed browser health round trip: {elapsed:.3f}s")
            if elapsed < 0 or elapsed >= 2:
                raise AssertionError("Browser API/DB round trip did not meet the 2-second target")
            print(f"PASS browser -> API -> DB/cache-table round trip: {elapsed:.3f}s")
            print("Cached audio playback remains a backend handoff test; no clip replay claimed.")
        finally:
            browser.close()


if __name__ == "__main__":
    run(main)
