package com.thex;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.firefox.FirefoxOptions;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Random;
import java.util.concurrent.atomic.AtomicInteger;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.Point;

/**
 * BaseTest — THEX Java Test Runner Helper
 * 
 * User test classes should:
 *   1. Have a public method: public boolean runTest(WebDriver driver)
 *   2. Return true if test passed, false if failed
 * 
 * Available helper methods for test scripts:
 *   - BaseTest.humanType(element, text)  — Types text with human-like delays
 *   - BaseTest.captureStep(driver, stepName) — Captures a step screenshot
 *   - BaseTest.smallPause() / mediumPause() / longPause() — Human-like waits
 * 
 * The runner calls this class with:
 *   java -cp <classpath> com.thex.BaseTest <TestClassName> <browser> <hubUrl> <screenshotsDir>
 */
public class BaseTest {

    // Shared state for test scripts to use helper methods
    private static String currentScreenshotsDir;
    private static String currentTestClassName;
    private static String currentBrowser;
    private static final Random random = new Random();
    private static final AtomicInteger stepCounter = new AtomicInteger(0);

    // ======================== PUBLIC HELPER METHODS ========================

    /**
     * Type text into a WebElement with human-like delays between keystrokes.
     * Each character is typed with a random delay of 50–150ms.
     */
    public static void humanType(WebElement element, String text) {
        for (char c : text.toCharArray()) {
            element.sendKeys(String.valueOf(c));
            try {
                Thread.sleep(50 + random.nextInt(100)); // 50-150ms per char
            } catch (InterruptedException ignored) {}
        }
        // Small pause after finishing typing
        try { Thread.sleep(200 + random.nextInt(200)); } catch (InterruptedException ignored) {}
    }

    /**
     * Capture a screenshot for a specific test step.
     * Screenshots are auto-numbered and saved with the step name.
     */
    public static void captureStep(WebDriver driver, String stepName) {
        int stepNum = stepCounter.incrementAndGet();
        String sanitized = stepName.replaceAll("[^a-zA-Z0-9_-]", "_").toLowerCase();
        String filename = String.format("%s_%s_step%02d_%s.png",
                currentTestClassName, currentBrowser, stepNum, sanitized);
        captureScreenshot(driver, currentScreenshotsDir, filename);
    }

    /** Small human-like pause (300-600ms) — e.g., between clicks */
    public static void smallPause() {
        try { Thread.sleep(300 + random.nextInt(300)); } catch (InterruptedException ignored) {}
    }

    /** Medium human-like pause (800-1500ms) — e.g., after page action */
    public static void mediumPause() {
        try { Thread.sleep(800 + random.nextInt(700)); } catch (InterruptedException ignored) {}
    }

    /** Long human-like pause (1500-2500ms) — e.g., after page load */
    public static void longPause() {
        try { Thread.sleep(1500 + random.nextInt(1000)); } catch (InterruptedException ignored) {}
    }

    // ======================== MAIN ENTRY POINT ========================

    public static void main(String[] args) {
        if (args.length < 4) {
            System.err.println("Usage: java com.thex.BaseTest <TestClass> <browser> <hubUrl> <screenshotsDir>");
            System.exit(2);
        }

        String testClassName = args[0];
        String browser = args[1].toLowerCase();
        String hubUrl = args[2];
        String screenshotsDir = args[3];

        // Set shared state so test scripts can use helper methods
        currentScreenshotsDir = screenshotsDir;
        currentTestClassName = testClassName;
        currentBrowser = browser;
        stepCounter.set(0);

        WebDriver driver = null;
        boolean passed = false;

        try {
            // Create RemoteWebDriver connected to Selenium Grid Hub
            System.out.println("[THEX] Creating " + browser + " driver via Hub: " + hubUrl);

            if (browser.equals("chrome")) {
                ChromeOptions options = new ChromeOptions();
                driver = new RemoteWebDriver(new URL(hubUrl), options);
            } else if (browser.equals("firefox")) {
                FirefoxOptions options = new FirefoxOptions();
                driver = new RemoteWebDriver(new URL(hubUrl), options);
            } else {
                System.err.println("[THEX] Unsupported browser: " + browser);
                System.exit(2);
            }

            // Position window at origin and set size to fill the entire Xvfb display
            driver.manage().window().setPosition(new Point(0, 0));
            driver.manage().window().setSize(new Dimension(1920, 1080));

            String sessionId = ((RemoteWebDriver) driver).getSessionId().toString();
            System.out.println("[THEX] Browser initialized, session: " + sessionId);
            System.out.flush(); // Flush immediately so runner.py can read session_id

            // Give the runner time to start video recording before test begins
            System.out.println("[THEX] Waiting for video recorder...");
            System.out.flush();
            Thread.sleep(4000); // 4 seconds for video recorder to initialize ffmpeg

            // Load user's test class dynamically
            Class<?> testClass = Class.forName(testClassName);
            Object testInstance = testClass.getDeclaredConstructor().newInstance();

            // Find the runTest(WebDriver) method
            Method runTestMethod = testClass.getMethod("runTest", WebDriver.class);

            System.out.println("[THEX] Executing " + testClassName + ".runTest()...");
            System.out.flush();

            // Execute the test
            Object result = runTestMethod.invoke(testInstance, driver);

            if (result instanceof Boolean) {
                passed = (Boolean) result;
            } else {
                // If method returns void or non-boolean, consider it passed (no exception)
                passed = true;
            }

            // Capture screenshot
            String screenshotName = testClassName + "_" + browser + (passed ? "_success" : "_failure") + ".png";
            captureScreenshot(driver, screenshotsDir, screenshotName);

            if (passed) {
                System.out.println("[THEX] TEST PASSED: " + testClassName);
            } else {
                System.out.println("[THEX] TEST FAILED: " + testClassName);
            }

        } catch (Exception e) {
            System.err.println("[THEX] TEST ERROR: " + testClassName + " — " + e.getMessage());
            e.printStackTrace();
            passed = false;

            // Try to capture failure screenshot
            if (driver != null) {
                try {
                    String screenshotName = testClassName + "_" + browser + "_failure.png";
                    captureScreenshot(driver, screenshotsDir, screenshotName);
                } catch (Exception ignored) {}
            }
        } finally {
            if (driver != null) {
                try {
                    driver.quit();
                    System.out.println("[THEX] Browser closed.");
                } catch (Exception ignored) {}
            }
        }

        // Exit with appropriate code: 0 = pass, 1 = fail
        System.exit(passed ? 0 : 1);
    }

    private static void captureScreenshot(WebDriver driver, String screenshotsDir, String filename) {
        try {
            File screenshot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);
            Path destPath = Paths.get(screenshotsDir, filename);
            Files.createDirectories(destPath.getParent());
            Files.copy(screenshot.toPath(), destPath);
            System.out.println("[THEX] Screenshot saved: " + destPath);
        } catch (Exception e) {
            System.err.println("[THEX] Failed to capture screenshot: " + e.getMessage());
        }
    }
}
