"""
TestHub AI Failure Diagnosis Microservice

Standalone FastAPI service that accepts test failure context (error, logs,
screenshot) and returns a structured root-cause analysis using an LLM.

Default provider: Gemini (free tier).  Optional fallback: Groq or OpenAI.
"""

import os
import re
import io
import base64
import logging
import time as _time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image

load_dotenv()

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("diagnosis")

app = FastAPI(title="TestHub Diagnosis Service", version="1.0.0")

# ──────────────────────── Pydantic Models ────────────────────────

class DiagnosisPayload(BaseModel):
    execution_id: str
    test_name: str = ""
    framework: str = "selenium"
    language: str = "python"
    browser: str = "chrome"
    url: str = "unknown"
    error_trace: str = ""
    last_logs: str = ""
    screenshot_base64: Optional[str] = None
    error_category: Optional[str] = "UNKNOWN"
    last_successful_step: Optional[str] = ""
    total_steps_captured: Optional[int] = 0
    failing_line_number: Optional[int] = 0
    failing_code_snippet: Optional[str] = ""
    failing_locator: Optional[str] = ""


class DiagnosisResult(BaseModel):
    root_cause: str
    likely_fix: str
    confidence: str
    model_used: str
    raw_output: str


# ──────────────────────── Prompt Template ────────────────────────

SYSTEM_PROMPT = """You are a senior QA automation engineer. A test has failed. Analyze the
following information and respond in EXACTLY this format, with no extra
commentary before or after:

ROOT CAUSE: [one sentence explaining what most likely went wrong]
LIKELY FIX: [one to two sentences suggesting how to fix the code, locator, or test]
CONFIDENCE: [High | Medium | Low]

Context:
- Framework: {framework}
- Language: {language}
- Browser: {browser}
- Target URL: {url}
- Error Category: {error_category}
- Last Successful Step: "{last_successful_step}" (out of {total_steps_captured} total steps)
- Failed Locator/Selector: {failing_locator}
- Error: {error_trace}
- Recent Logs: {last_logs}

{failing_code_snippet}

Rules:
- If the error is a LOCATOR_NOT_FOUND, focus heavily on the Failed Locator. Check if the element exists in the screenshot or if it might be dynamically rendered.
- If the error is a TIMEOUT, consider if an explicit wait is needed or if a previous action (like a click) failed to trigger a page load.
- If the error is an ASSERTION_FAILURE, review the Code Snippet to see what was expected versus what was received.
- Use the Code Snippet to suggest precise code changes in your LIKELY FIX.
- Do not invent details not present in the provided context.
- If the provided information is insufficient to form a reasonable hypothesis, respond with:
  ROOT CAUSE: Insufficient data for diagnosis.
  LIKELY FIX: Re-run with verbose logging or attach a screenshot.
  CONFIDENCE: Low"""

RETRY_SUFFIX = (
    "\n\nYou MUST respond ONLY with exactly three lines starting with "
    "ROOT CAUSE:, LIKELY FIX:, and CONFIDENCE:. No other text."
)

FALLBACK_ROOT_CAUSE = "AI diagnosis is temporarily unavailable."
FALLBACK_LIKELY_FIX = (
    "Review the error category, failing line, last step, and locator shown above."
)
FALLBACK_MODEL = "fallback_rule_engine"


# ──────────────────────── Image Helpers ──────────────────────────

