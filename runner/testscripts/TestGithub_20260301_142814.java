import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import com.thex.BaseTest;
import java.time.Duration;

public class TestGithub {

    public boolean runTest(WebDriver driver) {

        try {
            System.out.println("Starting GitHub Full Page Scroll Test...");

            // Step 1: Open GitHub
            System.out.println("Navigating to github.com");
            driver.get("https://github.com");

            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));

            // Wait for page load
            System.out.println("Waiting for page to load...");
            wait.until(ExpectedConditions.presenceOfElementLocated(By.tagName("body")));
            BaseTest.longPause();

            // Step 2: Verify title
            String title = driver.getTitle();
            System.out.println("Page title: " + title);

            if (!title.contains("GitHub")) {
                throw new RuntimeException("GitHub title missing");
            }

            System.out.println("GitHub homepage loaded");
            BaseTest.captureStep(driver, "github_homepage_loaded");

            System.out.println("Starting full page scrolling...");

            long lastHeight = (long) ((org.openqa.selenium.JavascriptExecutor) driver)
                    .executeScript("return document.body.scrollHeight");

            int scrollCount = 0;

            while (scrollCount < 10) {

                // Screenshot at current position
                BaseTest.captureStep(driver, "github_scroll_step_" + (scrollCount + 1));

                // Scroll down
                ((org.openqa.selenium.JavascriptExecutor) driver)
                        .executeScript("window.scrollBy(0, window.innerHeight)");

                BaseTest.mediumPause();

                scrollCount++;
                System.out.println("Scroll step " + scrollCount);

                long newHeight = (long) ((org.openqa.selenium.JavascriptExecutor) driver)
                        .executeScript("return window.pageYOffset + window.innerHeight");

                boolean footerVisible = false;

                try {
                    var footer = driver.findElement(By.tagName("footer"));
                    int footerY = footer.getLocation().getY();

                    if (newHeight >= footerY) {
                        footerVisible = true;
                        System.out.println("Footer reached");
                    }

                } catch (Exception ignored) {}

                if (footerVisible || newHeight >= lastHeight) {
                    BaseTest.captureStep(driver, "github_scroll_footer");
                    break;
                }
            }

            // Scroll back to top
            ((org.openqa.selenium.JavascriptExecutor) driver)
                    .executeScript("window.scrollTo(0,0)");

            BaseTest.mediumPause();
            BaseTest.captureStep(driver, "github_back_to_top");

            System.out.println("TEST PASSED: Full GitHub page viewed successfully");
            return true;

        } catch (Exception e) {
            System.out.println("TEST FAILED: " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }
}