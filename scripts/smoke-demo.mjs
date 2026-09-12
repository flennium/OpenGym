import { _electron as electron } from "playwright";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const profile = mkdtempSync(join(tmpdir(), "opengym-demo-smoke-"));
copyFileSync(resolve("release/OpenGym-Demo-500.db"), join(profile, "opengym.db"));
let app;
try {
  app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: resolve(".") });
  const page = await app.firstWindow();
  await page.getByRole("heading", { name: "Staff sign in" }).waitFor({ timeout: 10000 });
  const staffOptions = await page.getByLabel("Staff account").locator("option").count();
  if (staffOptions !== 5) throw new Error(`Expected 5 demo staff accounts, found ${staffOptions}`);
  await page.getByLabel("PIN").fill("123456");
  await page.getByRole("button", { name: "Open front desk" }).click();
  await page.getByRole("heading", { name: "Today" }).waitFor();
  await page.getByText("14", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await page.getByRole("heading", { name: "Members" }).waitFor();
  const memberRows = await page.locator("tbody tr").count();
  if (memberRows !== 500) throw new Error(`Expected 500 member rows, found ${memberRows}`);
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  const paymentRows = await page.locator("tbody tr").count();
  if (paymentRows !== 400) throw new Error(`Expected 400 payment rows, found ${paymentRows}`);
  await page.getByRole("button", { name: "Audit Log", exact: true }).click();
  await page.getByText(/1000 events/).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Demo data caused ${overflow}px horizontal overflow`);
  console.log(`DEMO_E2E_OK=staff:${staffOptions},members:${memberRows},payments:${paymentRows},audit:1000,overflow:${overflow}`);
} finally {
  await app?.close();
  rmSync(profile, { recursive: true, force: true });
}