def resize_screenshot(b64_data: str, max_w: int = 1024, max_h: int = 768) -> str:
    """Decode, resize (preserving aspect ratio), re-encode to base64 PNG."""
    try:
        raw = base64.b64decode(b64_data)
        img = Image.open(io.BytesIO(raw))
        img.thumbnail((max_w, max_h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as exc:
        logger.warning("Screenshot resize failed, skipping image: %s", exc)
        return ""


# ──────────────────────── Response Parser ────────────────────────

def parse_diagnosis(text: str) -> dict:
    """
    Extract ROOT CAUSE / LIKELY FIX / CONFIDENCE from LLM output.
    Returns dict with keys root_cause, likely_fix, confidence or None on failure.
    """
    root = _extract_field(text, "ROOT CAUSE")
    fix = _extract_field(text, "LIKELY FIX")
    conf = _extract_field(text, "CONFIDENCE")

    if root and fix and conf:
        # normalise confidence
        conf_upper = conf.strip().title()
        if conf_upper not in ("High", "Medium", "Low"):
            conf_upper = "Low"
        return {"root_cause": root.strip(), "likely_fix": fix.strip(), "confidence": conf_upper}
    return None


def _extract_field(text: str, field: str) -> Optional[str]:
    pattern = rf"(?m)^\s*{re.escape(field)}\s*:\s*(.+)"
    m = re.search(pattern, text, re.IGNORECASE)
    return m.group(1).strip() if m else None


def fallback_diagnosis(raw_output: str = "") -> DiagnosisResult:
    return DiagnosisResult(
        root_cause=FALLBACK_ROOT_CAUSE,
        likely_fix=FALLBACK_LIKELY_FIX,
        confidence="Low",
        model_used=FALLBACK_MODEL,
        raw_output=raw_output,
    )


# ──────────────────── LLM Provider: Gemini ───────────────────────

def _call_gemini(prompt: str, screenshot_b64: Optional[str], model_name: str) -> tuple[str, str]:
    """Call Google Generative AI. Returns (text, model_label)."""
    import google.generativeai as genai

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_KEY_1", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)

    parts = []
    if screenshot_b64:
        try:
            img_bytes = base64.b64decode(screenshot_b64)
            parts.append({"mime_type": "image/png", "data": img_bytes})
        except Exception:
            logger.warning("Failed to decode screenshot for Gemini vision")
    parts.append(prompt)

    response = model.generate_content(
        parts,
        generation_config=genai.GenerationConfig(temperature=0.2),
    )
    return response.text, f"gemini/{model_name}"


# ──────────────────── LLM Provider: Groq ─────────────────────────

def _call_groq(prompt: str, model_name: str) -> tuple[str, str]:
    """Call Groq Cloud API (no vision). Returns (text, model_label)."""
    import httpx

    api_key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_KEY_1", "")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY / GROQ_KEY_1 not set")

    resp = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model_name,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=25.0,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"], f"groq/{model_name}"


# ──────────────────── LLM Provider: OpenAI ───────────────────────

def _call_openai(prompt: str, screenshot_b64: Optional[str], model_name: str) -> tuple[str, str]:
    """Call OpenAI API. Returns (text, model_label)."""
    from openai import OpenAI

    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")

    client = OpenAI(api_key=api_key)
    content = [{"type": "text", "text": prompt}]
    if screenshot_b64:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"},
        })

    response = client.chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": content}],
        temperature=0.2,
    )
    return response.choices[0].message.content, f"openai/{model_name}"


# ──────────────────── Unified Dispatch ───────────────────────────

