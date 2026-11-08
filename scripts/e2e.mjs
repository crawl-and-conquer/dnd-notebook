// End-to-end check of the real desktop app. Launches a built exe with its own app data
// folder, drives it over WebView2's debugging port and only ever touches
// test-fixtures/_scratch/e2e. Usage: npm run e2e  (DND_NOTEBOOK_EXE overrides the exe path).
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const root = path.resolve(import.meta.dirname, "..");
const scratch = path.join(root, "test-fixtures", "_scratch", "e2e");
const exe = process.env.DND_NOTEBOOK_EXE ?? path.join(root, "src-tauri", "target", "release", "dnd-notebook.exe");
const pdf = path.join(root, "docs", "reference", "cosworth-ddb-sheet.pdf");
const shots = path.join(scratch, "shots");
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = (d) =>
  fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map((f) => f.replace(/\\/g, "/")).sort() : [];

const results = [];
const check = (name, ok, detail = "") => {
  results.push(!!ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  (${detail})` : ""}`);
};

if (!fs.existsSync(exe)) {
  console.error(`No app at ${exe}. Build it first: npx tauri build --no-bundle`);
  process.exit(2);
}
if (process.platform === "win32") {
  const running = execSync('tasklist /FI "IMAGENAME eq dnd-notebook.exe" /FO CSV /NH').toString();
  if (/dnd-notebook\.exe/i.test(running)) {
    console.error("Close the Adventurer's Notebook first: a running copy takes over new windows.");
    process.exit(2);
  }
}

fs.rmSync(scratch, { recursive: true, force: true });
const appData = path.join(scratch, "appdata");
const folder = path.join(scratch, "Cosworth");
const moved = path.join(scratch, "Moved");
const exports = path.join(scratch, "exports");
for (const d of [appData, folder, moved, exports, shots]) fs.mkdirSync(d, { recursive: true });

const app = spawn(exe, [], {
  env: {
    ...process.env,
    DND_NOTEBOOK_APP_DIR: appData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  },
  stdio: "ignore",
});

