"""End-to-end demo check in a real browser: python -m scripts.e2e_demo

Drives the §15 demo path against a running web app and API and fails on any broken step or
browser console error. Screenshots go to data/smoke/e2e-*.png (ignored by git).

Env: E2E_WEB_URL (default http://localhost:3000), E2E_API_URL (default http://localhost:8000).
"""

from __future__ import annotations

import os
import re
import time

from playwright.sync_api import Page, expect, sync_playwright

from scripts.common import ROOT

WEB = os.getenv("E2E_WEB_URL", "http://localhost:3000").rstrip("/")
API = os.getenv("E2E_API_URL", "http://localhost:8000").rstrip("/")
SHOTS = ROOT / "data/smoke"
T = 30_000

results: list[tuple[str, bool, str]] = []


def step(name: str):
    def wrap(fn):
        def run(*a, **k):
            t0 = time.perf_counter()
            try:
                detail = fn(*a, **k) or ""
                results.append((name, True, f"{detail} ({time.perf_counter() - t0:.1f}s)"))
            except Exception as exc:  # noqa: BLE001 -- report every step, then fail at the end
                results.append((name, False, f"{type(exc).__name__}: {str(exc).splitlines()[0][:160]}"))

        return run

    return wrap


def watch_console(page: Page, errors: list[str]):
    page.on("console", lambda m: m.type == "error" and errors.append(m.text[:200]))
    page.on("pageerror", lambda e: errors.append(f"pageerror: {str(e)[:200]}"))


def body(page: Page) -> str:
    return page.locator("body").inner_text()


def tab(page: Page, name: str):
    page.get_by_role("button", name=re.compile(rf"^0\d\s*{name}$")).click()


@step("API health: trained models loaded, gates passed")
def api_health(page: Page):
    r = page.request.get(f"{API}/healthz")
    h = r.json()
    assert r.status == 200 and h["mode"] == "models", h
    assert h["checks"] == {"database": "ok", "artifact_checksum": "ok", "cache": "ok"}, h["checks"]
    return h["model_version"]


@step("Landing: three model-verified demo students")
def landing(page: Page):
    page.goto(WEB, wait_until="domcontentloaded")
    cards = page.locator('a[href^="/s/CID-"]')
    expect(cards).to_have_count(3, timeout=T)
    texts = [cards.nth(i).inner_text() for i in range(3)]
    for status, t in zip(("Cooked", "Watch", "Fine"), texts):
        assert status in t, (status, t[:80])
    expect(page.get_by_text("Every trajectory")).to_be_visible(timeout=T)
    page.screenshot(path=SHOTS / "e2e-landing.png")
    return " / ".join(t.split("\n")[0] for t in texts)


@step("Cockpit: live model, alarm fires, narration traced")
def cockpit(page: Page, cid: str):
    page.goto(f"{WEB}/s/{cid}", wait_until="domcontentloaded")
    expect(page.get_by_text(re.compile(r"live model · cooked-v1"))).to_be_visible(timeout=T)
    expect(page.get_by_text("Watchtower alarm")).to_be_visible(timeout=T)
    expect(page.get_by_text("POST /alarm/check")).to_be_visible(timeout=T)
    expect(page.get_by_text(re.compile(r"every number traced"))).to_be_visible(timeout=T)
    page.get_by_role("button", name=re.compile("Voice on")).click()  # captions only, quieter tests
    expect(page.get_by_text("Heads up.")).to_be_visible(timeout=T)
    gauge = page.get_by_text(re.compile(r"model risk if this pace holds"))
    expect(gauge).to_be_visible(timeout=T)
    page.screenshot(path=SHOTS / "e2e-alarm.png", full_page=True)


@step("Fire drill: both plans drilled, trajectories stored")
def drill(page: Page):
    tab(page, "Fire drill")
    expect(page.get_by_text(re.compile(r"COPY \d+ rows → app\.drill_trajectory")).first).to_be_visible(timeout=T)
    expect(page.get_by_text(re.compile("shocks to cooked", re.IGNORECASE))).to_be_visible(timeout=T)
    expect(page.get_by_text(re.compile(r"survival · 500 simulated futures", re.IGNORECASE))).to_be_visible(timeout=T)
    page.screenshot(path=SHOTS / "e2e-drill.png", full_page=True)
    return page.get_by_text(re.compile(r"POST /drill plan=\d+ cr")).first.inner_text()