def call_llm(prompt: str, screenshot_b64: Optional[str] = None) -> tuple[str, str]:
    """
    Route to the configured LLM provider.
    Returns (raw_text, model_label).

    Provider cascade:
    1. DIAGNOSIS_MODEL_PROVIDER env var  (gemini | groq | openai)
    2. If that fails, try fallback provider
    """
    provider = os.getenv("DIAGNOSIS_MODEL_PROVIDER", "gemini").lower().strip()

    primary_model = os.getenv("AI_MODEL_PRIMARY", "")
    fallback_model = os.getenv("AI_MODEL_FALLBACK", "")

    errors = []

    # --- Primary attempt ---
    try:
        if provider == "groq":
            model = primary_model or "llama-3.3-70b-versatile"
            return _call_groq(prompt, model)
        elif provider == "openai":
            model = primary_model or "gpt-4o-mini"
            return _call_openai(prompt, screenshot_b64, model)
        else:  # gemini (default)
            model = primary_model or "gemini-2.5-flash"
            return _call_gemini(prompt, screenshot_b64, model)
    except Exception as exc:
        errors.append(f"Primary ({provider}): {exc}")
        logger.warning("Primary LLM failed: %s", exc)

    # --- Fallback attempt ---
    fallback_provider = os.getenv("DIAGNOSIS_FALLBACK_PROVIDER", "").lower().strip()

    # Auto-detect fallback: if primary is gemini and groq key exists, try groq
    if not fallback_provider:
        if provider == "gemini" and (os.getenv("GROQ_API_KEY") or os.getenv("GROQ_KEY_1")):
            fallback_provider = "groq"
        elif provider == "groq" and (os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_KEY_1")):
            fallback_provider = "gemini"

    if fallback_provider:
        try:
            logger.info("Trying fallback provider: %s", fallback_provider)
            if fallback_provider == "groq":
                model = fallback_model or "llama-3.3-70b-versatile"
                return _call_groq(prompt, model)
            elif fallback_provider == "openai":
                model = fallback_model or "gpt-4o-mini"
                return _call_openai(prompt, screenshot_b64, model)
            else:
                model = fallback_model or "gemini-2.5-flash"
                return _call_gemini(prompt, screenshot_b64, model)
        except Exception as exc2:
            errors.append(f"Fallback ({fallback_provider}): {exc2}")
            logger.error("Fallback LLM also failed: %s", exc2)

    raise RuntimeError(f"All LLM providers failed: {'; '.join(errors)}")


# ──────────────────── Endpoints ──────────────────────────────────

@app.post("/diagnose", response_model=DiagnosisResult)
async def diagnose(payload: DiagnosisPayload):
    """Main diagnosis endpoint — accepts failure context, returns structured analysis."""
    start = _time.time()

    # Prepare screenshot
    screenshot_b64 = None
    if payload.screenshot_base64:
        screenshot_b64 = resize_screenshot(payload.screenshot_base64)
        if not screenshot_b64:
            screenshot_b64 = None  # resize failed, skip image

    # Truncate logs to ~4000 tokens (≈16000 chars)
    last_logs = payload.last_logs[:16000] if payload.last_logs else "(no logs available)"
    error_trace = payload.error_trace or "(no error message)"

    # Format code snippet block
    code_snippet_block = ""
    if payload.failing_line_number and payload.failing_code_snippet:
        code_snippet_block = f"""
- Failing Code (Line {payload.failing_line_number}):
```
{payload.failing_code_snippet}
```
"""

    # Build prompt
    prompt = SYSTEM_PROMPT.format(
        framework=payload.framework,
        language=payload.language,
        browser=payload.browser,
        url=payload.url,
        error_trace=error_trace,
        last_logs=last_logs,
        error_category=payload.error_category,
        last_successful_step=payload.last_successful_step or "None",
        total_steps_captured=payload.total_steps_captured or 0,
        failing_locator=payload.failing_locator or "None",
        failing_code_snippet=code_snippet_block,
    )

    # Call LLM — with one retry on parse failure
    raw_output = ""
    model_used = "unknown"
    parsed = None

    for attempt in range(2):
        current_prompt = prompt if attempt == 0 else prompt + RETRY_SUFFIX
        try:
            raw_output, model_used = call_llm(current_prompt, screenshot_b64)
            parsed = parse_diagnosis(raw_output)
            if parsed:
                break
            logger.warning("Attempt %d: Failed to parse structured response, retrying", attempt + 1)
        except Exception as exc:
            logger.error("LLM call failed on attempt %d: %s", attempt + 1, exc)
            raw_output = str(exc)
            break

    elapsed = _time.time() - start
    logger.info("Diagnosis completed in %.2fs using %s", elapsed, model_used)

    if parsed:
        return DiagnosisResult(
            root_cause=parsed["root_cause"],
            likely_fix=parsed["likely_fix"],
            confidence=parsed["confidence"],
            model_used=model_used,
            raw_output=raw_output,
        )

    # Fallback: keep provider details in raw_output, not user-facing fields.
    return fallback_diagnosis(raw_output)


@app.get("/health")
async def health():
    provider = os.getenv("DIAGNOSIS_MODEL_PROVIDER", "gemini")
    return {"status": "ok", "model": provider}
