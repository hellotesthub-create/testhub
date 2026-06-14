import asyncio
import unittest

import main


class DiagnosisParserTests(unittest.TestCase):
    def test_parse_diagnosis_accepts_structured_output(self):
        parsed = main.parse_diagnosis(
            "\n".join(
                [
                    "ROOT CAUSE: The login button was not found.",
                    "LIKELY FIX: Update the locator to target the visible button.",
                    "CONFIDENCE: High",
                ]
            )
        )

        self.assertEqual(parsed["root_cause"], "The login button was not found.")
        self.assertEqual(parsed["likely_fix"], "Update the locator to target the visible button.")
        self.assertEqual(parsed["confidence"], "High")

    def test_parse_diagnosis_rejects_unstructured_output(self):
        self.assertIsNone(main.parse_diagnosis("Here is a long unstructured explanation."))


class DiagnosisFallbackTests(unittest.TestCase):
    def setUp(self):
        self.original_call_llm = main.call_llm

    def tearDown(self):
        main.call_llm = self.original_call_llm

    def test_provider_failure_returns_structured_fallback(self):
        def failing_call_llm(prompt, screenshot_b64=None):
            raise RuntimeError("quota exceeded")

        main.call_llm = failing_call_llm

        payload = main.DiagnosisPayload(
            execution_id="result-1",
            error_trace="TimeoutError: waiting for locator('#missing')",
            error_category="LOCATOR_NOT_FOUND",
        )
        result = asyncio.run(main.diagnose(payload))

        self.assertEqual(result.root_cause, main.FALLBACK_ROOT_CAUSE)
        self.assertEqual(result.likely_fix, main.FALLBACK_LIKELY_FIX)
        self.assertEqual(result.confidence, "Low")
        self.assertEqual(result.model_used, main.FALLBACK_MODEL)
        self.assertIn("quota exceeded", result.raw_output)

    def test_parse_failure_returns_structured_fallback(self):
        def unstructured_call_llm(prompt, screenshot_b64=None):
            return "This is not in the required format.", "test-model"

        main.call_llm = unstructured_call_llm

        payload = main.DiagnosisPayload(
            execution_id="result-2",
            error_trace="AssertionError: expected Dashboard got Login",
            error_category="ASSERTION_FAILURE",
        )
        result = asyncio.run(main.diagnose(payload))

        self.assertEqual(result.root_cause, main.FALLBACK_ROOT_CAUSE)
        self.assertEqual(result.likely_fix, main.FALLBACK_LIKELY_FIX)
        self.assertEqual(result.confidence, "Low")
        self.assertEqual(result.model_used, main.FALLBACK_MODEL)
        self.assertEqual(result.raw_output, "This is not in the required format.")


if __name__ == "__main__":
    unittest.main()
