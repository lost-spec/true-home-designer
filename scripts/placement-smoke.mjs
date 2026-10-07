import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:5199/";
const OUT_DIR = join(tmpdir(), "opencode", "placement-tests");
const SNAP = 0.1;

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
  checks.push({ label, ok: Boolean(condition), detail });
  console.log(
    `${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : "  [" + detail + "]"}`,
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approx = (a, b, epsilon = 1e-6) => Math.abs(a - b) < epsilon;
const snap = (value) => Math.round(value / SNAP) * SNAP;

const shot = async (name) => {
  const viewport = await page.$(".viewport");
  await viewport.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  console.log(`shot: ${name}.png`);
};

const state = () =>
  page.evaluate(() => {
    const api = window.__homeDesigner;
    if (!api) return null;
    const house = api.getHouse();
    return {
      tool: api.getTool(),
      placing: api.getPlacingAssetId(),
      ghost: api.getGhostPosition(),
      rotation: api.getPlacingRotationY(),
      selection: api.getSelection(),
      dragging: api.getDraggingObjectId(),
      objects: house.objects,
      objectIds: Object.keys(house.objects),
      roomsJson: JSON.stringify(house.rooms),
      wallsJson: JSON.stringify(house.walls),
      hint: Boolean(document.querySelector(".placement-hint")),
      previewBounds: api.measure("placement-preview"),
      cameraDistance: api.getCameraDistance(),
    };
  });

const bridge = (fn, arg) => page.evaluate(fn, arg);
const groundAt = (x, y) =>
  page.evaluate((cx, cy) => window.__homeDesigner.groundAt(cx, cy), x, y);
const project = (x, y, z) =>
  page.evaluate(
    (px, py, pz) => window.__homeDesigner.project(px, py, pz),
    x,
    y,
    z,
  );

const canvasPoint = async (dx, dy) =>
  page.evaluate((ox, oy) => {
    const rect = document.querySelector("canvas").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 + ox,
      y: rect.top + rect.height / 2 + oy,
    };
  }, dx, dy);

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

const clickUiButton = async (label) => {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
    if (!button) return false;
    button.click();
    return true;
  }, label);
  await sleep(400);
  return clicked;
};

await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector("canvas", { timeout: 15000 });
await sleep(2500);

const initial = await state();
expect("bridge is available", initial !== null, JSON.stringify(initial));
expect(
  "editor starts in select tool with one sample object",
  initial?.tool === "select" &&
    initial.placing === null &&
    initial.ghost === null &&
    initial.objectIds.length === 1,
  JSON.stringify(initial),
);
expect(
  "no placement hint before choosing an asset",
  initial?.hint === false,
  JSON.stringify(initial),
);

const picked = await clickAsset("Test crate");
expect("asset button is clickable", picked);

const placing = await state();
expect(
  "clicking an asset enters placement mode",
  placing?.tool === "placeObject" && placing.placing === "test_crate",
  JSON.stringify(placing),
);
expect("placement hint appears", placing?.hint === true, JSON.stringify(placing));
expect(
  "placement clears selection",
  placing?.selection === null,
  JSON.stringify(placing?.selection),
);
expect(
  "ghost preview exists in the scene",
  placing?.previewBounds !== null,
  JSON.stringify(placing?.previewBounds),
);

const center = await canvasPoint(0, 0);
const groundCenter = await groundAt(center.x, center.y);
expect(
  "ghost sits on the snapped ground point",
  placing?.ghost !== null &&
    approx(placing.ghost.x, snap(groundCenter.x)) &&
    approx(placing.ghost.z, snap(groundCenter.z)),
  `ghost=${JSON.stringify(placing?.ghost)} ground=${JSON.stringify(groundCenter)}`,
);

