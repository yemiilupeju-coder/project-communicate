import { chromium } from "playwright-core";
const BASE = "http://localhost:4173/project-communicate/";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1180, height: 820 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
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
const msg = async () =>
  (await page.locator(".message-text").innerText()).replace(/\s+/g, " ").trim();
const hold = async () => {
  const b = await page.getByRole("button", { name: /Adult menu/ }).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
};
const closeMenu = () => page.getByRole("button", { name: "Back to talking" }).click();

await page.goto(BASE);
await page.waitForSelector(".board .cell");
check("home board: 36 words", (await page.locator(".board .cell").count()) === 36);

// Topics and fixed folders
await tap("Topics");
check("12 topics + My sentences", (await page.locator(".topics .folder").count()) === 13);
const boxGrid = async () => page.locator(".page-body").boundingBox();
const gTopics = await boxGrid();
await tap("Food & drink");
check("food page title", (await page.locator(".page-title").innerText()) === "Food & drink");

await tap("Words");
await tap("I");
await tap("want");
await tap("Topics");
await tap("Food & drink");
await tap("pizza");
check(`fringe word added: "${await msg()}"`, (await msg()) === "I want pizza");
await tap("Words");
const gWords = await boxGrid();
check("grid area identical on every page", JSON.stringify(gTopics) === JSON.stringify(gWords));

// My body is one tap from anywhere
await tap("My body");
check("My body page in one tap", (await page.locator(".page-title").innerText()) === "My body");
check("private words text-only", (await btn("penis").locator("img").count()) === 0);
await tap("Clear");

// Endings
await tap("Words");
await tap("I");
await tap("go");
check("Endings enabled after a verb", await btn(/Word endings/).isEnabled());
await btn(/Word endings/).click();
const forms = await page.locator(".endings-bar .ending .label").allInnerTexts();
check(`go → ${forms.join(", ")}`, forms.join(",") === "goes,going,went,gone");
await tap("went");
check(`ending applied: "${await msg()}"`, (await msg()) === "I went");
check("My voice strip back after choosing", await page.locator(".voice-strip").isVisible());
await tap("Topics");
await tap("Places");
await tap("outside");
check(`"${await msg()}"`, (await msg()) === "I went outside");

// Sentences: save + recent
await btn(/^.*Speak$/).click();
await page.waitForTimeout(400);
if (await page.locator(".speech-fallback").isVisible())
  await page.getByRole("button", { name: "Done" }).click();
await tap("Topics");
await tap("My sentences");
check(
  "said today lists the message",
  (await page.locator(".sentence.recent").allInnerTexts()).includes("I went outside"),
);
await tap("Save my message");
check(
  "saved",
  (await page.locator(".sentence:not(.recent)").allInnerTexts()).includes("I went outside"),
);

// Adult: set a PIN, add a student, edit words
await hold();
check("menu opens (no PIN yet)", await page.locator("dialog.adult-menu").isVisible());
await page.getByRole("button", { name: "Set a PIN" }).click();
for (const d of "2468")
  await page.locator(".pin-pad").getByRole("button", { name: d, exact: true }).click();
await page.locator(".pin-pad").getByRole("button", { name: "OK" }).click();
for (const d of "2468")
  await page.locator(".pin-pad").getByRole("button", { name: d, exact: true }).click();
await page.locator(".pin-pad").getByRole("button", { name: "OK" }).click();
await page.waitForTimeout(300);
check(
  "PIN saved, menu back",
  (await page.locator("dialog.adult-menu").isVisible()) &&
    (await page.getByRole("button", { name: "Change PIN" }).count()) === 1,
);
await page.getByLabel("Name or nickname", { exact: true }).fill("Ava");
await page.getByRole("button", { name: "Rename" }).click();
await page.getByRole("button", { name: "Edit words" }).click();
check("edit banner", await page.locator(".edit-banner").isVisible());
await tap("Topics");
await tap("People");
const empties = await page.locator(".empty-slot").count();
check(`People page has ${empties} empty places`, empties === 21);
await page.getByRole("button", { name: "Add a word here: row 4, column 1" }).click();
await page.locator(".word-editor").getByLabel("Word on the button").fill("Ms. Patel");
await page.locator(".word-editor").getByLabel("Symbol").check();
await page.locator(".word-editor").getByLabel("Find a symbol").fill("teacher");
await page.locator(".symbol-picker button").first().click();
await page.getByRole("button", { name: "Save word" }).click();
await page.waitForTimeout(300);
check("added word in its place", await btn(/Edit Ms\. Patel/).isVisible());
const pos = await btn(/Edit Ms\. Patel/).evaluate((el) => [el.style.gridRow, el.style.gridColumn]);
check(`at row 4, col 1 (${pos})`, pos[0] === "4" && pos[1].startsWith("1"));
await tap(/^mom\. Tap to hide/);
check("mom hidden in edit view", await btn(/mom, hidden/).isVisible());
await page.getByRole("button", { name: "Done editing" }).click();
check(
  "hidden word gone for student",
  (await page.getByRole("button", { name: /^mom$/ }).count()) === 0,
);
const dadBox = await btn("dad").boundingBox();
check("dad didn't move", dadBox.x > 100);
await tap("Clear");
await tap("Ms. Patel");
check(`added word speaks into message: "${await msg()}"`, (await msg()) === "Ms. Patel");
await btn(/Word endings/).click();
check(
  "noun endings",
  (await page.locator(".endings-bar .ending .label").allInnerTexts()).includes("Ms. Patel's"),
);
await page.getByRole("button", { name: /^Keep/ }).click();

