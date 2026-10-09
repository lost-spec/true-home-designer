import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:5199/";
const OUT_DIR = join(tmpdir(), "opencode", "ui-check");

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
page.on("response", (response) => {
  if (response.status() >= 400) {
    errors.push(`http ${response.status()}: ${response.url()}`);
  }
});

const checks = [];
const expect = (label, condition, detail = "") => {
  checks.push({ label, ok: Boolean(condition) });
  console.log(
    `${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : "  [" + detail + "]"}`,
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approx = (a, b, epsilon = 1e-4) => Math.abs(a - b) < epsilon;

const shot = async (name) => {
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  console.log(`shot: ${name}.png`);
};

const bridge = (fn, arg) => page.evaluate(fn, arg);

const project = (x, y, z) =>
  page.evaluate(
    (px, py, pz) => window.__homeDesigner.project(px, py, pz),
    x,
    y,
    z,
  );

const panelTitle = () =>
  page.evaluate(() => document.querySelector(".side-panel.right .panel-title")?.textContent ?? null);

const clickText = async (label) => {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
    if (!button) return false;
    button.click();
    return true;
  }, label);
  await sleep(350);
  return clicked;
};

const clickSelector = async (selector) => {
  const clicked = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
  await sleep(350);
  return clicked;
};

const clickAsset = async (name) => {
  const handle = await page.evaluateHandle((assetName) => {
    const button = [...document.querySelectorAll(".asset-list button")].find(
      (b) => b.querySelector(".asset-name")?.textContent === assetName,
    );
    if (button) button.scrollIntoView({ block: "center" });
    return button;
  }, name);
  const element = handle.asElement();
  if (!element) return false;
  const box = await element.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(500);
  return true;
};

const clickGround = async (x, z) => {
  const spot = await project(x, 0.02, z);
  if (!spot) return false;
  await page.mouse.move(spot.x, spot.y);
  await sleep(400);
  await page.mouse.click(spot.x, spot.y);
  await sleep(700);
  return true;
};

const setSearch = (value) =>
  page.evaluate((v) => {
    const el = document.querySelector('.asset-search input[type="search"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, value);

const listNames = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".asset-list .asset-name")].map(
      (el) => el.textContent ?? "",
    ),
  );

const toolbarOverflow = () =>
  page.evaluate(() => {
    const bar = document.querySelector(".toolbar");
    return { scroll: bar.scrollWidth, client: bar.clientWidth, h: bar.clientHeight };
  });

const widthValue = () =>
  page.evaluate(
    () => document.querySelector(".dimension-row input")?.value ?? null,
  );

await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector("canvas", { timeout: 15000 });
await sleep(2500);

// ---------------------------------------------------------------------------
console.log("--- boot layout ---");
{
  const canvas = await page.$(".viewport canvas");
  expect("canvas exists in viewport", Boolean(canvas));

  const overflow = await toolbarOverflow();
  expect(
    "toolbar has no horizontal overflow at 1400",
    overflow.scroll <= overflow.client,
    JSON.stringify(overflow),
  );
  expect(
    "toolbar is at most two rows at 1400",
    overflow.h <= 80,
    `h=${overflow.h}`,
  );

  const title = await panelTitle();
  expect("right panel title starts as Inspector", title === "Inspector", title ?? "null");

  const empty = await page.evaluate(
    () => document.querySelector(".inspector-empty")?.textContent ?? "",
  );
  expect(
    "empty state shows guidance",
    empty.includes("Nothing selected") && empty.includes("viewport"),
    empty.slice(0, 80),
  );

  const dims = await page.evaluate(() =>
    [...document.querySelectorAll(".dimension-row input")].map((i) => i.value),
  );
  expect(
    "room dimension row reads 6|5|2.7|0.2",
    dims.join("|") === "6|5|2.7|0.2",
    dims.join("|"),
  );

  const bootButtons = await page.evaluate(() =>
    ["New", "Save", "Load", "Undo", "Redo", "Select", "Hide ceiling", "Zoom in", "Zoom out", "3D view", "2D plan"].filter(
      (label) => ![...document.querySelectorAll("button")].some((b) => b.textContent === label),
    ),
  );
  expect(
    "toolbar exposes all tested labels",
    bootButtons.length === 0,
    bootButtons.join(","),
  );

  const tooltips = await page.evaluate(() =>
    ["Select", "Place object", "Hide ceiling", "Zoom in", "Undo"].filter((label) => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent === label,
      );
      return !btn || !btn.title;
    }),
  );
  expect(
    "toolbar actions carry tooltips",
    tooltips.length === 0,
    tooltips.join(","),
  );

  const headings = await page.evaluate(() =>
    [...document.querySelectorAll(".side-panel.right h1, .side-panel.right h2, .side-panel.right h3")].map((h) => h.textContent),
  );
  expect(
    "right panel has a single heading",
    headings.length === 1,
    headings.join(" | "),
  );

  await shot("01-boot");
}

