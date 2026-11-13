import { chromium } from "playwright-core";
const BASE = "http://localhost:4173/";
const CODE = process.argv[2];
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) process.exitCode = 1;
};
const btn = (name) =>
  page
    .getByRole("button", {
      name: typeof name === "string" ? new RegExp(`^${name.replace(/[.?*+()]/g, "\\$&")}$`) : name,
    })
    .first();
const tap = async (name) => {
  await btn(name).click();
  await page.waitForTimeout(330);
};
const hold = async () => {
  const b = await page.getByRole("button", { name: /Adult menu/ }).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
};
const menu = () => page.locator("dialog.adult-menu");

// ── Demo ──
await page.goto(BASE + "demo/");
await page.waitForSelector(".board .cell");
check("demo banner", await page.locator(".demo-banner").isVisible());
await tap("Topics");
await tap("People");
check(
  "demo student's words",
  (await btn("Ms. Rivera").isVisible()) && (await btn("Grandma Rosa").isVisible()),
);
await tap("Topics");
await tap("My sentences");
check(
  "demo saved sentences",
  (await page.locator(".sentence").allInnerTexts()).includes("My name is Alex."),
);
await page.screenshot({ path: "/tmp/smoke/demo-sentences.png" });
await hold();
check("demo: no PIN, menu opens", await menu().isVisible());
check(
  "demo: no licence section",
  (await menu().getByRole("heading", { name: "Licence" }).count()) === 0,
);
await page.getByPlaceholder("Name or nickname").fill("Jordan");
await page.getByRole("button", { name: "Add", exact: true }).click();
await page.waitForTimeout(300);
const names = await page.getByLabel("This device is talking for").locator("option").allInnerTexts();
check(`demo: can add students (${names})`, names.length === 2);
await page.getByRole("button", { name: "Back to talking" }).click();
await page.reload();
await page.waitForSelector(".board .cell");
await page.waitForTimeout(400);
await hold();
check(
  "demo resets on reload",
  (await page.getByLabel("This device is talking for").locator("option").allInnerTexts()).join() ===
    "Alex (demo)",
);
await page.getByRole("button", { name: "Back to talking" }).click();
await page.screenshot({ path: "/tmp/smoke/demo-home.png" });

// ── Real app: Family by default ──
await page.goto(BASE);
await page.waitForSelector(".board .cell");
await page.waitForTimeout(400);
check("real app has no demo banner", (await page.locator(".demo-banner").count()) === 0);
await hold();
check(
  "real app: demo student not leaked",
  !(await page.getByLabel("This device is talking for").locator("option").allInnerTexts())
    .join()
    .includes("Alex"),
);
check("Family status shown", (await menu().innerText()).includes("Family (free, for home use)"));
check(
  "Family: Add student disabled with explanation",
  !(await page.getByRole("button", { name: "Add", exact: true }).isEnabled()) &&
    (await menu().innerText()).includes("Schools need a classroom"),
);
check(
  "Family: first student can edit words",
  await page.getByRole("button", { name: "Edit words" }).isEnabled(),
);

// Bad code, then real code
await page.getByLabel("Licence code from GiftedTech").fill("GT-0000-0000");
await page.getByRole("button", { name: "Activate" }).click();
await page.waitForTimeout(1500);
check("unknown code explained", (await menu().innerText()).includes("wasn't found"));
await page.getByLabel("Licence code from GiftedTech").fill(CODE.toLowerCase().replace(/-/g, " "));
await page.getByRole("button", { name: "Activate" }).click();
await page.waitForTimeout(1500);
const txt = await menu().innerText();
check(
  "licence activated",
  txt.includes("Licensed to Maple Elementary (test)") &&
    /(pilot|classroom|school|district) licence until \d{4}-\d{2}-\d{2}/.test(txt),
);
await page.getByPlaceholder("Name or nickname").fill("Ben");
await page.getByRole("button", { name: "Add", exact: true }).click();
await page.waitForTimeout(300);
check(
  "licensed: second student added",
  (await page.getByLabel("This device is talking for").locator("option").count()) === 2,
);
check(
  "licensed: second student can edit",
  await page.getByRole("button", { name: "Edit words" }).isEnabled(),
);
await menu().screenshot({ path: "/tmp/smoke/licence-menu.png" });

// Offline reload keeps licence
await page.getByRole("button", { name: "Back to talking" }).click();
await page
  .waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 })
  .catch(() => {});
await context.setOffline(true);
await page.reload();
await page.waitForSelector(".board .cell");
await page.waitForTimeout(500);
await hold();
check(
  "licence works offline after reload",
  /(pilot|classroom|school|district) licence until \d{4}-\d{2}-\d{2}/.test(
    await menu().innerText(),
  ),
);
await context.setOffline(false);

// Remove licence: second student keeps words, loses team tools; first keeps them
await page.getByRole("button", { name: "Remove licence" }).click();
await page.waitForTimeout(300);
await page.getByLabel("This device is talking for").selectOption({ label: "Ben" });
await page.waitForTimeout(300);
check(
  "unlicensed: Ben's Edit words locked with explanation",
  !(await page.getByRole("button", { name: "Edit words" }).isEnabled()) &&
    (await menu().innerText()).includes("words all still work"),
);
await page.getByLabel("This device is talking for").selectOption({ label: "Student" });
await page.waitForTimeout(300);
check(
  "unlicensed: first student keeps team tools",
  await page.getByRole("button", { name: "Edit words" }).isEnabled(),
);
await page.getByRole("button", { name: "Back to talking" }).click();
await tap("I");
await tap("want");
check(
  "communication unaffected",
  (await page.locator(".message-text").innerText()).replace(/\s+/g, " ").trim() === "I want",
);

// Device-management link
const p2 = await (await browser.newContext()).newPage();
await p2.goto(BASE + "?licence=" + CODE);
await p2.waitForSelector(".board .cell");
await p2.waitForTimeout(2500);
check("?licence= link removed from address", !p2.url().includes("licence="));
const b2 = await p2.getByRole("button", { name: /Adult menu/ }).boundingBox();
await p2.mouse.move(b2.x + 5, b2.y + 5);
await p2.mouse.down();
await p2.waitForTimeout(3300);
await p2.mouse.up();
check(
  "?licence= link activates",
  (await p2.locator("dialog.adult-menu").innerText()).includes("Maple Elementary (test)"),
);

const real = errors.filter(
  (e) => !/ERR_INTERNET_DISCONNECTED|404 \(Not Found\)|Failed to load resource/.test(e),
);
check(`no errors (${real.length})`, real.length === 0);
if (real.length) console.log(real.join("\n"));
await browser.close();
