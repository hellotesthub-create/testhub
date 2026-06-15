#!/usr/bin/env python3
"""
Self-contained Visual Regression demo — SaaS Analytics Dashboard.

It renders two versions of the same screen (baseline.html = release v1,
modified.html = release v2), screenshots both at a fixed viewport, runs a
pixel-level visual comparison, writes a highlighted diff image, and prints a
report. This mirrors exactly what an automated visual-regression tool does
between two builds of an application.

Run:
    pip install playwright pillow numpy
    playwright install chromium
    python vrt_script.py

Artifacts are written to ./artifacts/  (baseline.png, modified.png, diff.png)
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARTIFACTS = HERE / "artifacts"

VIEWPORT = {"width": 1280, "height": 900}
THRESHOLD_PCT = 0.10     # FAIL if more than 0.10% of pixels differ
PIXEL_TOLERANCE = 30     # ignore tiny per-pixel noise (anti-aliasing) below this

SCENARIO = "SaaS Analytics Dashboard"
EXPECTED_CHANGES = [
    "Primary 'Upgrade Plan' button colour changed (indigo -> green)",
    "KPI card title + value changed ('Active Users' -> 'Monthly Active Users')",
    "New red notification badge added on the bell icon",
    "An additional KPI card added ('Churn Rate')",
]


def screenshot(pw, html_path: Path, out_path: Path):
    """Render one HTML page at a fixed viewport and save a screenshot."""
    browser = pw.chromium.launch()
    page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)
    page.goto(html_path.as_uri())
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(300)  # settle
    page.screenshot(path=str(out_path))
    browser.close()


def compare(baseline_png: Path, modified_png: Path, diff_png: Path):
    """Pixel-compare two screenshots and write a red-highlighted diff image.

    Same approach as the TestHub visual-regression engine: per-pixel difference,
    a small tolerance to ignore anti-aliasing noise, then a diff image of the
    faded baseline with changed pixels painted bright red.
    """
    from PIL import Image, ImageFilter
    import numpy as np

    a = Image.open(baseline_png).convert("RGB")
    b = Image.open(modified_png).convert("RGB")

    if a.size != b.size:
        return {"dimension_mismatch": True, "baseline_size": a.size, "modified_size": b.size}

    an = np.asarray(a).astype(np.int16)
    bn = np.asarray(b).astype(np.int16)
    delta = np.abs(an - bn).sum(axis=2)        # per-pixel channel-sum difference
    changed = delta > PIXEL_TOLERANCE

    # Dilate the mask so the red highlights are clearly visible.
    mask = Image.fromarray((changed * 255).astype("uint8")).filter(ImageFilter.MaxFilter(5))
    changed = np.asarray(mask) > 0

    total = int(changed.size)
    changed_count = int(changed.sum())
    pct = (changed_count / total) * 100 if total else 0.0

    # Diff image: faded grayscale baseline + bright red on changed pixels.
    gray = (np.asarray(a.convert("L").convert("RGB")).astype(np.float32) * 0.35).astype("uint8")
    out = gray.copy()
    out[changed] = (255, 0, 0)
    Image.fromarray(out).save(diff_png)

    return {
        "dimension_mismatch": False,
        "size": a.size,
        "changed": changed_count,
        "total": total,
        "pct": pct,
    }


def print_report(res):
    line = "=" * 64
    print("\n" + line)
    print(f"  VISUAL REGRESSION TEST  —  {SCENARIO}")
    print(line)
    print(f"  Baseline : {ARTIFACTS/'baseline.png'}")
    print(f"  Modified : {ARTIFACTS/'modified.png'}")
    print(f"  Diff     : {ARTIFACTS/'diff.png'}")
    print("-" * 64)
    if res.get("dimension_mismatch"):
        print(f"  Result   : ⚠  DIMENSION MISMATCH")
        print(f"  Baseline size {res['baseline_size']}  vs  modified {res['modified_size']}")
        print(line + "\n")
        return
    w, h = res["size"]
    failed = res["pct"] > THRESHOLD_PCT
    print(f"  Resolution          : {w} x {h}")
    print(f"  Changed pixels      : {res['changed']:,} / {res['total']:,}")
    print(f"  Difference          : {res['pct']:.3f} %")
    print(f"  Threshold           : {THRESHOLD_PCT:.2f} %")
    print(f"  Result              : {'❌ VISUAL REGRESSION DETECTED' if failed else '✅ PASSED (no visual change)'}")
    if failed:
        print("-" * 64)
        print("  Detected changes (shown in red in diff.png):")
        for c in EXPECTED_CHANGES:
            print(f"    • {c}")
    print(line + "\n")


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright is required. Install with:\n"
              "  pip install playwright pillow numpy && playwright install chromium")
        sys.exit(1)

    print(f"Rendering baseline + modified pages for: {SCENARIO} ...")
    with sync_playwright() as pw:
        screenshot(pw, HERE / "baseline.html", ARTIFACTS / "baseline.png")
        screenshot(pw, HERE / "modified.html", ARTIFACTS / "modified.png")

    res = compare(ARTIFACTS / "baseline.png", ARTIFACTS / "modified.png", ARTIFACTS / "diff.png")
    print_report(res)


if __name__ == "__main__":
    main()
