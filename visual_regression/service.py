"""File-service wrapper around the visual regression comparator."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from visual_regression.comparator import compare_images


BASELINE_ROOT = "baselines"


def ensure_baseline_dir(framework, browser, test_case_id):
    baseline_dir = os.path.join(BASELINE_ROOT, str(framework), str(browser), str(test_case_id))
    os.makedirs(baseline_dir, exist_ok=True)
    return baseline_dir


def get_baseline_path(framework, browser, test_case_id, step_name):
    return os.path.join(
        BASELINE_ROOT,
        str(framework),
        str(browser),
        str(test_case_id),
        f"{step_name}.png",
    )


def compare(
    test_case_id,
    step_name,
    framework,
    browser,
    current_image_path,
    threshold=0.1,
) -> dict[str, Any]:
    current_path = str(current_image_path)
    if not os.path.exists(current_path):
        raise FileNotFoundError(f"Current image does not exist: {current_path}")

    ensure_baseline_dir(framework, browser, test_case_id)
    baseline_path = get_baseline_path(framework, browser, test_case_id, step_name)

    if not os.path.exists(baseline_path):
        shutil.copy2(current_path, baseline_path)
        return {
            "status": "BASELINE_CREATED",
            "difference_percentage": 0.0,
            "baseline_path": baseline_path,
            "current_path": current_path,
            "diff_path": None,
        }

    result = compare_images(baseline_path, current_path, threshold)
    return {
        "status": result.get("status"),
        "difference_percentage": result.get("difference_percentage"),
        "baseline_path": baseline_path,
        "current_path": current_path,
        "diff_path": result.get("diff_image_path"),
    }


if __name__ == "__main__":
    sample_one = Path("sample_baseline.png")
    sample_two = Path("sample_current.png")
    if sample_one.exists() and sample_two.exists():
        print(compare("sample_case", "sample_step", "sample_framework", "sample_browser", sample_one))
        print(compare("sample_case", "sample_step", "sample_framework", "sample_browser", sample_two))
    else:
        print("Place sample_baseline.png and sample_current.png here to run a quick comparison.")
