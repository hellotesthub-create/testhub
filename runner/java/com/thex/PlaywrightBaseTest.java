package com.thex;

import com.microsoft.playwright.*;
import com.microsoft.playwright.options.ScreenshotType;

import java.io.File;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Random;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * PlaywrightBaseTest — THEX Playwright Java Test Runner Helper
 *
 * User test classes should:
 *   1. Have a public method: public boolean runTest(com.microsoft.playwright.Page page)
 *   2. Return true if test passed, false if failed
 *
 * Available helper methods for test scripts:
 *   - PlaywrightBaseTest.humanType(page, selector, text) — Types text with human-like delays
 *   - PlaywrightBaseTest.captureStep(page, stepName)     — Captures a step screenshot
 *   - PlaywrightBaseTest.smallPause() / mediumPause() / longPause() — Human-like waits
 *
 * The runner calls this class with:
 *   java -cp <classpath> com.thex.PlaywrightBaseTest <TestClassName> <browser> <screenshotsDir> <videosDir>
 */
public class PlaywrightBaseTest {

    private static String currentScreenshotsDir;
    private static String currentTestClassName;
    private static String currentBrowser;
    private static final Random random = new Random();
    private static final AtomicInteger stepCounter = new AtomicInteger(0);

    // ======================== PUBLIC HELPER METHODS ========================

    /**
     * Type text into an element with human-like delays between keystrokes.
     */
    public static void humanType(Page page, String selector, String text) {
        for (char c : text.toCharArray()) {
            page.locator(selector).pressSequentially(String.valueOf(c),
                    new Locator.PressSequentiallyOptions().setDelay(50 + random.nextInt(100)));
        }
        try { Thread.sleep(200 + random.nextInt(200)); } catch (InterruptedException ignored) {}
    }

    /**
     * Capture a screenshot for a specific test step.
     */
    public static void captureStep(Page page, String stepName) {
        int stepNum = stepCounter.incrementAndGet();
        String sanitized = stepName.replaceAll("[^a-zA-Z0-9_-]", "_").toLowerCase();
        String filename = String.format("%s_%s_step%02d_%s.png",
                currentTestClassName, currentBrowser, stepNum, sanitized);
        Path screenshotPath = Paths.get(currentScreenshotsDir, filename);
        page.screenshot(new Page.ScreenshotOptions().setPath(screenshotPath));
        System.out.println("[THEX] Screenshot: " + filename);
    }

    /** Small human-like pause (300-600ms) */
    public static void smallPause() {
        try { Thread.sleep(300 + random.nextInt(300)); } catch (InterruptedException ignored) {}
    }

    /** Medium human-like pause (800-1500ms) */
    public static void mediumPause() {
        try { Thread.sleep(800 + random.nextInt(700)); } catch (InterruptedException ignored) {}
    }

    /** Long human-like pause (1500-2500ms) */
    public static void longPause() {
        try { Thread.sleep(1500 + random.nextInt(1000)); } catch (InterruptedException ignored) {}
    }

    // ======================== MAIN ENTRY POINT ========================

    public static void main(String[] args) {
        if (args.length < 4) {
            System.err.println("Usage: java com.thex.PlaywrightBaseTest <TestClass> <browser> <screenshotsDir> <videosDir>");
            System.exit(2);
        }

        String testClassName = args[0];
        String browser = args[1].toLowerCase();
        String screenshotsDir = args[2];
        String videosDir = args[3];

        // Set shared state
        currentScreenshotsDir = screenshotsDir;
        currentTestClassName = testClassName;
        currentBrowser = browser;
        stepCounter.set(0);

        // Ensure directories exist
        new File(screenshotsDir).mkdirs();
        new File(videosDir).mkdirs();

        Playwright playwright = null;
        Browser browserInstance = null;
        BrowserContext context = null;
        boolean passed = false;

        try {
            playwright = Playwright.create();

            System.out.println("[THEX] Launching Playwright " + browser + " browser...");

            BrowserType browserType;
            if (browser.equals("chrome") || browser.equals("chromium")) {
                browserType = playwright.chromium();
            } else if (browser.equals("firefox")) {
                browserType = playwright.firefox();
            } else {
                System.err.println("[THEX] Unsupported browser: " + browser);
                System.exit(2);
                return;
            }

            browserInstance = browserType.launch(new BrowserType.LaunchOptions().setHeadless(true));

            // Create context with video recording
            context = browserInstance.newContext(new Browser.NewContextOptions()
                    .setViewportSize(1920, 1080)
                    .setRecordVideoDir(Paths.get(videosDir))
                    .setRecordVideoSize(1920, 1080));

            Page page = context.newPage();

            System.out.println("[THEX] Playwright browser initialized");
            System.out.println("[THEX] Video recording to: " + videosDir);
            System.out.flush();

            // Load user's test class dynamically
            Class<?> testClass = Class.forName(testClassName);
            Object testInstance = testClass.getDeclaredConstructor().newInstance();

            // Find the runTest(Page) method
            Method runTestMethod = testClass.getMethod("runTest", Page.class);

            System.out.println("[THEX] Executing " + testClassName + ".runTest()...");
            System.out.flush();

            Object result = runTestMethod.invoke(testInstance, page);
            passed = (result instanceof Boolean) && (Boolean) result;

            if (passed) {
                System.out.println("[THEX] TEST PASSED");
                // Success screenshot
                String successFile = testClassName + "_" + browser + "_success.png";
                page.screenshot(new Page.ScreenshotOptions()
                        .setPath(Paths.get(screenshotsDir, successFile)));
                System.out.println("[THEX] Success screenshot: " + successFile);
            } else {
                System.out.println("[THEX] TEST FAILED — runTest returned false");
                String failFile = testClassName + "_" + browser + "_failure.png";
                page.screenshot(new Page.ScreenshotOptions()
                        .setPath(Paths.get(screenshotsDir, failFile)));
            }

        } catch (Exception e) {
            System.err.println("[THEX] TEST FAILED WITH EXCEPTION: " + e.getMessage());
            e.printStackTrace();
            passed = false;
        } finally {
            // Close context first (this finalizes the video file)
            if (context != null) {
                try { context.close(); } catch (Exception e) { e.printStackTrace(); }
            }
            if (browserInstance != null) {
                try { browserInstance.close(); } catch (Exception e) { e.printStackTrace(); }
            }
            if (playwright != null) {
                try { playwright.close(); } catch (Exception e) { e.printStackTrace(); }
            }
        }

        System.out.println("[THEX] Exit code: " + (passed ? 0 : 1));
        System.exit(passed ? 0 : 1);
    }
}
