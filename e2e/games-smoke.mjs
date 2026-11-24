// Fun zone smoke test: the game loads in its iframe, plays a full round with the keyboard,
// makes no outside requests, and opens again with the network off.
// Run against `npx vite preview --port 4173 --strictPort` (BASE can be overridden).
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://localhost:4173/";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ viewport: { width: 1180, height: 900 } });
const page = await context.newPage();
const errors = [];
const outside = [];
const origin = new URL(BASE).origin;
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
context.on("request", (r) => {
  const u = r.url();
  if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) outside.push(u);
});
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) process.exitCode = 1;
};

// Record the game's messages as the page receives them.
await context.addInitScript(() => {
  window.__hal = [];
  window.addEventListener("message", (e) => {
    if (e.data && e.data.source === "here-a-little") window.__hal.push(e.data);
  });
});
const events = () => page.evaluate(() => window.__hal);
const waitFor = (type) =>
  page.waitForFunction((t) => window.__hal.some((e) => e.type === t), type, { timeout: 15000 });

await page.goto(BASE + "games/");
await page.getByRole("heading", { name: "Fun zone" }).waitFor();
check("Fun zone page renders", true);
check(
  "Back link points to the communicator",
  (await page.getByRole("link", { name: /Back to Communicate/ }).getAttribute("href")) === "/",
);
const frame = page.frameLocator('iframe[title="Here a Little, There a Little"]');
await frame.locator("#begin").click();
await waitFor("round-start");
check("round starts after Begin painting", true);

// Space paints where the hand points; the game ignores presses closer than 0.4 s apart.
const canvas = frame.locator("#cv");
await canvas.focus();
for (let i = 0; i < 12; i++) {
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
}
await waitFor("round-complete");
const done = (await events()).find((e) => e.type === "round-complete");
check(
  `12 keyboard strokes give a perfect round (followed ${done?.followed})`,
  done?.perfect === true,
);
check("12 stroke events", (await events()).filter((e) => e.type === "stroke").length === 12);
await page
  .getByText("A perfect painting!")
  .waitFor({ timeout: 5000 })
  .then(() => check("page announces the perfect round", true))
  .catch(() => check("page announces the perfect round", false));
await page.screenshot({ path: "/tmp/games-fun-zone.png" });

check(`no requests outside the site (${outside.length})`, outside.length === 0);

// Offline: wait for the service worker to take control, cut the network, reload.
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
await context.setOffline(true);
await page.reload();
await page.getByRole("heading", { name: "Fun zone" }).waitFor({ timeout: 10000 });
await frame.locator("#begin").click();
await waitFor("round-start");
check("Fun zone and game open offline", true);
await context.setOffline(false);

const real = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e));
check(`no page errors (${real.join(" | ")})`, real.length === 0);
await browser.close();