let browser;
try {
  for (let i = 0; i < 60 && !browser; i++) {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch(() => null);
    if (!browser) await sleep(1000);
  }
  if (!browser) throw new Error("Could not reach the WebView2 debugging port");
  const page = browser.contexts()[0].pages()[0];
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
  // The native folder picker cannot be driven, so answer its IPC request in the page.
  // Tauri sends commands with fetch to ipc.localhost; only plugin:dialog|open is answered here.
  const pickFolder = (f) =>
    page.evaluate((f) => {
      const w = window;
      w.__origFetch ??= w.fetch;
      w.fetch = (u, o) =>
        /ipc\.localhost\/plugin%3Adialog%7Copen/.test(String(u))
          ? Promise.resolve(
              new Response(JSON.stringify(f), {
                headers: { "Content-Type": "application/json", "Tauri-Response": "ok" },
              }),
            )
          : w.__origFetch(u, o);
    }, f);

  await page.waitForSelector(".app", { timeout: 60000 });
  await page.waitForTimeout(1000);
  check("starts with an empty shelf", (await page.locator("text=New character").count()) > 0);

  // New character, then the import offered by the second step.
  await page.click("text=New character");
  await page.fill(".new-character-dialog input[type=text]", "Cosworth");
  await pickFolder(folder);
  await page.click(".new-character-dialog >> text=Choose folder");
  await page.click(".new-character-dialog >> text=Create character");
  await page.waitForSelector(".new-character-next");
  const nb = path.join(folder, "notebook");
  check("creates notebook/character.json", fs.existsSync(path.join(nb, "character.json")));
  await page.click("text=Import a character sheet");
  await page.waitForSelector(".import-modal");
  await page.setInputFiles(".import-modal input[type=file]", pdf);
  await page.waitForSelector(".import-modal .found", { timeout: 30000 });
  await page.click("text=Fill the notebook");
  await page.waitForSelector(".done-msg", { timeout: 30000 });
  await page.click(".import-modal >> text=Close");
  await page.waitForTimeout(1500);
  await shot("01-imported");
  const files = list(nb);
  check("writes sheet.json", files.includes("sheet.json"));
  check("writes eight sheet pages", files.filter((f) => f.startsWith("pages/sheet/") && f.endsWith(".page.json")).length === 8);
  check("keeps a copy of the imported PDF", files.some((f) => /^imports\/.+\.pdf$/.test(f)));
  check("fills Backstory", files.some((f) => f.startsWith("pages/backstory/") && f.endsWith(".page.json")));

  // Writing on the first session page.
  await page.click(".tab >> text=Sessions");
  await page.waitForTimeout(800);
  const box = await page.locator(".page.l canvas").first().boundingBox();
  await page.keyboard.press("p");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(box.x + box.width * (0.3 + i * 0.03), box.y + box.height * (0.6 + Math.sin(i) * 0.03));
  await page.mouse.up();
  await page.keyboard.press("t");
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.waitForTimeout(300);
  await page.keyboard.type("Arrived in Saltmarsh. Met Varis on the docks.");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);
  await shot("02-written");
  const sessDir = path.join(nb, "pages", "sessions");
  const first = list(sessDir).find((f) => f.endsWith(".page.json"));
  const firstPath = first && path.join(sessDir, first);
  const pg = firstPath ? JSON.parse(fs.readFileSync(firstPath, "utf8")) : { elements: [] };
  check("saves the stroke", pg.elements.some((e) => e.type === "stroke"));
  check("saves the text", pg.elements.some((e) => e.type === "text" && /Saltmarsh/.test(e.text)), first);

  // An outside change to the page file is picked up, not overwritten.
  if (firstPath) {
    const now = new Date().toISOString();
    pg.elements.push({ id: "outside1", type: "text", x: 92, y: 420, rotation: 0, createdAt: now, updatedAt: now, text: "Added from outside", w: 442, fontSize: 26, colour: "#2a4e7f", heading: false, font: "hand", sticky: false });
    pg.updatedAt = now;
    fs.writeFileSync(firstPath, JSON.stringify(pg, null, 2));
    await sleep(2500);
    await shot("03-outside-change");
    const after = JSON.parse(fs.readFileSync(firstPath, "utf8"));
    check("keeps an outside change", after.elements.some((e) => e.id === "outside1"));
  }

  // Previously on... with no AI set up says so and sends nothing.
  await page.click(".recap-btn");
  await page.waitForSelector(".recap-error", { timeout: 10000 }).catch(() => null);
  const recapMsg = await page.locator(".recap-error").textContent().catch(() => "");
  check("Previously on... explains what is missing", /earlier sessions|model|AI/i.test(recapMsg ?? ""), recapMsg);

  // Export this character as Markdown and PDF.
  await page.keyboard.press("Control+Shift+E");
  await page.waitForSelector(".export-dialog");
  await page.click(".export-dialog label:has-text('This character')");
  await page.click(".export-dialog label:has-text('Both')");
  await pickFolder(exports);
  await page.click(".export-dialog >> text=Choose folder");
  await page.click(".export-dialog .form-actions >> button[type=submit]");
  await page.waitForSelector(".export-dialog >> text=Open folder", { timeout: 180000 });
  await shot("04-exported");
  const exported = list(exports);
  check("exports Markdown pages", exported.some((f) => f.endsWith("Sessions/0001-session-1.md")));
  check("exports a PDF per spread", exported.some((f) => f.endsWith("Sessions/0001-session-1.pdf")));
  check("exports the character PDF", exported.some((f) => f.endsWith("Cosworth/Cosworth.pdf")));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Change folder: move the notebook.
  await page.keyboard.press("Control+,");
  await page.waitForSelector(".side-panel");
  await page.click(".side-panel >> text=Change folder");
  await pickFolder(moved);
  await page.click("[role=dialog] >> text=Choose folder");
  await page.waitForTimeout(500);
  await page.click("[role=dialog] >> text=Move notebook");
  await page.waitForTimeout(3000);
  await shot("05-moved");
  const movedFiles = list(path.join(moved, "notebook"));
  check("moves the notebook", movedFiles.includes("character.json") && movedFiles.some((f) => f.startsWith("pages/sessions/")));

  // Handwriting builder opens.
  await page.keyboard.press("Escape");
  await page.click("[aria-label='Handwriting builder']");
  await page.waitForTimeout(1200);
  await shot("06-builder");
  check("opens the handwriting builder", (await page.locator("[role=dialog]").count()) > 0);

  check("no uncaught errors in the page", errors.length === 0, errors.join(" | "));
} catch (e) {
  check("run finished", false, e instanceof Error ? e.message : String(e));
} finally {
  await browser?.close().catch(() => {});
  app.kill();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots in ${shots}`);
process.exit(failed ? 1 : 0);
