"""End-to-end check of the voice-agent experience in a real browser: make e2e

Landing -> sign-in guard -> guest login -> sample audit through the agent pipeline -> dashboard
-> spoken/typed questions (course swap, what-if, stress test) -> advisor view -> phone layout ->
sign out. Fails on any broken step or browser console error. Screenshots go to data/smoke/.

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
T = 45_000

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


def sign_in_as_guest(page: Page):
    page.goto(WEB, wait_until="domcontentloaded")
    page.get_by_role("button", name=re.compile(r"(Continue as guest|continue as a guest)")).first.click()
    page.wait_for_url(f"{WEB}/app", timeout=T)


def ask(page: Page, question: str):
    page.get_by_placeholder(re.compile("Tap the orb|Ask:")).fill(question)
    page.get_by_role("button", name="Ask", exact=True).click()
    expect(page.locator("article").filter(has_text=question).first).to_be_visible(timeout=T)
    return page.locator("article").filter(has_text=question).first


@step("API health: trained models loaded")
def api_health(page: Page):
    h = page.request.get(f"{API}/healthz").json()
    assert h["mode"] == "models" and h["checks"]["artifact_checksum"] == "ok", h
    live = [k for k, v in h["providers"].items() if v]
    return f"{h['model_version']} · live providers: {', '.join(live) or 'none (fallbacks)'}"


@step("Sign-in guard: /app without a session goes to the landing page")
def guard(page: Page):
    page.goto(f"{WEB}/app", wait_until="domcontentloaded")
    assert page.url.rstrip("/") == WEB, page.url


@step("Landing: crowd, COOKED mark, sign-in")
def landing(page: Page):
    page.goto(WEB, wait_until="domcontentloaded")
    expect(page.get_by_text("COOKED", exact=True)).to_be_visible(timeout=T)
    expect(page.locator("canvas")).to_have_count(1, timeout=T)
    page.wait_for_timeout(1500)
    page.screenshot(path=SHOTS / "e2e-landing.png")


@step("Guest sign-in reaches the agent workspace")
def workspace(page: Page):
    sign_in_as_guest(page)
    expect(page.get_by_text("Drop your degree audit")).to_be_visible(timeout=T)
    expect(page.get_by_text("Working 22 h")).to_be_visible(timeout=T)


@step("Sample audit: every agent finishes, dashboard appears")
def pipeline(page: Page):
    page.get_by_text("Working 22 h").first.click()
    expect(page.get_by_text("agents at work")).to_be_visible(timeout=T)
    expect(page.get_by_text(re.compile(r"you're (cooked|on watch|on track)", re.IGNORECASE))).to_be_visible(timeout=90_000)
    expect(page.get_by_text(re.compile(r"\d+ trajectories written to app\.drill_trajectory"))).to_be_visible(timeout=T)
    page.wait_for_timeout(1500)
    page.screenshot(path=SHOTS / "e2e-dashboard.png", full_page=True)
    return page.get_by_text(re.compile(r"you're (cooked|on watch|on track)", re.IGNORECASE)).inner_text()


@step("Question: course swap -> course cards, every number traced")
def q_course(page: Page):
    card = ask(page, "What if I take CMSC341 instead of CMSC313?")
    expect(card.get_by_text("courses it unlocks").first).to_be_visible(timeout=T)
    expect(card.get_by_text(re.compile(r"numbers traced to tool results"))).to_be_visible(timeout=T)
    page.screenshot(path=SHOTS / "e2e-answer-course.png")
    return card.locator("p").first.inner_text()[:90]


@step("Question: relative what-if -> before/after")
def q_whatif(page: Page):
    card = ask(page, "What if I take 3 more credits a term?")
    expect(card.get_by_text("What if", exact=True)).to_be_visible(timeout=T)
    return card.locator("p").first.inner_text()[:90]


@step("Question: stress test -> drill")
def q_drill(page: Page):
    card = ask(page, "Stress test my plan")
    expect(card.locator("svg").first).to_be_visible(timeout=T)


@step("Advisor view: every student scored by the model")
def advisor(page: Page):
    page.goto(f"{WEB}/app/advisor", wait_until="domcontentloaded")
    expect(page.get_by_text(re.compile(r"scored by the trained model"))).to_be_visible(timeout=T)


@step("Phone layout: no sideways scroll on landing and workspace")
def phone(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    page = ctx.new_page()
    try:
        widths = []
        page.goto(WEB, wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        widths.append(page.evaluate("[document.documentElement.scrollWidth, innerWidth]"))
        sign_in_as_guest(page)
        page.wait_for_timeout(2000)
        widths.append(page.evaluate("[document.documentElement.scrollWidth, innerWidth]"))
        page.screenshot(path=SHOTS / "e2e-phone.png")
        for sw, iw in widths:
            assert sw <= iw + 1, f"scrolls sideways ({sw} > {iw})"
        return " / ".join(f"{sw}px" for sw, _ in widths)
    finally:
        ctx.close()


@step("Sign out returns to the landing page")
def sign_out(page: Page):
    page.goto(f"{WEB}/app", wait_until="domcontentloaded")
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_url(f"{WEB}/", timeout=T)
    page.goto(f"{WEB}/app", wait_until="domcontentloaded")
    assert page.url.rstrip("/") == WEB, page.url


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text[:200]))
        page.on("pageerror", lambda e: errors.append(f"pageerror: {str(e)[:200]}"))
        api_health(page)
        guard(page)
        landing(page)
        workspace(page)
        pipeline(page)
        q_course(page)
        q_whatif(page)
        q_drill(page)
        advisor(page)
        phone(browser)
        sign_out(page)
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