// ---------------------------------------------------------------------------
console.log("--- asset search and chips ---");
{
  const before = (await listNames()).length;
  expect("asset list is populated", before > 0, `count=${before}`);

  await setSearch("sofa");
  await sleep(200);
  const sofaNames = await listNames();
  expect(
    "search sofa filters to sofa assets",
    sofaNames.length > 0 && sofaNames.every((n) => n.toLowerCase().includes("sofa")),
    sofaNames.join(","),
  );

  await setSearch("zzzzzz");
  await sleep(200);
  const emptyShown = await page.evaluate(
    () => Boolean(document.querySelector(".asset-empty")) && document.querySelectorAll(".asset-list button").length === 0,
  );
  expect("no-match search shows empty state", emptyShown);

  await setSearch("");
  await sleep(200);
  const after = (await listNames()).length;
  expect("clearing search restores list", after === before, `${before} -> ${after}`);

  const lightingClicked = await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".asset-chip")].find(
      (c) => c.textContent === "Kitchen",
    );
    if (!chip) return false;
    chip.click();
    return true;
  });
  await sleep(250);
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll(".asset-group-title")].map((g) => g.textContent),
  );
  const lightingOnly =
    lightingClicked && groups.length > 0 && groups.every((g) => g === "Kitchen");
  expect(
    "Kitchen chip filters to kitchen group",
    lightingOnly,
    groups.join(","),
  );

  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".asset-chip")].find(
      (c) => c.textContent === "All",
    );
    chip?.click();
  });
  await sleep(250);
}

// ---------------------------------------------------------------------------
console.log("--- placement and object inspector ---");
{
  const objectsBefore = await bridge(() =>
    Object.keys(window.__homeDesigner.getHouse().objects).length,
  );

  const assetClicked = await clickAsset("Sofa");
  expect("sofa asset button is clickable", assetClicked);

  const hint = await page.evaluate(() =>
    document.querySelector(".placement-hint")?.textContent ?? "",
  );
  expect(
    "placement hint appears",
    hint.includes("Sofa") && hint.includes("Click the floor"),
    hint.slice(0, 60),
  );

  await clickGround(4.63, 4.47);
  const selection = await bridge(() => window.__homeDesigner.getSelection());
  expect(
    "sofa placed and selected",
    selection?.kind === "object",
    JSON.stringify(selection),
  );

  const title = await panelTitle();
  expect("panel title switches to Object", title === "Object", title ?? "null");

  const rows = await page.evaluate(() => {
    const panel = document.querySelector(".side-panel.right");
    return {
      text: panel?.textContent ?? "",
      inspectorRows: document.querySelectorAll(".side-panel.right .inspector-row").length,
      materials: document.querySelector(".side-panel.right .material-title")?.textContent ?? null,
      slots: document.querySelectorAll(".side-panel.right .material-slot").length,
      placing: window.__homeDesigner.getPlacingAssetId(),
    };
  });
  expect(
    "object panel shows transform rows",
    ["Height", "Rotation Y", "Scale", "Can rotate"].every((label) => rows.text.includes(label)),
    rows.text.slice(0, 160),
  );
  expect(
    "object panel has six metadata rows",
    rows.inspectorRows >= 6,
    `rows=${rows.inspectorRows}`,
  );
  expect(
    "placement mode stays active after placing",
    rows.placing === "sofa",
    `placing=${rows.placing}`,
  );
  expect(
    "materials section present for sofa",
    rows.materials === "Materials" && rows.slots > 0,
    `title=${rows.materials} slots=${rows.slots}`,
  );

  const objectState = await bridge(() => {
    const house = window.__homeDesigner.getHouse();
    const sel = window.__homeDesigner.getSelection();
    return sel ? house.objects[sel.id] : null;
  });
  expect("placed sofa sits on the floor", objectState && approx(objectState.position.y, 0, 1e-3), JSON.stringify(objectState?.position));

  await shot("02-object-selected");
}

