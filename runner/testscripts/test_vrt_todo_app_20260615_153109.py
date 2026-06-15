"""
Visual Regression example #1 — TodoMVC component states.

Why this is a good VRT case:
  A todo app has several *distinct, stable* visual states (empty list, populated
  list, an item marked done, a filtered view). Each state is a screen we want to
  protect from accidental visual regressions (e.g. a CSS change that breaks the
  completed-item strikethrough, or misaligns the filter bar).

How it maps to the VRT engine:
  Each capture_step() writes a screenshot with a STABLE name (empty_state,
  three_items, one_completed, active_filter). The VRT job matches each screenshot
  to its baseline by that name — so on the first run it creates 4 baselines, and
  on every later run it compares these 4 states and flags any visual difference.

Functionally the test PASSES; visual regression is a separate signal layered on
top of the captured screenshots.
"""

from playwright.sync_api import Page
import os

SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

# A site that uses anti-aliased fonts and animations will produce slightly
# different pixels on every run. We freeze animations/transitions and hide the
# text caret, then wait for the network to go idle, so each screenshot is
# deterministic — the foundation of a reliable visual baseline.
_STABILIZE_CSS = """
*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
}
"""


def stabilize(page: Page):
    page.wait_for_load_state("networkidle")
    # Wait until every <img> has finished loading/decoding (guards against
    # capturing a baseline with not-yet-loaded images -> false-positive diffs).
    try:
        page.wait_for_function(
            "() => Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)",
            timeout=15000,
        )
    except Exception:
        pass
    # Wait for web fonts so text anti-aliasing is identical across runs.
    try:
        page.wait_for_function("() => document.fonts && document.fonts.status === 'loaded'", timeout=5000)
    except Exception:
        pass
    page.add_style_tag(content=_STABILIZE_CSS)
    page.wait_for_timeout(300)


def capture_step(page: Page, step_name: str):
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    stabilize(page)
    page.screenshot(path=f"{SCREENSHOTS_DIR}/{step_name}.png")


def run_test(page: Page):
    print("VRT: TodoMVC component states")

    page.goto("https://demo.playwright.dev/todomvc/")
    page.wait_for_selector(".new-todo")

    # State 1 — empty list (the baseline "blank" UI)
    capture_step(page, "empty_state")

    # State 2 — three items added (list rendering, counter)
    new_todo = page.get_by_placeholder("What needs to be done?")
    for item in ["Write FYP report", "Prepare VRT demo", "Email supervisor"]:
        new_todo.fill(item)
        new_todo.press("Enter")
    page.wait_for_selector(".todo-list li:nth-child(3)")
    capture_step(page, "three_items")

    # State 3 — first item completed (strikethrough / checked styling)
    page.locator(".todo-list li").first.locator(".toggle").check()
    capture_step(page, "one_completed")

    # State 4 — "Active" filter applied (completed item hidden)
    page.get_by_role("link", name="Active").click()
    page.wait_for_timeout(200)
    capture_step(page, "active_filter")

    return True