@step("Repair: supported lever, catalog-feasible, applied to plan")
def repair(page: Page):
    tab(page, "Repair")
    expect(page.get_by_text(re.compile("primary change", re.IGNORECASE))).to_be_visible(timeout=T)
    title = page.get_by_text(re.compile(r"^Hold \d+\+ credits a term$")).first
    expect(title).to_be_visible(timeout=T)
    lever = title.inner_text()
    target = int(re.search(r"\d+", lever).group())
    expect(page.get_by_text(re.compile("feasible", re.IGNORECASE)).first).to_be_visible(timeout=T)
    page.get_by_role("button", name="Apply to my plan").click()
    expect(page.get_by_text(re.compile(rf"model risk at {target} cr/term"))).to_be_visible(timeout=T)
    expect(page.get_by_text(re.compile(r"stored in (Backboard|app\.memory_note)"))).to_be_visible(timeout=T)
    page.wait_for_timeout(1500)
    page.screenshot(path=SHOTS / "e2e-repair.png", full_page=True)
    return lever


@step("What-if: sliders re-score through the API")
def what_if(page: Page):
    slider = page.locator('input[type="range"]').nth(0)
    slider.fill("10")
    expect(page.get_by_text(re.compile(r"GET /students/CID-\d+/state\?work=10"))).to_be_visible(timeout=T)


@step("Queue: every student scored by the model, staff rows")
def queue(page: Page):
    page.goto(f"{WEB}/queue", wait_until="domcontentloaded")
    expect(page.get_by_text(re.compile(r"scored by the trained model"))).to_be_visible(timeout=T)
    page.get_by_role("button", name=re.compile("Public view")).click()
    rows = page.get_by_role("link", name="Open →")
    expect(rows.first).to_be_visible(timeout=T)
    page.screenshot(path=SHOTS / "e2e-queue.png")
    return f"{rows.count()} rows shown"


@step("Myths: seven claims render")
def myths(page: Page):
    page.goto(f"{WEB}/myths", wait_until="domcontentloaded")
    expect(page.get_by_text(re.compile(r"^myth 0\d$"))).to_have_count(7, timeout=T)


@step("Phone layout: no horizontal scroll on landing and cockpit")
def phone(browser, cid: str):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    page = ctx.new_page()
    try:
        out = []
        for url in (WEB, f"{WEB}/s/{cid}"):
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_timeout(4000)
            sw, iw = page.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            assert sw <= iw + 1, f"{url} scrolls sideways ({sw} > {iw})"
            out.append(f"{sw}px")
        page.screenshot(path=SHOTS / "e2e-phone.png")
        return " / ".join(out)
    finally:
        ctx.close()


@step("Offline fallback: API blocked, local engine still serves the demo")
def offline(browser, cid: str):
    ctx = browser.new_context()
    ctx.route(re.compile(re.escape(API) + ".*"), lambda route: route.abort())
    page = ctx.new_page()
    try:
        page.goto(f"{WEB}/s/{cid}", wait_until="domcontentloaded")
        expect(page.get_by_text("local engine", exact=True)).to_be_visible(timeout=T)
        expect(page.get_by_text(re.compile(r"Heads up\.|You look fine"))).to_be_visible(timeout=T)
    finally:
        ctx.close()


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        watch_console(page, errors)
        api_health(page)
        landing(page)
        cid = page.locator('a[href^="/s/CID-"]').nth(1).get_attribute("href").split("/")[-1]
        cockpit(page, cid)
        drill(page)
        repair(page)
        what_if(page)
        queue(page)
        myths(page)
        phone(browser, cid)
        offline(browser, cid)
        browser.close()

    width = max(len(n) for n, _, _ in results)
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {detail}")
    noise = [e for e in errors if "Failed to load resource" not in e]
    print(f"{'PASS' if not noise else 'FAIL'}  {'Browser console: no errors'.ljust(width)}  {len(noise)} errors")
    for e in noise[:10]:
        print("      ", e)
    if noise or not all(ok for _, ok, _ in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
