import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * In-browser save/load/new/autosave smoke test.
 *
 * Requires the dev server on http://localhost:5199/ (DevBridge only mounts in
 * DEV builds). Verifies the whole persistence loop against the real browser:
 * load a two-room design, watch the autosave pick it up, reload the page and
 * confirm the design and settings come back, then exercise New + a corrupt
 * file that must leave the current design untouched.
 *
 * Run: npm run dev  (separate shell)
 *      npx tsx scripts/design-smoke.mjs   (from the repo root)
 */
const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:5199/";
const OUT_DIR = join(tmpdir(), "opencode", "design-tests");

mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-lcd-text",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });

const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("requestfailed", (request) =>
  errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`),
);

const checks = [];
const expect = (label, condition, detail = "") => {
  checks.push({ label, ok: condition, detail });
};

const shotStats = {};

const gotoSettled = async () => {
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await new Promise((resolve) => setTimeout(resolve, 2500));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shot = async (name) => {
  const viewport = await page.$(".viewport");
  if (!viewport) return;
  const buffer = await viewport.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  const b64 = buffer.toString("base64");
  shotStats[name] = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let warm = 0;
    let minX = canvas.width;
    let maxX = 0;
    let minY = canvas.height;
    let maxY = 0;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const i = (y * canvas.width + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (r > 80 && r - b >= 6 && r >= g && g >= b) {
          warm += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      warm,
      bboxW: maxX - minX,
      bboxH: maxY - minY,
      width: canvas.width,
      height: canvas.height,
    };
  }, b64);
  console.log(
    `shot: ${name}.png warm=${shotStats[name].warm} bbox=${shotStats[name].bboxW}x${shotStats[name].bboxH} of ${shotStats[name].width}x${shotStats[name].height}`,
  );
};

// ---------------------------------------------------------------------------
console.log("--- boot / toolbar ---");
// ---------------------------------------------------------------------------
await gotoSettled();

{
  const boot = await page.evaluate(() => {
    const api = window.__homeDesigner;
    return {
      present: Boolean(api),
      hasAutosave: api?.hasAutosave() ?? null,
      roomCount: api ? Object.keys(api.getHouse().rooms).length : null,
      buttons: [...document.querySelectorAll(".toolbar button")].map((b) => b.textContent),
    };
  });
  expect("design bridge available", boot.present === true);
  expect("fresh profile starts without an autosave", boot.hasAutosave === false);
  expect("sample house has one room", boot.roomCount === 1, String(boot.roomCount));
  expect(
    "toolbar exposes New / Save / Load",
    ["New", "Save", "Load"].every((text) => boot.buttons.includes(text)),
    boot.buttons.join("|"),
  );
}

// ---------------------------------------------------------------------------
console.log("--- load a two-room design through the bridge ---");
// ---------------------------------------------------------------------------
{
  const twoRoom = await page.evaluate(() => {
    const api = window.__homeDesigner;
    const doc = JSON.parse(api.getDesignJson());
    const baseWall = Object.values(doc.house.walls)[0];
    const wall = (id, start, end) => ({
      id,
      start: { x: start[0], z: start[1] },
      end: { x: end[0], z: end[1] },
      height: baseWall.height,
      thickness: baseWall.thickness,
    });
    Object.assign(doc.house.walls, {
      "smoke-wall-s": wall("smoke-wall-s", [6, 0], [12, 0]),
      "smoke-wall-e": wall("smoke-wall-e", [12, 0], [12, 5]),
      "smoke-wall-n": wall("smoke-wall-n", [12, 5], [6, 5]),
      "smoke-wall-w": wall("smoke-wall-w", [6, 5], [6, 0]),
    });
    doc.house.rooms["room-2"] = {
      id: "room-2",
      name: "Smoke Room",
      position: { x: 6, z: 0 },
      width: 6,
      depth: 5,
      height: baseWall.height,
      wallThickness: baseWall.thickness,
      edges: {
        south: "smoke-wall-s",
        east: "smoke-wall-e",
        north: "smoke-wall-n",
        west: "smoke-wall-w",
      },
    };
    const result = api.loadDesignJson(JSON.stringify(doc));
    const house = api.getHouse();
    return {
      ok: result.ok,
      warnings: result.warnings,
      rooms: Object.keys(house.rooms).length,
      room2: Boolean(house.rooms["room-2"]),
      canUndo: api.getCanUndo(),
    };
  });
  expect(
    "two-room design loads",
    twoRoom.ok === true && twoRoom.rooms === 2 && twoRoom.room2 === true,
    JSON.stringify(twoRoom),
  );
  expect("document boundary clears history on load", twoRoom.canUndo === false);

  await wait(2200);
  const autosaved = await page.evaluate(() => {
    const api = window.__homeDesigner;
    const doc = JSON.parse(api.getDesignJson());
    return {
      hasAutosave: api.hasAutosave(),
      rooms: Object.keys(doc.house.rooms).length,
    };
  });
  expect("edit triggers the autosave", autosaved.hasAutosave === true);
  expect(
    "autosave content carries the edit",
    autosaved.rooms === 2,
    String(autosaved.rooms),
  );
  await shot("design-01-two-rooms");
}

// ---------------------------------------------------------------------------
console.log("--- a rejected file must not touch the current design ---");
// ---------------------------------------------------------------------------
{
  const bad = await page.evaluate(() => {
    const api = window.__homeDesigner;
    const before = Object.keys(api.getHouse().rooms).length;
    const result = api.loadDesignJson("{\"house\": \"not really\"");
    return {
      ok: result.ok,
      error: result.error,
      before,
      after: Object.keys(api.getHouse().rooms).length,
    };
  });
  expect(
    "corrupt file is rejected with a message",
    bad.ok === false && typeof bad.error === "string" && bad.error.length > 0,
    JSON.stringify(bad),
  );
  expect(
    "rejected file leaves the current design untouched",
    bad.before === 2 && bad.after === 2,
    `${bad.before} -> ${bad.after}`,
  );
}

// ---------------------------------------------------------------------------
console.log("--- reload restores the autosave ---");
// ---------------------------------------------------------------------------
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector("canvas", { timeout: 15000 });
await wait(2500);

{
  const restored = await page.evaluate(() => {
    const api = window.__homeDesigner;
    return {
      rooms: Object.keys(api.getHouse().rooms).length,
      room2: Boolean(api.getHouse().rooms["room-2"]),
      canUndo: api.getCanUndo(),
      hasAutosave: api.hasAutosave(),
      snapSize: api.getSnapSize(),
      viewMode: api.getViewMode(),
    };
  });
  expect(
    "autosave restores the two-room design after reload",
    restored.rooms === 2 && restored.room2 === true,
    JSON.stringify(restored),
  );
  expect("restore clears history", restored.canUndo === false);
  expect("autosave entry is preserved after restore", restored.hasAutosave === true);
  expect(
    "settings are restored with the document",
    restored.snapSize === 0.1 && restored.viewMode === "3d",
    JSON.stringify({ snapSize: restored.snapSize, viewMode: restored.viewMode }),
  );
}

// ---------------------------------------------------------------------------
console.log("--- settings changes flow through the autosave ---");
// ---------------------------------------------------------------------------
{
  await page.evaluate(() => window.__homeDesigner.setSnapSize(0.5));
  await wait(2200);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await wait(2500);

  const settings = await page.evaluate(() => {
    const api = window.__homeDesigner;
    const doc = JSON.parse(api.getDesignJson());
    return { snapSize: doc.settings.snapSize, liveSnapSize: api.getSnapSize() };
  });
  expect(
    "snap size change survives reload via autosave",
    settings.snapSize === 0.5 && settings.liveSnapSize === 0.5,
    JSON.stringify(settings),
  );
}

// ---------------------------------------------------------------------------
console.log("--- New reset through the toolbar ---");
// ---------------------------------------------------------------------------
{
  page.on("dialog", async (dialog) => dialog.accept());
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".toolbar button")].find(
      (b) => b.textContent === "New",
    );
    if (button) button.click();
  });
  await wait(900);
  page.off("dialog");

  const fresh = await page.evaluate(() => {
    const api = window.__homeDesigner;
    return {
      rooms: Object.keys(api.getHouse().rooms).length,
      room2: Boolean(api.getHouse().rooms["room-2"]),
      canUndo: api.getCanUndo(),
      selection: api.getSelection(),
      snapSize: api.getSnapSize(),
    };
  });
  expect(
    "New resets to the sample house",
    fresh.rooms === 1 && fresh.room2 === false,
    JSON.stringify(fresh),
  );
  expect(
    "New clears history and selection",
    fresh.canUndo === false && fresh.selection === null,
  );
  expect("New restores default settings", fresh.snapSize === 0.1, String(fresh.snapSize));
  await shot("design-02-after-new");

  const twoRoomStats = shotStats["design-01-two-rooms"];
  const freshStats = shotStats["design-02-after-new"];
  expect(
    "two-room scene renders wider than the sample room",
    twoRoomStats.bboxW > freshStats.bboxW * 1.1 || twoRoomStats.bboxH > freshStats.bboxH * 1.3,
    `two-room bbox ${twoRoomStats.bboxW}x${twoRoomStats.bboxH} vs fresh ${freshStats.bboxW}x${freshStats.bboxH}`,
  );
  expect(
    "the scene repaints between load and New",
    twoRoomStats.warm !== freshStats.warm,
    `warm ${twoRoomStats.warm} vs ${freshStats.warm}`,
  );
}

// ---------------------------------------------------------------------------
let failed = 0;
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.label}${check.ok ? "" : "  [" + check.detail + "]"}`);
  if (!check.ok) failed += 1;
}
console.log(`\nconsole/page errors: ${errors.length}`);
for (const error of errors) console.log("  " + error);

await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);