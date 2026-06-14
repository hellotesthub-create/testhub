import com.microsoft.playwright.*;
import com.microsoft.playwright.options.WaitForSelectorState;
import com.thex.PlaywrightBaseTest;

public class DemoQAFormTest {

    public boolean runTest(Page page) {
        try {
            System.out.println("Starting DemoQA Form Test...");

            // Step 1: Open Website
            System.out.println("Navigating to DemoQA form");
            page.navigate("https://demoqa.com/automation-practice-form");

            page.waitForSelector("#firstName", new Page.WaitForSelectorOptions()
                    .setState(WaitForSelectorState.VISIBLE));

            PlaywrightBaseTest.longPause();

            System.out.println("Form page loaded");
            PlaywrightBaseTest.captureStep(page, "form_page_loaded");

            // Step 2–4: Fill form fields
            System.out.println("Entering first name");
            PlaywrightBaseTest.humanType(page, "#firstName", "Inshal");
            PlaywrightBaseTest.captureStep(page, "first_name_entered");

            System.out.println("Entering last name");
            PlaywrightBaseTest.humanType(page, "#lastName", "Khan");
            PlaywrightBaseTest.captureStep(page, "last_name_entered");

            System.out.println("Entering email");
            PlaywrightBaseTest.humanType(page, "#userEmail", "inshal@test.com");
            PlaywrightBaseTest.captureStep(page, "email_entered");

            // Step 5: Select Gender
            System.out.println("Selecting gender");
            PlaywrightBaseTest.smallPause();
            page.locator("label[for='gender-radio-1']").click();
            PlaywrightBaseTest.mediumPause();
            PlaywrightBaseTest.captureStep(page, "gender_selected");

            // Step 6: Fill Phone Number
            System.out.println("Entering phone number");
            PlaywrightBaseTest.humanType(page, "#userNumber", "03123456789");
            PlaywrightBaseTest.captureStep(page, "phone_entered");

            // Step 7: Scroll & submit
            System.out.println("Scrolling to submit button");
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
            PlaywrightBaseTest.mediumPause();
            PlaywrightBaseTest.captureStep(page, "form_filled_ready_to_submit");

            System.out.println("Clicking submit button");
            PlaywrightBaseTest.smallPause();
            page.locator("#submit").click(new Locator.ClickOptions().setForce(true));

            // Step 8: Wait for confirmation
            page.waitForSelector(".modal-content", new Page.WaitForSelectorOptions()
                    .setState(WaitForSelectorState.VISIBLE));

            PlaywrightBaseTest.mediumPause();
            PlaywrightBaseTest.captureStep(page, "submission_confirmed");

            System.out.println("TEST PASSED: Form submitted successfully");
            return true;

        } catch (Exception e) {
            System.out.println("TEST FAILED: " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }
}