// Place inside the room: (1.23, 0.87) snaps to (1.2, 0.9).
const insideRoom = await project(1.23, 0, 0.87);
await page.mouse.move(insideRoom.x, insideRoom.y);
await sleep(350);
const afterMove = await state();
const groundInside = await groundAt(insideRoom.x, insideRoom.y);
expect(
  "ghost follows the pointer",
  afterMove?.ghost !== null &&
    approx(afterMove.ghost.x, snap(groundInside.x)) &&
    approx(afterMove.ghost.z, snap(groundInside.z)),
  `ghost=${JSON.stringify(afterMove?.ghost)} ground=${JSON.stringify(groundInside)}`,
);
expect(
  "ghost preview still present after move",
  afterMove?.previewBounds !== null,
);
expect(
  "ghost previews on the floor (y near 0)",
  afterMove?.previewBounds !== null && Math.abs(afterMove.previewBounds.min.y) < 0.05,
  JSON.stringify(afterMove?.previewBounds),
);

await shot("01-placement-ghost");

await page.mouse.click(insideRoom.x, insideRoom.y);
await sleep(600);
const placed = await state();
const insideIds = placed.objectIds.filter((id) => id !== "obj-test-crate");
const insideId = insideIds[0];
expect(
  "clicking the floor places exactly one object",
  placed.objectIds.length === 2 && insideIds.length === 1,
  JSON.stringify(placed.objectIds),
);
expect(
  "new object id is unique",
  new Set(placed.objectIds).size === placed.objectIds.length,
  JSON.stringify(placed.objectIds),
);
const insideObject = insideId ? placed.objects[insideId] : null;
expect(
  "placed position is snapped to the grid",
  insideObject !== null &&
    approx(insideObject.position.x, snap(groundInside.x), 1e-9) &&
    approx(insideObject.position.z, snap(groundInside.z), 1e-9),
  JSON.stringify(insideObject?.position),
);
expect(
  "object lands inside the room footprint",
  insideObject !== null &&
    insideObject.position.x > -3 &&
    insideObject.position.x < 3 &&
    insideObject.position.z > -2.5 &&
    insideObject.position.z < 2.5,
  JSON.stringify(insideObject?.position),
);
expect(
  "placed object starts unrotated at scale 1",
  insideObject !== null &&
    insideObject.rotationY === 0 &&
    insideObject.scale === 1,
  JSON.stringify(insideObject),
);
expect(
  "placed object becomes the selection",
  placed?.selection?.kind === "object" && placed.selection.id === insideId,
  JSON.stringify(placed?.selection),
);
expect(
  "placement mode continues after placing",
  placed?.tool === "placeObject" &&
    placed.placing === "test_crate" &&
    placed.hint === true,
  JSON.stringify(placed),
);

const serialised = await bridge((id) => {
  const house = window.__homeDesigner.getHouse();
  const roundTrip = JSON.parse(JSON.stringify(house));
  const keys = Object.keys(roundTrip.objects[id]).sort().join(",");
  const same = JSON.stringify(roundTrip) === JSON.stringify(house);
  return same && keys === "assetId,id,position,rotationY,scale";
}, insideId);
expect(
  "house data stays plain JSON after placement",
  serialised === true,
  String(serialised),
);
{
  const preview = placed?.previewBounds;
  const ghost = placed?.ghost;
  const centerX = preview ? (preview.min.x + preview.max.x) / 2 : Number.NaN;
  const centerZ = preview ? (preview.min.z + preview.max.z) / 2 : Number.NaN;
  expect(
    "preview is a ground-anchored scene object, not camera-locked",
    preview !== null &&
      ghost !== null &&
      Math.abs(preview.min.y) < 0.05 &&
      Math.abs(centerX - ghost.x) < 0.06 &&
      Math.abs(centerZ - ghost.z) < 0.06,
    JSON.stringify({ preview, ghost }),
  );
}

await shot("02-placement-placed");

await page.keyboard.press("Escape");
await sleep(300);
const cancelled = await state();
expect(
  "Escape exits placement mode",
  cancelled?.tool === "select" &&
    cancelled.placing === null &&
    cancelled.ghost === null &&
    cancelled.hint === false,
  JSON.stringify(cancelled),
);
expect(
  "preview disappears when placement ends",
  cancelled?.previewBounds === null,
  JSON.stringify(cancelled?.previewBounds),
);
expect(
  "Escape keeps the placed object",
  cancelled?.objectIds.length === 2,
  JSON.stringify(cancelled?.objectIds),
);