// ---------------------------------------------------------------------------
console.log("--- object controls ---");
{
  const before = await bridge(() => {
    const sel = window.__homeDesigner.getSelection();
    const house = window.__homeDesigner.getHouse();
    return { y: house.objects[sel.id].position.y, scale: house.objects[sel.id].scale, rot: house.objects[sel.id].rotationY };
  });

  const raised = await clickText("Raise");
  expect("Raise button works", raised);
  const afterRaise = await bridge(() => {
    const sel = window.__homeDesigner.getSelection();
    return window.__homeDesigner.getHouse().objects[sel.id].position.y;
  });
  expect("Raise lifts the object", afterRaise > before.y, `${before.y} -> ${afterRaise}`);

  const zoomed = await clickText("Zoom +");
  expect("Zoom + button works", zoomed);
  const afterZoom = await bridge(() => {
    const sel = window.__homeDesigner.getSelection();
    return window.__homeDesigner.getHouse().objects[sel.id].scale;
  });
  expect("Zoom + grows scale", afterZoom > before.scale, `${before.scale} -> ${afterZoom}`);

  const rotated = await clickText("Rotate +45°");
  expect("Rotate +45° button works", rotated);
  const afterRot = await bridge(() => {
    const sel = window.__homeDesigner.getSelection();
    return window.__homeDesigner.getHouse().objects[sel.id].rotationY;
  });
  expect(
    "Rotate +45° turns the object",
    approx(afterRot, before.rot + Math.PI / 4, 1e-3),
    `${before.rot} -> ${afterRot}`,
  );

  const removed = await clickText("Remove");
  expect("Remove button works", removed);
  const afterRemove = await bridge(() => ({
    count: Object.keys(window.__homeDesigner.getHouse().objects).length,
    selection: window.__homeDesigner.getSelection(),
  }));
  expect(
    "Remove deletes the sofa",
    afterRemove.count === 0 || afterRemove.selection === null,
    JSON.stringify(afterRemove),
  );
  const title = await panelTitle();
  expect("panel returns to Inspector after remove", title === "Inspector", title ?? "null");
  const placingAfterRemove = await bridge(
    () => window.__homeDesigner.getPlacingAssetId(),
  );
  expect(
    "placement stays armed after Remove",
    placingAfterRemove === "sofa",
    `placing=${placingAfterRemove}`,
  );
  await page.keyboard.press("Escape");
  await sleep(400);
  const placingAfterEscape = await bridge(
    () => window.__homeDesigner.getPlacingAssetId(),
  );
  expect(
    "Escape exits placement mode",
    placingAfterEscape === null,
    `placing=${placingAfterEscape}`,
  );
}

