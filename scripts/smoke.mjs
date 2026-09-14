import { _electron as electron } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const profile = mkdtempSync(join(tmpdir(), "opengym-e2e-"));
let app;
const rendererErrors = [];
const launchStarted = Date.now();
try {
  const executablePath = process.env.OPENGYM_EXECUTABLE;
  app = await electron.launch({
    ...(executablePath ? { executablePath: resolve(executablePath) } : {}),
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
    cwd: resolve("."),
  });
  const page = await app.firstWindow();
  if (process.env.OPENGYM_TEST_COMPACT === "1")
    await page.setViewportSize({ width: 800, height: 700 });
  page.on("console", (message) => {
    if (message.type() === "error") rendererErrors.push(message.text());
  });
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  const navigate = async (name) => {
    const sidebarButton = page.getByRole("button", { name, exact: true }).first();
    if (await sidebarButton.isVisible().catch(() => false)) {
      await sidebarButton.click();
      return;
    }
    await page.keyboard.press("Control+K");
    const search = page.getByLabel("Search commands");
    await search.waitFor();
    await search.fill(name);
    await search.press("Enter");
  };
  if (await app.evaluate(({ Menu }) => Menu.getApplicationMenu() !== null))
    throw new Error("Electron application menu is still visible");
  await page
    .getByRole("heading", { name: "Open the front desk." })
    .waitFor({ timeout: 10000 });
  const startupMs = Date.now() - launchStarted;
  if (startupMs > 10000)
    throw new Error(`Cold startup exceeded 10 seconds: ${startupMs}ms`);
  await page.getByLabel("Gym name").fill("OpenGym Test Club");
  await page.getByLabel("Owner name").fill("Test Owner");
  await page.getByLabel("Six-digit PIN").fill("123456");
  await page.getByRole("button", { name: "Create workspace" }).click();
  try {
    await page
      .getByRole("heading", { name: "Staff sign in" })
      .waitFor({ timeout: 5000 });
  } catch (error) {
    console.log("SETUP_STATE", await page.locator("body").innerText());
    throw error;
  }
  await page.screenshot({ path: "release/e2e-login.png", fullPage: true });
  await page.getByRole("button", { name: "Open front desk" }).click();
  await page.getByRole("alert").getByText("Enter your six-digit numeric PIN.").waitFor();
  await page.getByLabel("PIN").fill("123456");
  await page.getByRole("button", { name: "Open front desk" }).click();
  await page.getByRole("heading", { name: "Front desk overview" }).waitFor();
  await page.keyboard.press("Tab");
  const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
  if (!focusedElement || focusedElement === "BODY") throw new Error("Keyboard focus is not visible after Tab");
  const unnamedControls = await page.evaluate(() => [...document.querySelectorAll("button,input,select,textarea")].filter((element) => {
    const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || (element.id && document.querySelector(`label[for='${element.id}']`)?.textContent?.trim());
    return !label;
  }).length);
  if (unnamedControls) throw new Error(`${unnamedControls} interactive controls have no accessible name`);

  await page.keyboard.press("Control+K");
  await page.getByLabel("Search commands").fill("Members");
  await page.getByLabel("Search commands").press("Enter");
  await page.getByRole("heading", { name: "Members" }).waitFor();
  await page.getByRole("button", { name: "Add member" }).click();
  await page.getByLabel("First name").fill("Nadia");
  await page.getByLabel("Last name").fill("Bensaid");
  await page.getByLabel("Phone", { exact: true }).fill("0550000000");
  const memberSaveStarted = Date.now();
  await page.getByRole("button", { name: "Save member" }).click();
  await page.getByText("Nadia Bensaid").waitFor();
  const visibleMemberCode = (await page.locator(".memberCode").first().innerText()).trim();
  if (!/^\d{10}$/.test(visibleMemberCode)) throw new Error(`Member chip ID is not a visible 10-digit number: ${visibleMemberCode}`);
  await page.getByRole("status").getByText("Member added.").waitFor();
  const memberSaveMs = Date.now() - memberSaveStarted;
  if (memberSaveMs > 2000)
    throw new Error(`Member save exceeded 2 seconds: ${memberSaveMs}ms`);

  await navigate("Plans");
  try {
    await page.getByRole("heading", { name: "Plans", exact: true }).waitFor({ timeout: 5000 });
  } catch (error) {
    console.log("MEMBERSHIP_STATE", await page.locator("body").innerText());
    console.log("RENDERER_ERRORS", rendererErrors);
    throw error;
  }
  await page.getByRole("button", { name: "Create plan" }).first().click();
  await page.getByLabel("Plan name").fill("Monthly");
  await page.getByLabel("Duration in months (optional)").fill("1");
  await page.getByLabel("Price").fill("5000");
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.getByRole("button", { name: "Edit plan" }).click();
  await page.getByLabel("Description").fill("Full gym access");
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.getByText("Full gym access").waitFor();
  await page.getByLabel("Plan type").selectOption("calendar");
  if ((await page.locator(".planCard").count()) !== 1) throw new Error("Plan type filter returned an unexpected result");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.screenshot({ path: "release/e2e-membership-plans.png", fullPage: true });
  await navigate("Memberships");
  await page.getByRole("button", { name: "Assign plan" }).click();
  await page.getByRole("button", { name: "Assign plan" }).last().click();
  await page.locator("tbody").getByText("Monthly", { exact: true }).first().waitFor();
  await page.getByLabel("Status", { exact: true }).selectOption("active");
  await page.getByRole("button", { name: "Reset" }).click();
  const searchStarted = Date.now();
  await page.getByRole("searchbox", { name: "Search memberships" }).fill("Nadia");
  if ((await page.locator("tbody tr").count()) !== 1) throw new Error("Membership search did not narrow the table");
  const searchMs = Date.now() - searchStarted;
  if (searchMs > 500) throw new Error(`Membership search exceeded 500ms: ${searchMs}ms`);
  await page.getByRole("button", { name: "Clear search memberships" }).click();
  await page.getByRole("button", { name: "Freeze" }).click();
  await page.getByRole("alertdialog").waitFor();
  await page.screenshot({ path: "release/e2e-confirmation.png", fullPage: true });
  await page.getByRole("button", { name: "Keep current" }).click();
  await page.getByRole("button", { name: "Freeze" }).waitFor();
  await page.getByRole("button", { name: "Freeze" }).click();
  await page.getByRole("button", { name: "Freeze membership" }).click();
  await page.getByRole("status").getByText("Membership frozen.").waitFor();
  await page.screenshot({ path: "release/e2e-membership-frozen.png", fullPage: true });
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Resume membership" }).click();
  await page.getByRole("button", { name: "Renew" }).waitFor();
  await page.getByRole("button", { name: /History/ }).click();
  await page.getByRole("heading", { name: "Membership freeze history" }).waitFor();
  await page.getByText("Completed freeze period").waitFor();
  await page.screenshot({ path: "release/e2e-freeze-history.png", fullPage: true });
  await page.getByRole("button", { name: "Close" }).click();

  await navigate("Attendance");
  await page.getByRole("button", { name: "Check in" }).click();
  await page.getByRole("button", { name: "Cancel" }).waitFor();
  if (!(await page.getByRole("button", { name: "Check in now" }).isDisabled())) throw new Error("Quick check-in is enabled before choosing a member");
  await page.screenshot({ path: "release/e2e-quick-checkin.png", fullPage: true });
  await page.getByLabel("Member").selectOption({ label: "Nadia Bensaid" });
  await page.getByRole("button", { name: "Check in now" }).click();
  await page.locator(".badge--in-gym").waitFor();
  await page.getByLabel("Visit status").selectOption("in-gym");
  if ((await page.locator("tbody tr").count()) !== 1) throw new Error("Attendance status filter returned an unexpected result");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("searchbox", { name: "Search attendance" }).fill("Nadia");
  if ((await page.locator("tbody tr").count()) !== 1) throw new Error("Attendance search did not narrow the table");
  await page.getByRole("button", { name: "Clear search attendance" }).click();
  await page.getByRole("button", { name: "Check in" }).click();
  await page.getByLabel("Member").selectOption({ label: "Nadia Bensaid" });
  await page.getByRole("button", { name: "Check in now" }).click();
  await page
    .getByRole("alert")
    .getByText("This member is already checked in")
    .waitFor();
  await page.getByRole("button", { name: "Close" }).click();

  await navigate("Kiosk");
  if (await page.getByRole("textbox").count()) throw new Error("Kiosk exposes a manual chip ID field");
  await page.keyboard.type("0000000000");
  await page.keyboard.press("Enter");
  await page.getByRole("alert").getByText("Access denied").waitFor();
  await page.getByText(/Please wait \d+s/).waitFor();

  await navigate("Payments");
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel("Amount").fill("5000");
  await page.getByRole("button", { name: "Record payment" }).last().click();
  await page.getByText(`${new Date().getFullYear()}-000001`).waitFor();
  await page.getByLabel("Payment status").selectOption("paid");
  if ((await page.locator("tbody tr").count()) !== 1) throw new Error("Payment status filter returned an unexpected result");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("searchbox", { name: "Search payments" }).fill("Nadia");
  if ((await page.locator("tbody tr").count()) !== 1) throw new Error("Payment search did not narrow the table");
  await page.getByRole("button", { name: "Clear search payments" }).click();
  await page.getByRole("button", { name: "Refund" }).click();
  await page.getByLabel("Current PIN").fill("000000");
  await page.getByRole("button", { name: "Refund payment" }).click();
  await page.getByRole("alert").getByText("Current PIN is incorrect").waitFor();
  await page.getByRole("button", { name: "Refund" }).click();
  await page.getByLabel("Current PIN").fill("123456");
  await page.getByRole("button", { name: "Refund payment" }).click();
  await page.getByText("refunded", { exact: true }).waitFor();

  await navigate("Staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  await page.getByLabel("Name").fill("Front Desk Test");
  await page.getByLabel("Six-digit PIN").fill("654321");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Front Desk Test").waitFor();
  await page.getByRole("button", { name: "Permissions" }).click();
  await page.getByText("Front Desk", { exact: true }).waitFor();

  await navigate("Audit Log");
  await page.getByRole("heading", { name: "Audit log" }).waitFor();
  await page.getByText("Accountability across the front desk").waitFor();
  await page.getByLabel("Staff member").selectOption({ label: "Test Owner" });
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.locator(".auditTable").getByText("Test Owner", { exact: true }).first().waitFor();
  let auditOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (auditOverflow > 1) throw new Error(`Audit log overflows desktop by ${auditOverflow}px`);
  await page.screenshot({ path: "release/e2e-audit-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 800, height: 700 });
  await page.waitForTimeout(250);
  auditOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (auditOverflow > 1) throw new Error(`Audit log overflows tablet by ${auditOverflow}px`);
  const hiddenNavigation = await page.locator("aside").evaluate((element) => { const rect = element.getBoundingClientRect(); return { right: rect.right, visibility: getComputedStyle(element).visibility }; });
  if (hiddenNavigation.right > 1 || hiddenNavigation.visibility !== "hidden") throw new Error(`Closed navigation remains visible at tablet width: ${JSON.stringify(hiddenNavigation)}`);
  await page.screenshot({ path: "release/e2e-audit-tablet.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  await navigate("Reports");
  await page.getByRole("heading", { name: "Reports" }).waitFor();
  await page.getByText("Daily activity").waitFor();
  await page.getByRole("button", { name: "7 days" }).click();
  await page.getByText("Revenue by plan").waitFor();
  await page.getByRole("button", { name: "Export report" }).click();
  await page.getByText("PDF summary").waitFor();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.screenshot({ path: "release/e2e-reports.png", fullPage: true });

  await navigate("Settings");
  await page.getByRole("button", { name: "Gym & receipts", exact: true }).click();
  await page.getByRole("heading", { name: "Gym identity and receipts" }).waitFor();
  await page.getByLabel("Language and formatting").waitFor();
  await page.getByLabel("Currency").waitFor();
  await page.getByLabel("Timezone").waitFor();
  await page.getByLabel("Welcome message timeout (seconds)").fill("6");
  await page.getByLabel("Gym closing time").fill("21:30");
  await page.getByLabel(/Kiosk exit PIN/).fill("246810");
  await page.getByLabel("Enable face recognition in kiosk").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByLabel("Current PIN").fill("123456");
  await page.getByRole("button", { name: "Save changes" }).last().click();
  await page.waitForTimeout(250);
  const settingsAlerts = await page.getByRole("alert").allTextContents();
  if (settingsAlerts.length) console.log("KIOSK_SETTINGS_ALERTS", settingsAlerts);
  try { await page.getByText("Settings saved.", { exact: true }).waitFor({ timeout: 5000 }); }
  catch (error) { console.log("KIOSK_SETTINGS_STATE", await page.locator("body").innerText()); console.log("RENDERER_ERRORS", rendererErrors); throw error; }
  await navigate("Members");
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByRole("button", { name: "Enroll face" }).waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  await navigate("Kiosk");
  await page.getByRole("button", { name: "Recognize face" }).waitFor();
  await page.getByRole("button", { name: "Start presentation mode" }).click();
  if (!(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()))) throw new Error("Kiosk presentation did not enter fullscreen");
  await page.getByRole("button", { name: "Exit kiosk" }).click();
  await page.getByLabel("Kiosk exit PIN").fill("246810");
  await page.getByRole("button", { name: "Unlock and exit" }).click();
  await page.getByRole("heading", { name: "Member kiosk" }).waitFor();
  await navigate("Settings");
  await page.getByRole("button", { name: "Member documents", exact: true }).click();
  await page.getByLabel("Document name").fill("Medical fitness certificate");
  await page.getByRole("button", { name: "Add requirement" }).click();
  await page.getByText("Medical fitness certificate", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  if ((await page.locator("html").getAttribute("data-mode")) !== "dark")
    await page.getByRole("button", { name: "Use dark mode" }).click();
  await page.getByRole("button", { name: "Ocean" }).click();
  if ((await page.locator("html").getAttribute("data-mode")) !== "dark")
    throw new Error("Dark mode did not apply");
  if ((await page.locator("html").getAttribute("data-theme")) !== "Ocean")
    throw new Error("Theme did not apply");

  await navigate("Backup");
  await page.getByRole("heading", { name: "Backup & recovery" }).waitFor();
  await page.getByRole("button", { name: "Back up now" }).waitFor();
  await page.getByRole("button", { name: "Choose backup file" }).waitFor();
  await page.getByRole("button", { name: "Erase all OpenGym data" }).waitFor();
  await page.screenshot({ path: "release/e2e-backup.png", fullPage: true });

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("heading", { name: "Staff sign in" }).waitFor();
  await page
    .getByLabel("Staff account")
    .selectOption({ label: "Front Desk Test · Front Desk" });
  await page.getByLabel("PIN").fill("654321");
  await page.getByRole("button", { name: "Open front desk" }).click();
  await page.getByRole("heading", { name: "Front desk overview" }).waitFor();
  if (await page.getByRole("button", { name: "Staff", exact: true }).count())
    throw new Error("Front Desk unexpectedly received Staff navigation");
  if (await page.getByRole("button", { name: "Reports", exact: true }).count())
    throw new Error("Front Desk unexpectedly received Reports navigation");
  if (await page.getByRole("button", { name: "Audit Log", exact: true }).count())
    throw new Error("Front Desk unexpectedly received Audit Log navigation");
  await navigate("Settings");
  await page.getByRole("heading", { name: "Appearance", exact: true }).waitFor();
  if (await page.getByText("Gym details", { exact: true }).count())
    throw new Error("Front Desk unexpectedly received gym settings access");

  await navigate("Plans");
  await page.getByRole("heading", { name: "Plans", exact: true }).waitFor();
  await page.setViewportSize({ width: 800, height: 700 });
  await page.getByRole("button", { name: "Open navigation" }).waitFor();
  const closedAside = await page.locator("aside").evaluate((element) => getComputedStyle(element).transform);
  if (closedAside === "none") throw new Error("Responsive navigation is not collapsed");
  const pageBounds = await page.locator("main.page").boundingBox();
  if (!pageBounds || pageBounds.width < 760) throw new Error(`Responsive page is being cropped: ${pageBounds?.width}`);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Close navigation menu" }).waitFor();
  await page.getByRole("button", { name: "Close navigation menu" }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "release/e2e-responsive.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1) throw new Error(`Mobile layout overflows by ${overflow}px`);
  const planCardBounds = await page.locator(".planCard").first().boundingBox();
  if (planCardBounds && planCardBounds.x + planCardBounds.width > 390) throw new Error("Plan card is cropped on mobile");
  await page.screenshot({ path: "release/e2e-mobile.png", fullPage: true });
  if (rendererErrors.length)
    throw new Error(`Renderer errors: ${rendererErrors.join("; ")}`);
  console.log(
    `ELECTRON_E2E_OK=setup,login,members,memberships,freeze-history,attendance,kiosk-lock,payments,staff,permissions,audit,reports,themes,responsive,accessibility,keyboard,errors,commands,role-ux; STARTUP_MS=${startupMs}; MEMBER_SAVE_MS=${memberSaveMs}; SEARCH_MS=${searchMs}`,
  );
} finally {
  await app?.close();
  rmSync(profile, { recursive: true, force: true });
}
