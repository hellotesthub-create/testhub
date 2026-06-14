package handlers

import (
	"backend/internal/models"
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

func TestClassifyErrorPhaseOneCategories(t *testing.T) {
	tests := []struct {
		name    string
		message string
		stack   string
		want    string
	}{
		{
			name:    "assertion",
			message: `AssertionError: expected "Dashboard" got "Login"`,
			want:    ErrCatAssertion,
		},
		{
			name:    "stale element",
			message: "selenium.common.exceptions.StaleElementReferenceException: stale element reference",
			want:    ErrCatStale,
		},
		{
			name:    "frame error",
			message: `TimeoutError: locator("#iframeResult h1").click: Timeout 30000ms exceeded`,
			stack:   `File "/app/testscripts/test_exception_demo_iframe.py", line 19`,
			want:    ErrCatFrame,
		},
		{
			name:    "locator not found",
			message: `TimeoutError: Locator.click: Timeout 30000ms exceeded`,
			stack:   `Call log: - waiting for locator("#this-does-not-exist")`,
			want:    ErrCatLocator,
		},
		{
			name:    "timeout",
			message: `TimeoutError: page.wait_for_selector("#loading") timed out waiting for selector`,
			want:    ErrCatTimeout,
		},
		{
			name:    "unknown",
			message: "ValueError: unexpected fixture value",
			want:    ErrCatUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ClassifyError(tt.message, tt.stack); got != tt.want {
				t.Fatalf("ClassifyError() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestGetLastSuccessfulStepSortsAndNormalizes(t *testing.T) {
	base := time.Date(2026, 6, 14, 10, 0, 0, 0, time.UTC)
	screenshots := []models.Screenshot{
		{Step: "middle_step", CreatedAt: base.Add(2 * time.Minute)},
		{Step: "page_loaded", CreatedAt: base.Add(1 * time.Minute)},
		{Step: "form_submitted", CreatedAt: base.Add(3 * time.Minute)},
	}

	step, total := GetLastSuccessfulStep(screenshots)
	if total != 3 {
		t.Fatalf("total = %d, want 3", total)
	}
	if step != "form submitted" {
		t.Fatalf("step = %q, want %q", step, "form submitted")
	}
}

func TestGetLastSuccessfulStepBlankFallback(t *testing.T) {
	base := time.Date(2026, 6, 14, 10, 0, 0, 0, time.UTC)
	screenshots := []models.Screenshot{
		{Step: "page_loaded", CreatedAt: base},
		{Step: "", CreatedAt: base.Add(time.Minute)},
	}

	step, total := GetLastSuccessfulStep(screenshots)
	if total != 2 {
		t.Fatalf("total = %d, want 2", total)
	}
	if step != "step 2" {
		t.Fatalf("step = %q, want %q", step, "step 2")
	}
}

func TestExtractFailingLinePython(t *testing.T) {
	source := strings.Join([]string{
		"def run_test(page):",
		"    page.goto(\"https://example.com\")",
		"    capture_step(page, \"loaded\")",
		"    page.locator(\"#missing\").click()",
		"    return True",
	}, "\n")
	stack := `Traceback (most recent call last):
  File "/app/src/runner.py", line 832, in execute_playwright_test
    test_passed = module.run_test(page)
  File "/app/testscripts/test_demo.py", line 4, in run_test
    page.locator("#missing").click()
playwright._impl._errors.TimeoutError: Timeout 30000ms exceeded`

	got := ExtractFailingLine(stack, base64.StdEncoding.EncodeToString([]byte(source)), "python")
	if got.LineNumber != 4 {
		t.Fatalf("LineNumber = %d, want 4", got.LineNumber)
	}
	if !strings.Contains(got.Snippet, `>>> 4:     page.locator("#missing").click()`) {
		t.Fatalf("snippet did not mark failing line:\n%s", got.Snippet)
	}
	if got.RawLine != `page.locator("#missing").click()` {
		t.Fatalf("RawLine = %q", got.RawLine)
	}
}

func TestExtractFailingLineJava(t *testing.T) {
	source := strings.Join([]string{
		"public class DemoTest {",
		"  public boolean runTest(Page page) {",
		"    page.locator(\"#missing\").click();",
		"    return true;",
		"  }",
		"}",
	}, "\n")
	stack := `java.lang.RuntimeException: timeout
	at DemoTest.runTest(DemoTest.java:3)
	at com.thex.PlaywrightBaseTest.main(PlaywrightBaseTest.java:88)`

	got := ExtractFailingLine(stack, base64.StdEncoding.EncodeToString([]byte(source)), "java")
	if got.LineNumber != 3 {
		t.Fatalf("LineNumber = %d, want 3", got.LineNumber)
	}
	if !strings.Contains(got.Snippet, `>>> 3:     page.locator("#missing").click();`) {
		t.Fatalf("snippet did not mark failing line:\n%s", got.Snippet)
	}
}

func TestExtractFailingLocatorBasicPatterns(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "page locator",
			input: `page.locator("button.primary").click()`,
			want:  "button.primary",
		},
		{
			name:  "wait for selector",
			input: `page.wait_for_selector("#ready", timeout=3000)`,
			want:  "#ready",
		},
		{
			name:  "waiting for locator",
			input: `Call log: - waiting for locator("#save") to be visible`,
			want:  "#save",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExtractFailingLocator(tt.input, ""); got != tt.want {
				t.Fatalf("ExtractFailingLocator() = %q, want %q", got, tt.want)
			}
		})
	}
}