const geometryBefore = {
  rooms: cancelled.roomsJson,
  walls: cancelled.wallsJson,
};

// Place a second object on the open floor between the camera and the room so
// it can be clicked without a wall in the way: (4.63, 4.47) snaps to (4.6, 4.5).
await clickAsset("Test crate");
const openGround = await project(4.63, 0, 4.47);
await page.mouse.move(openGround.x, openGround.y);
await sleep(300);
await page.mouse.click(openGround.x, openGround.y);
await sleep(600);
const openPlaced = await state();
const openId = openPlaced.objectIds.find((id) => id !== insideId && id !== "obj-test-crate");
const openObject = openId ? openPlaced.objects[openId] : null;
expect(
  "second object places on the open floor",
  openPlaced.objectIds.length === 3 && openObject !== null,
  JSON.stringify(openPlaced.objectIds),
);
expect(
  "second placement is snapped",
  openObject !== null &&
    approx(openObject.position.x, 4.6, 1e-9) &&
    approx(openObject.position.z, 4.5, 1e-9),
  JSON.stringify(openObject?.position),
);
await page.keyboard.press("Escape");
await sleep(300);

const spot = await project(openObject.position.x, 0.25, openObject.position.z);
expect("open object projects into the viewport", spot !== null, JSON.stringify(spot));
await page.mouse.click(spot.x, spot.y);
await sleep(350);
const selected = await state();
expect(
  "clicking the object selects it",
  selected?.selection?.kind === "object" && selected.selection.id === openId,
  JSON.stringify(selected?.selection),
);
expect(
  "pickObject identifies the clicked object",
  (await bridge(
    (args) => window.__homeDesigner.pickObject(args.x, args.y),
    { x: spot.x, y: spot.y },
  )) === openId,
);

const beforeDrag = { ...openObject.position };
const ground0 = await groundAt(spot.x, spot.y);
const grabOffset = {
  x: ground0.x - beforeDrag.x,
  z: ground0.z - beforeDrag.z,
};
const drop = { x: spot.x + 110, y: spot.y + 45 };
const ground1 = await groundAt(drop.x, drop.y);
const expected = {
  x: snap(ground1.x - grabOffset.x),
  z: snap(ground1.z - grabOffset.z),
};

await page.mouse.move(spot.x, spot.y);
await sleep(120);
await page.mouse.down();
await sleep(120);
for (let step = 1; step <= 6; step += 1) {
  await page.mouse.move(
    spot.x + ((drop.x - spot.x) * step) / 6,
    spot.y + ((drop.y - spot.y) * step) / 6,
  );
  await sleep(60);
}
await page.mouse.up();
await sleep(500);

const dragged = await state();
const draggedObject = dragged.objects[openId];
expect(
  "drag moves the object to the snapped grab target",
  draggedObject !== null &&
    approx(draggedObject.position.x, expected.x, 1e-6) &&
    approx(draggedObject.position.z, expected.z, 1e-6),
  `got=${JSON.stringify(draggedObject?.position)} expected=${JSON.stringify(expected)}`,
);
expect(
  "dragged position stays on the grid",
  draggedObject !== null &&
    approx(
      draggedObject.position.x / SNAP,
      Math.round(draggedObject.position.x / SNAP),
      1e-6,
    ) &&
    approx(
      draggedObject.position.z / SNAP,
      Math.round(draggedObject.position.z / SNAP),
      1e-6,
    ),
  JSON.stringify(draggedObject?.position),
);
expect(
  "drag does not leave a stale dragging flag",
  dragged?.dragging === null,
  JSON.stringify(dragged?.dragging),
);
expect(
  "selection survives the drag",
  dragged?.selection?.kind === "object" && dragged.selection.id === openId,
  JSON.stringify(dragged?.selection),
);
expect(
  "dragging an object never moves walls",
  dragged.roomsJson === geometryBefore.rooms &&
    dragged.wallsJson === geometryBefore.walls,
);