// PIN required now
await hold();
check("PIN pad shown", await page.locator(".pin-pad").isVisible());
for (const d of "1111")
  await page.locator(".pin-pad").getByRole("button", { name: d, exact: true }).click();
await page.locator(".pin-pad").getByRole("button", { name: "OK" }).click();
await page.waitForTimeout(300);
check("wrong PIN refused", (await page.locator(".pin-error").innerText()).includes("isn't right"));
for (const d of "2468")
  await page.locator(".pin-pad").getByRole("button", { name: d, exact: true }).click();
await page.locator(".pin-pad").getByRole("button", { name: "OK" }).click();
await page.waitForTimeout(400);
check("right PIN opens menu", await page.locator("dialog.adult-menu").isVisible());

// Backup download
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: "Download backup" }).click(),
]);
const path = await download.path();
const fs = await import("node:fs");
const backup = JSON.parse(fs.readFileSync(path, "utf8"));
check(
  `backup file ${download.suggestedFilename()}`,
  backup.format === "communicate-backup" &&
    backup.profile.name === "Ava" &&
    backup.profile.added.length === 1,
);

// Second student
await page.getByPlaceholder("Name or nickname").fill("Ben");
await page.getByRole("button", { name: "Add", exact: true }).click();
await page.waitForTimeout(300);
await closeMenu();
await tap("Topics");
await tap("People");
check(
  "Ben has his own board (mom visible, no Ms. Patel)",
  (await btn("mom").isVisible()) &&
    (await page.getByRole("button", { name: /Ms\. Patel/ }).count()) === 0,
);
await page.screenshot({ path: "/tmp/smoke/r2-people.png" });

// Reload: everything kept; switch back to Ava
await page
  .waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 })
  .catch(() => {});
await page.reload();
await page.waitForSelector(".board .cell");
await page.waitForTimeout(500);
await hold();
for (const d of "2468")
  await page.locator(".pin-pad").getByRole("button", { name: d, exact: true }).click();
await page.locator(".pin-pad").getByRole("button", { name: "OK" }).click();
await page.waitForTimeout(400);
const options = await page
  .getByLabel("This device is talking for")
  .locator("option")
  .allInnerTexts();
check(`students kept: ${options}`, options.join(",") === "Ava,Ben");
await page.getByLabel("This device is talking for").selectOption({ label: "Ava" });
await closeMenu();
await tap("Topics");
await tap("People");
check("Ava's word kept after reload", await btn("Ms. Patel").isVisible());
check(
  "Ava's hidden word still hidden",
  (await page.getByRole("button", { name: /^mom$/ }).count()) === 0,
);
await tap("Topics");
await tap("My sentences");
check(
  "saved sentence kept",
  (await page.locator(".sentence").allInnerTexts()).includes("I went outside"),
);

// Offline
await context.setOffline(true);
await page.reload();
await page.waitForSelector(".board .cell", { timeout: 8000 });
await tap("Topics");
await tap("Food & drink");
const imgs = await page
  .locator(".board img.symbol")
  .evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
check(`offline topic symbols load (${imgs.length})`, imgs.length > 20 && imgs.every(Boolean));
await context.setOffline(false);
await page.screenshot({ path: "/tmp/smoke/r2-food.png" });
await tap("My body");
await page.screenshot({ path: "/tmp/smoke/r2-body.png" });
await tap("Topics");
await page.screenshot({ path: "/tmp/smoke/r2-topics.png" });

const real = errors.filter((e) => !e.includes("ERR_INTERNET_DISCONNECTED"));
check(`no errors (${real.length})`, real.length === 0);
if (real.length) console.log(real.join("\n"));
await browser.close();
