import { chromium } from "playwright-core";
const BASE = "http://localhost:4173/project-communicate/";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) process.exitCode = 1;
};

await page.goto(BASE);
await page.waitForSelector(".board .cell");
check("36 core words rendered", (await page.locator(".board .cell").count()) === 36);
const imgs = await page
  .locator(".board img.symbol")
  .evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
check(`symbols load (${imgs.length})`, imgs.length > 20 && imgs.every(Boolean));

// Grid position is fixed: "I" top-left, "more" row 1 col 6
const box = async (label) =>
  page
    .getByRole("button", { name: new RegExp(`^${label}$`) })
    .first()
    .boundingBox();
const bI = await box("I"),
  bMore = await box("more"),
  bYou = await box("you");
check(
  "I is top-left of board, you below it",
  bI.x < bMore.x && Math.abs(bI.y - bMore.y) < 2 && bYou.y > bI.y,
);

for (const w of ["I", "want", "more"])
  await page
    .getByRole("button", { name: new RegExp(`^${w}$`) })
    .first()
    .click();
await page.waitForTimeout(400);
let text = await page.locator(".message-text").innerText();
check(`message built: "${text}"`, text.replace(/\s+/g, " ").trim() === "I want more");

// Repeat guard: two fast taps on 'more'
const more = page.getByRole("button", { name: /^more$/ }).first();
await more.click();
await more.click({ delay: 0 });
await page.waitForTimeout(50);
text = await page.locator(".message-text").innerText();
check(`repeat guard kept one extra "more": "${text}"`, text.trim().split(/\s+/).length === 4);
await page.getByRole("button", { name: "Delete word" }).click();

// Keyboard
await page.getByRole("button", { name: /^Keyboard$/ }).click();
check("keyboard shown", (await page.locator(".keyboard .cell").count()) >= 33);
const kbRail = await page.getByRole("button", { name: /^Keyboard$/ }).boundingBox();
for (const ch of ["c", "o", "o", "k", "i", "e"])
  await page
    .getByRole("button", { name: new RegExp(`^${ch}$`) })
    .click({ delay: 0 })
    .then(() => page.waitForTimeout(320));
await page.getByRole("button", { name: "?" }).click();
text = await page.locator(".message-text").innerText();
check(`typed: "${text}"`, text.replace(/\s+/g, " ").trim() === "I want more cookie?");
await page.getByRole("button", { name: /^Words$/ }).click();
const wordsRail = await page.getByRole("button", { name: /^Keyboard$/ }).boundingBox();
check(
  "rail buttons don't move between pages",
  kbRail.x === wordsRail.x && kbRail.y === wordsRail.y,
);

// Speak whole message: headless has no voices -> large-text fallback
await page.getByRole("button", { name: /^.*Speak$/ }).click();
const fb = page.locator(".speech-fallback");
await fb.waitFor({ timeout: 6000 }).catch(() => {});
const fbVisible = await fb.isVisible();
console.log(
  "INFO  speech fallback shown:",
  fbVisible,
  fbVisible ? await page.locator(".fallback-text").innerText() : "(speech reported started)",
);
if (fbVisible) await page.getByRole("button", { name: "Done" }).click();

// Adult menu: short press does nothing, 3 s hold opens
const hold = page.getByRole("button", { name: /Adult menu/ });
const hb = await hold.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.waitForTimeout(800);
await page.mouse.up();
check(
  "short press does not open adult menu",
  !(await page.locator("dialog.adult-menu").isVisible()),
);
await page.mouse.down();
await page.waitForTimeout(3300);
await page.mouse.up();
check("3 s hold opens adult menu", await page.locator("dialog.adult-menu").isVisible());

// Settings: high contrast + modeling + ABC keyboard
await page.getByLabel("High contrast").check();
await page.getByLabel("Modeling mode").check();
await page.getByLabel("Keyboard layout").selectOption("abc");
await page.getByRole("button", { name: "Back to talking" }).click();
check(
  "high contrast applied",
  await page.evaluate(() => document.documentElement.classList.contains("high-contrast")),
);
check("modeling banner shown", await page.locator(".modeling-banner").isVisible());
const before = await page.locator(".message-text").innerText();
await page.getByRole("button", { name: /^go$/ }).click();
check("modeling highlights word", (await page.locator(".cell.modeled").count()) === 1);
check(
  "modeling does not change message",
  (await page.locator(".message-text").innerText()) === before,
);
await page.getByRole("button", { name: "Stop modeling" }).click();
await page.screenshot({ path: "/tmp/smoke/app-hc.png" });

// Reload: settings persist; offline works
await page
  .waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 })
  .catch(() => {});
await page.reload();
await page.waitForSelector(".board .cell");
check(
  "settings persisted across reload",
  await page.evaluate(() => document.documentElement.classList.contains("high-contrast")),
);
await page.getByRole("button", { name: /^Keyboard$/ }).click();
const firstKey = await page.locator(".keyboard .cell").first().innerText();
check(`ABC layout persisted (first key "${firstKey}")`, firstKey.trim() === "a");

await context.setOffline(true);
errors.length = 0;
await page.reload();
await page.waitForSelector(".board .cell, .keyboard .cell", { timeout: 8000 });
check("app reloads offline", (await page.locator(".cell").count()) > 30);
const offImgs = await page
  .getByRole("button", { name: /^Words$/ })
  .click()
  .then(() =>
    page
      .locator(".board img.symbol")
      .evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0)),
  );
check("symbols load offline", offImgs.length > 20 && offImgs.every(Boolean));
await context.setOffline(false);

// Reset to default and screenshot normal + phone portrait
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".board .cell");
await page.screenshot({ path: "/tmp/smoke/app.png" });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
await page.screenshot({ path: "/tmp/smoke/app-phone.png" });
await page.goto(BASE + "spikes/");
check("spike hub still reachable", (await page.locator("h1").innerText()).includes("Phase 0"));

check(`no errors (${errors.length})`, errors.length === 0);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