// ---------------------------------------------------------------------------
console.log("--- wall selection, add door, door inspector ---");
{
  const wallPick = await bridge(() => {
    const house = window.__homeDesigner.getHouse();
    const walls = Object.values(house.walls);
    walls.sort(
      (a, b) =>
        (b.start.z + b.end.z) / 2 + (b.start.x + b.end.x) / 2 -
        ((a.start.z + a.end.z) / 2 + (a.start.x + a.end.x) / 2),
    );
    return walls.map((w) => ({
      id: w.id,
      x: (w.start.x + w.end.x) / 2,
      z: (w.start.z + w.end.z) / 2,
      h: w.height,
      openings: Object.keys(house.openings).length,
    }));
  });
  const wall = wallPick[0];
  const spot = await project(wall.x, wall.h * 0.5, wall.z);
  const verified = await page.evaluate(
    ({ x, y, id }) => {
      const picked = window.__homeDesigner.pickWall(x, y);
      return picked === id;
    },
    { x: spot.x, y: spot.y, id: wall.id },
  );
  expect("projected wall point picks the wall", verified, wall.id);

  await page.mouse.move(spot.x, spot.y);
  await sleep(350);
  await page.mouse.click(spot.x, spot.y);
  await sleep(500);
  const title = await panelTitle();
  expect("clicking the wall opens Wall panel", title === "Wall", title ?? "null");

  const wallRows = await page.evaluate(
    () => document.querySelector(".side-panel.right")?.textContent ?? "",
  );
  expect(
    "wall panel keeps row labels",
    ["Length", "Height", "Thickness"].every((label) => wallRows.includes(label)),
    wallRows.slice(0, 160),
  );

  const addDoor = await clickText("Add door");
  expect("Add door button works", addDoor);
  await sleep(300);
  const doorTitle = await panelTitle();
  expect("new door is selected", doorTitle === "Door", doorTitle ?? "null");

  const doorFields = await page.evaluate(
    () => document.querySelectorAll(".side-panel.right .field-row input").length,
  );
  expect(
    "door inspector exposes numeric fields",
    doorFields >= 3,
    `inputs=${doorFields}`,
  );
  const openingCount = await bridge(
    () => Object.keys(window.__homeDesigner.getHouse().openings).length,
  );
  expect("opening was created", openingCount === 1, `count=${openingCount}`);

  await shot("03-door-selected");

  const removedDoor = await clickText("Remove");
  expect("Remove deletes the door", removedDoor);
  const countAfter = await bridge(
    () => Object.keys(window.__homeDesigner.getHouse().openings).length,
  );
  expect("door count is back to zero", countAfter === 0, `count=${countAfter}`);
}

// ---------------------------------------------------------------------------
console.log("--- room selection, steppers, undo/redo ---");
{
  // Floor point visible from the default camera: it must clear both wall tops
  // along the ray from (9, 7, 9), so it sits back-left of the room centre.
  await clickGround(-1.5, -2.0);
  const title = await panelTitle();
  expect("clicking the floor opens Room panel", title === "Room", title ?? "null");

  const sectionText = await page.evaluate(
    () =>
      [...document.querySelectorAll(".section-title")].map((s) => s.textContent) ?? [],
  );
  expect(
    "room section heading present",
    sectionText.includes("Room dimensions"),
    sectionText.join(" | "),
  );

  const before = await widthValue();
  const stepped = await clickSelector('[aria-label="Increase Width"]');
  expect("width stepper button works", stepped);
  const after = await widthValue();
  expect(
    "stepping width increases it by 0.1",
    approx(Number(after), Number(before) + 0.1, 1e-6),
    `${before} -> ${after}`,
  );

  const undone = await clickText("Undo");
  expect("Undo button works", undone);
  const undoneValue = await widthValue();
  expect(
    "Undo reverts the stepper change",
    approx(Number(undoneValue), Number(before), 1e-6),
    `${after} -> ${undoneValue}`,
  );

  const redone = await clickText("Redo");
  expect("Redo button works", redone);
  const redoneValue = await widthValue();
  expect(
    "Redo re-applies the stepper change",
    approx(Number(redoneValue), Number(before) + 0.1, 1e-6),
    `${undoneValue} -> ${redoneValue}`,
  );

  const houseWidth = await bridge(
    () => Object.values(window.__homeDesigner.getHouse().rooms)[0]?.width,
  );
  expect(
    "stepper changed the actual room geometry",
    approx(houseWidth, Number(before) + 0.1, 1e-6),
    `width=${houseWidth}`,
  );

  await shot("04-room-selected");
}

// ---------------------------------------------------------------------------
console.log("--- 2D / 3D view switch ---");
{
  const to2d = await clickText("2D plan");
  expect("2D plan button works", to2d);
  const plan = await page.evaluate(() => ({
    plan: Boolean(document.querySelector(".plan2d")),
    canvasRectW: document.querySelector(".viewport canvas").getBoundingClientRect().width,
    mode: window.__homeDesigner.getViewMode(),
  }));
  expect(
    "2D mode shows plan and hides canvas",
    plan.plan && plan.canvasRectW === 0 && plan.mode === "2d",
    JSON.stringify(plan),
  );

  await shot("05-2d-plan");

  const to3d = await clickText("3D view");
  expect("3D view button works", to3d);
  const back = await page.evaluate(() => ({
    plan: Boolean(document.querySelector(".plan2d")),
    canvasRectW: document.querySelector(".viewport canvas").getBoundingClientRect().width,
    mode: window.__homeDesigner.getViewMode(),
  }));
  expect(
    "3D mode restores the canvas",
    !back.plan && back.canvasRectW > 0 && back.mode === "3d",
    JSON.stringify(back),
  );
}