await page.keyboard.press("r");
await sleep(250);
const rotated = await state();
expect(
  "R rotates the selected object by 45 degrees",
  approx(rotated.objects[openId].rotationY, Math.PI / 4, 1e-9),
  String(rotated.objects[openId].rotationY),
);

await page.keyboard.down("Shift");
await page.keyboard.press("r");
await page.keyboard.up("Shift");
await sleep(250);
const counterRotated = await state();
expect(
  "Shift+R rotates back by 45 degrees",
  approx(counterRotated.objects[openId].rotationY, 0, 1e-9),
  String(counterRotated.objects[openId].rotationY),
);

const bounds = await bridge(
  (name) => window.__homeDesigner.measure(name),
  `object-${openId}`,
);
{
  const current = counterRotated.objects[openId];
  const centerX = bounds ? (bounds.min.x + bounds.max.x) / 2 : Number.NaN;
  const centerZ = bounds ? (bounds.min.z + bounds.max.z) / 2 : Number.NaN;
  const height = bounds ? bounds.max.y - bounds.min.y : Number.NaN;
  const minY = bounds ? bounds.min.y : Number.NaN;
  expect(
    "mesh follows the stored object data",
    bounds !== null &&
      Math.abs(centerX - current.position.x) < 0.02 &&
      Math.abs(centerZ - current.position.z) < 0.02,
    JSON.stringify({ bounds, position: current.position }),
  );
  expect(
    "mesh keeps its footprint on the floor",
    bounds !== null && Math.abs(minY) < 0.02 && Math.abs(height - 0.5) < 0.05,
    JSON.stringify({ height, minY }),
  );
}

const inspector = await page.evaluate(
  () => document.querySelector(".side-panel.right")?.textContent ?? "",
);
expect(
  "inspector shows object transform metadata",
  inspector.includes("Object") &&
    inspector.includes("Can rotate") &&
    inspector.includes("Height") &&
    inspector.includes("Rotation Y") &&
    inspector.includes("Scale"),
  inspector.slice(0, 240),
);
expect(
  "inspector offers raise/lower and object zoom controls",
  inspector.includes("Raise") &&
    inspector.includes("Lower") &&
    inspector.includes("Zoom +") &&
    inspector.includes("Zoom −"),
  inspector.slice(0, 240),
);

await shot("03-object-selected");

// --- Vertical height (PageUp / PageDown) ---
const floorBounds = await bridge(
  (name) => window.__homeDesigner.measure(name),
  `object-${openId}`,
);
await page.keyboard.press("PageUp");
await sleep(250);
const raised = await state();
expect(
  "PageUp raises the selected object by one step",
  approx(raised.objects[openId].position.y, 0.1, 1e-9),
  String(raised?.objects[openId]?.position?.y),
);
const raisedBounds = await bridge(
  (name) => window.__homeDesigner.measure(name),
  `object-${openId}`,
);
expect(
  "raised mesh lifts off the floor",
  floorBounds !== null &&
    raisedBounds !== null &&
    approx(raisedBounds.max.y - floorBounds.max.y, 0.1, 0.03),
  JSON.stringify({ floorBounds, raisedBounds }),
);
await page.keyboard.press("PageDown");
await sleep(250);
const lowered = await state();
const loweredBounds = await bridge(
  (name) => window.__homeDesigner.measure(name),
  `object-${openId}`,
);
expect(
  "PageDown returns the object to the floor",
  approx(lowered.objects[openId].position.y, 0, 1e-9) &&
    loweredBounds !== null &&
    Math.abs(loweredBounds.min.y) < 0.02,
  JSON.stringify({ y: lowered?.objects[openId]?.position?.y, bounds: loweredBounds }),
);

