"""OpenCV-based image comparator for visual regression checks."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2


STATUS_PASSED = "PASSED"
STATUS_FAILED = "FAILED"
STATUS_DIMENSION_MISMATCH = "DIMENSION_MISMATCH"


def compare_images(
    baseline_path: str | Path,
    current_path: str | Path,
    threshold: float = 2.0,
) -> dict[str, Any]:
    """Compare two images with pure pixel math and create a highlighted diff."""
    baseline = _read_image(baseline_path)
    current = _read_image(current_path)

    if baseline.shape[:2] != current.shape[:2]:
        return {
            "status": STATUS_DIMENSION_MISMATCH,
            "difference_percentage": 100.0,
            "diff_image_path": None,
        }

    diff_mask = _changed_pixel_mask(baseline, current)
    total_pixels = diff_mask.size
    changed_pixels = cv2.countNonZero(diff_mask)
    difference_percentage = (changed_pixels / total_pixels) * 100 if total_pixels else 0.0

    diff_image_path = _default_diff_path(current_path)
    generate_diff_image(baseline_path, current_path, diff_image_path)

    return {
        "status": STATUS_FAILED if difference_percentage > threshold else STATUS_PASSED,
        "difference_percentage": round(difference_percentage, 4),
        "diff_image_path": str(diff_image_path),
    }


def generate_diff_image(
    baseline_path: str | Path,
    current_path: str | Path,
    output_path: str | Path,
) -> str:
    """Save a diff image: faded gray baseline with bright red on changed pixels."""
    baseline = _read_image(baseline_path)
    current = _read_image(current_path)

    if baseline.shape[:2] != current.shape[:2]:
        raise ValueError("Cannot generate diff image for inputs with different dimensions")

    diff_mask = _changed_pixel_mask(baseline, current)

    # Slightly expand changed regions so highlights are visible at thumbnail size.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    diff_mask = cv2.dilate(diff_mask, kernel, iterations=2)

    # Fade unchanged areas to dark gray so red highlights stand out clearly.
    gray = cv2.cvtColor(baseline, cv2.COLOR_BGR2GRAY)
    gray_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    faded = cv2.convertScaleAbs(gray_bgr, alpha=0.35, beta=0)

    diff_image = faded.copy()
    diff_image[diff_mask > 0] = (0, 0, 255)

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output), diff_image):
        raise OSError(f"Failed to write diff image: {output}")

    return str(output)


def _read_image(image_path: str | Path):
    path = Path(image_path)
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Unable to read image: {path}")
    return image


def _changed_pixel_mask(baseline, current):
    diff = cv2.absdiff(baseline, current)
    grayscale = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(grayscale, 0, 255, cv2.THRESH_BINARY)
    return mask


def _default_diff_path(current_path: str | Path) -> Path:
    current = Path(current_path)
    return current.with_name(f"{current.stem}_diff.png")
