"""
Visual Regression example #2 — e-commerce checkout flow (Sauce Demo).

Why this is a good VRT case:
  An online store is exactly where visual regressions hurt: a broken product
  card, a misaligned price, a cart row that overflows. This test walks the core
  buyer journey (login -> products -> add to cart -> cart) and snapshots each
  screen, so a CSS/layout change anywhere in that funnel is caught automatically.

How it maps to the VRT engine:
  Each capture_step() writes a screenshot with a STABLE name (login_page,
  products_page, item_added, cart_page). On the first run the VRT job creates 4
  baselines; on later runs it compares these 4 states and reports any visual diff
  — independent of whether the test functionally passes.

Sauce Demo (saucedemo.com) is a purpose-built, deterministic automation target:
  fixed product list, fixed prices, no ads — ideal for a reliable visual baseline.
"""

from playwright.sync_api import Page
import os

SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

# Freeze animations/transitions and hide the caret, then wait for network idle,
# so every screenshot is pixel-deterministic across runs.
_STABILIZE_CSS = """
*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
}
"""


def stabilize(page: Page):
    page.wait_for_load_state("networkidle")
    # Wait until EVERY <img> has actually finished loading/decoding. Sauce Demo
    # lazy-loads its product images; networkidle alone can fire before they
    # decode, so without this the baseline is captured with blank image slots and
    # later runs report a false-positive diff once the images are present.
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
    print("VRT: Sauce Demo checkout flow")

    page.goto("https://www.saucedemo.com/")
    page.wait_for_selector("#login-button")

    # State 1 — login page (form layout, branding)
    capture_step(page, "login_page")

    # Log in with the standard demo account
    page.fill("#user-name", "standard_user")
    page.fill("#password", "secret_sauce")
    page.click("#login-button")

    # State 2 — products listing (cards, prices, grid alignment)
    page.wait_for_selector(".inventory_list")
    capture_step(page, "products_page")

    # State 3 — item added to cart (cart badge appears, button toggles to "Remove")
    page.click("[data-test='add-to-cart-sauce-labs-backpack']")
    page.wait_for_selector(".shopping_cart_badge")
    capture_step(page, "item_added")

    # State 4 — cart page (line item, quantity, summary)
    page.click(".shopping_cart_link")
    page.wait_for_selector(".cart_list")
    capture_step(page, "cart_page")

    return True