// --- Object zoom (inspector buttons, multiply the model scale) ---
await clickUiButton("Zoom +");
const zoomedIn = await state();
const zoomedInBounds = await bridge(
  (name) => window.__homeDesigner.measure(name),
  `object-${openId}`,
);
expect(
  "Zoom + grows the selected object's scale",
  approx(zoomedIn.objects[openId].scale, 1.1, 1e-3),
  String(zoomedIn?.objects[openId]?.scale),
);
expect(
  "zooming the object scales its mesh, not the floor",
  zoomedInBounds !== null &&
    Math.abs(zoomedInBounds.max.y - zoomedInBounds.min.y - 0.55) < 0.03 &&
    Math.abs(zoomedInBounds.min.y) < 0.02,
  JSON.stringify(zoomedInBounds),
);
await clickUiButton("Zoom −");
const zoomedOut = await state();
expect(
  "Zoom − restores the object's scale",
  approx(zoomedOut.objects[openId].scale, 1, 1e-3),
  String(zoomedOut?.objects[openId]?.scale),
);

// --- Camera view zoom (toolbar buttons and +/- keys) ---
const distanceStart = (await state()).cameraDistance;
await clickUiButton("Zoom in");
const afterZoomIn = await state();
expect(
  "the Zoom in button moves the camera closer",
  afterZoomIn.cameraDistance < distanceStart - 0.1,
  `${distanceStart} -> ${afterZoomIn.cameraDistance}`,
);
await clickUiButton("Zoom out");
const afterZoomOut = await state();
expect(
  "the Zoom out button moves the camera back out",
  afterZoomOut.cameraDistance > afterZoomIn.cameraDistance + 0.1,
  `${afterZoomIn.cameraDistance} -> ${afterZoomOut.cameraDistance}`,
);
await page.keyboard.press("=");
await sleep(250);
const afterKeyIn = await state();
expect(
  "the + key zooms the view in",
  afterKeyIn.cameraDistance < afterZoomOut.cameraDistance - 0.1,
  `${afterZoomOut.cameraDistance} -> ${afterKeyIn.cameraDistance}`,
);
await page.keyboard.press("-");
await sleep(250);
const afterKeyOut = await state();
expect(
  "the - key zooms the view back out",
  afterKeyOut.cameraDistance > afterKeyIn.cameraDistance + 0.1,
  `${afterKeyIn.cameraDistance} -> ${afterKeyOut.cameraDistance}`,
);
expect(
  "view zoom never moves the object or walls",
  approx(afterKeyOut.objects[openId].position.x, zoomedOut.objects[openId].position.x, 1e-9) &&
    approx(afterKeyOut.objects[openId].scale, 1, 1e-3) &&
    afterKeyOut.roomsJson === geometryBefore.rooms &&
    afterKeyOut.wallsJson === geometryBefore.walls,
  JSON.stringify({ object: afterKeyOut.objects[openId], camera: afterKeyOut.cameraDistance }),
);

await page.keyboard.press("Delete");
await sleep(300);
const deleted = await state();
expect(
  "Delete removes the object",
  deleted.objectIds.length === 2 && deleted.objects[openId] === undefined,
  JSON.stringify(deleted.objectIds),
);
expect(
  "Delete clears the selection",
  deleted?.selection === null,
  JSON.stringify(deleted?.selection),
);
expect(
  "Delete leaves the other placed object intact",
  deleted.objects[insideId] !== undefined &&
    deleted.objects["obj-test-crate"] !== undefined,
  JSON.stringify(deleted.objectIds),
);

await clickAsset("Test crate");
expect("placement can be re-entered", (await state())?.placing === "test_crate");

await clickUiButton("Place object");
const toggled = await state();
expect(
  "toolbar Place object button cancels placement",
  toggled?.tool === "select" &&
    toggled.placing === null &&
    toggled.ghost === null &&
    toggled.hint === false,
  JSON.stringify(toggled),
);
expect(
  "cancelled placement leaves the house untouched",
  toggled.objectIds.length === 2 &&
    toggled.roomsJson === geometryBefore.rooms &&
    toggled.wallsJson === geometryBefore.walls,
  JSON.stringify(toggled.objectIds),
);

let failed = 0;
for (const check of checks) {
  if (!check.ok) failed += 1;
}
console.log(
  `\nplacement smoke: ${checks.length - failed}/${checks.length} passed`,
);
console.log(`http/console errors: ${errors.length}`);
for (const error of errors) console.log("  " + error);

await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