// ---------------------------------------------------------------------------
console.log("--- panel collapse / expand ---");
{
  const rightBefore = await page.evaluate(
    () => document.querySelector(".viewport").getBoundingClientRect().width,
  );
  const collapsed = await clickSelector(".side-panel.right .panel-toggle");
  expect("right collapse toggle works", collapsed);
  const rightState = await page.evaluate(() => ({
    collapsed: document.querySelector(".side-panel.right")?.classList.contains("collapsed"),
    width: document.querySelector(".viewport").getBoundingClientRect().width,
  }));
  expect(
    "right panel collapses and viewport grows",
    rightState.collapsed && rightState.width > rightBefore,
    `${rightBefore} -> ${rightState.width}`,
  );

  await shot("06-panel-collapsed");

  await clickSelector(".side-panel.right .panel-toggle");
  const rightReopen = await page.evaluate(() => ({
    collapsed: document.querySelector(".side-panel.right")?.classList.contains("collapsed"),
    width: document.querySelector(".viewport").getBoundingClientRect().width,
  }));
  expect(
    "right panel expands again",
    !rightReopen.collapsed && approx(rightReopen.width, rightBefore, 1),
    JSON.stringify(rightReopen),
  );

  const leftBefore = await page.evaluate(
    () => document.querySelector(".viewport").getBoundingClientRect().width,
  );
  await clickSelector(".side-panel:not(.right) .panel-toggle");
  const leftState = await page.evaluate(() => ({
    collapsed: document.querySelector(".side-panel:not(.right)")?.classList.contains("collapsed"),
    width: document.querySelector(".viewport").getBoundingClientRect().width,
  }));
  expect(
    "left panel collapses and viewport grows",
    leftState.collapsed && leftState.width > leftBefore,
    `${leftBefore} -> ${leftState.width}`,
  );

  await clickSelector(".side-panel:not(.right) .panel-toggle");
  const leftReopen = await page.evaluate(
    () => document.querySelector(".viewport").getBoundingClientRect().width,
  );
  expect("left panel expands again", approx(leftReopen, leftBefore, 1), `${leftReopen}`);
}

// ---------------------------------------------------------------------------
console.log("--- responsive at 1024x768 ---");
{
  await page.setViewport({ width: 1024, height: 768 });
  await sleep(600);
  const state = await page.evaluate(() => {
    const bar = document.querySelector(".toolbar");
    return {
      scroll: bar.scrollWidth,
      client: bar.clientWidth,
      h: bar.clientHeight,
      canvas: Boolean(document.querySelector(".viewport canvas")),
      title: document.querySelector(".side-panel.right .panel-title")?.textContent,
      dims: [...document.querySelectorAll(".dimension-row input")].map((i) => i.value),
    };
  });
  expect(
    "toolbar has no overflow at 1024",
    state.scroll <= state.client,
    JSON.stringify(state),
  );
  expect("canvas still present at 1024", state.canvas);
  expect(
    "room dims still 4 fields at 1024",
    state.dims.length === 4 && state.dims.every((v) => v !== ""),
    state.dims.join("|"),
  );

  const newBtn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "New");
    if (!btn) return null;
    const box = btn.getBoundingClientRect();
    return { x: box.x, y: box.y, w: box.width, visible: box.right <= window.innerWidth && box.x >= 0 };
  });
  expect(
    "New button is fully visible at 1024",
    newBtn && newBtn.visible,
    JSON.stringify(newBtn),
  );

  await page.setViewport({ width: 1400, height: 850 });
  await sleep(500);
}

// ---------------------------------------------------------------------------
await shot("07-final");
console.log(`http/console errors: ${errors.length}`);
for (const error of errors) console.log(`  ${error}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\nui-check: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.log("failures:");
  for (const f of failed) console.log(`  - ${f.label}`);
}

await browser.close();
process.exit(failed.length ? 1 : 0);
