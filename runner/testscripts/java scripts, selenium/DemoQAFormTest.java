import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import com.thex.BaseTest;
import java.time.Duration;

public class DemoQAFormTest {

    public boolean runTest(WebDriver driver) {

        try {
            System.out.println("🚀 Starting DemoQA Form Test...");

            // Step 1: Open Website
            System.out.println("📍 Navigating to DemoQA form");
            driver.get("https://demoqa.com/automation-practice-form");

            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));

            // Wait for form to load
            wait.until(ExpectedConditions.presenceOfElementLocated(By.id("firstName")));
            BaseTest.longPause();

            System.out.println("✅ Form page loaded");
            BaseTest.captureStep(driver, "form_page_loaded");

            // Step 2: Fill First Name
            System.out.println("✏️ Entering first name");
            WebElement firstName = driver.findElement(By.id("firstName"));
            BaseTest.humanType(firstName, "Inshal");
            BaseTest.captureStep(driver, "first_name_entered");

            // Step 3: Fill Last Name
            System.out.println("✏️ Entering last name");
            WebElement lastName = driver.findElement(By.id("lastName"));
            BaseTest.humanType(lastName, "Khan");
            BaseTest.captureStep(driver, "last_name_entered");

            // Step 4: Fill Email
            System.out.println("✏️ Entering email");
            WebElement email = driver.findElement(By.id("userEmail"));
            BaseTest.humanType(email, "inshal@test.com");
            BaseTest.captureStep(driver, "email_entered");

            // Step 5: Select Gender
            System.out.println("🔘 Selecting gender");
            BaseTest.smallPause();
            driver.findElement(By.xpath("//label[text()='Male']")).click();
            BaseTest.mediumPause();
            BaseTest.captureStep(driver, "gender_selected");

            // Step 6: Fill Phone Number
            System.out.println("✏️ Entering phone number");
            WebElement phone = driver.findElement(By.id("userNumber"));
            BaseTest.humanType(phone, "03123456789");
            BaseTest.captureStep(driver, "phone_entered");

            // Step 7: Scroll down and screenshot before submit
            System.out.println("📜 Scrolling to submit button");
            ((org.openqa.selenium.JavascriptExecutor) driver)
                    .executeScript("window.scrollTo(0, document.body.scrollHeight)");
            BaseTest.mediumPause();
            BaseTest.captureStep(driver, "form_filled_ready_to_submit");

            // Step 8: Click submit using JavaScript (footer overlaps button)
            System.out.println("🖱️ Clicking submit button");
            BaseTest.smallPause();
            ((org.openqa.selenium.JavascriptExecutor) driver)
                    .executeScript("document.getElementById('submit').click();");

            // Step 9: Wait for confirmation modal
            wait.until(ExpectedConditions.presenceOfElementLocated(By.className("modal-content")));
            BaseTest.mediumPause();
            BaseTest.captureStep(driver, "submission_confirmed");

            System.out.println("🎉 TEST PASSED: Form submitted successfully");
            return true;

        } catch (Exception e) {
            System.out.println("\n❌ TEST FAILED: " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }
}