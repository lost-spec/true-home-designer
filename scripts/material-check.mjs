import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:5199/";
const OUT_DIR = join(tmpdir(), "opencode", "material-tests");

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

const shot = async (name) => {
  const viewport = await page.$(".viewport");
  await viewport.screenshot({ path: join(OUT_DIR, `${name}.png`) });
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
  await sleep(600);
  return true;
};

const selectAt = async (id) => {
  const object = await bridge(
    (oid) => window.__homeDesigner.getHouse().objects[oid],
    id,
  );
  const spot = await project(object.position.x, 0.3, object.position.z);
  if (!spot) return { ok: false, reason: "projection failed" };
  const picked = await bridge(
    (args) => window.__homeDesigner.pickObject(args.x, args.y),
    { x: spot.x, y: spot.y },
  );
  if (picked !== id) {
    return { ok: false, reason: `pickObject returned ${picked}` };
  }
  await page.mouse.click(spot.x, spot.y);
  await sleep(600);
  const selection = await bridge(() => window.__homeDesigner.getSelection());
  return {
    ok: selection?.kind === "object" && selection.id === id,
    reason: JSON.stringify(selection),
  };
};

const materialState = (id) =>
  bridge((oid) => window.__homeDesigner.getMaterialState(oid), id);

const objectKeys = (id) =>
  bridge(
    (oid) => Object.keys(window.__homeDesigner.getHouse().objects[oid]).sort(),
    id,
  );

const overridesOf = (id) =>
  bridge(
    (oid) => window.__homeDesigner.getHouse().objects[oid].materialOverrides,
    id,
  );

const slotDom = () =>
  page.evaluate(() => {
    const slots = [...document.querySelectorAll(".material-slot")];
    const fabric = document.querySelector('.material-slot[data-slot="fabric"]');
    const legs = document.querySelector('.material-slot[data-slot="legs"]');
    const pick = (root, selector) => root?.querySelector(selector) ?? null;
    return {
      slotCount: slots.length,
      hasMaterialsHeading:
        (document.querySelector(".material-title")?.textContent ?? "") ===
        "Materials",
      fabricColor: pick(fabric, 'input[type="color"]')?.value ?? null,
      fabricResetDisabled:
        pick(fabric, ".material-reset")?.disabled ?? null,
      fabricChipCount: fabric
        ? fabric.querySelectorAll(".palette-chip").length
        : 0,
      fabricFinishOptions: pick(fabric, "select")
        ? [...pick(fabric, "select").options].map((o) => o.value)
        : [],
      fabricFinishValue: pick(fabric, "select")?.value ?? null,
      legsColor: pick(legs, 'input[type="color"]')?.value ?? null,
      legsFinishValue: pick(legs, "select")?.value ?? null,
    };
  });

const setColorInput = (slotId, hex) =>
  page.evaluate(
    (sid, value) => {
      const input = document.querySelector(
        `.material-slot[data-slot="${sid}"] input[type="color"]`,
      );
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.blur();
      return true;
    },
    slotId,
    hex,
  );

const setFinish = (slotId, finishId) =>
  page.evaluate(
    (sid, value) => {
      const select = document.querySelector(
        `.material-slot[data-slot="${sid}"] select`,
      );
      if (!select) return false;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      ).set;
      setter.call(select, value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    slotId,
    finishId,
  );

const clickChip = (slotId, hex) =>
  page.evaluate(
    (sid, colour) => {
      const chip = [
        ...document.querySelectorAll(
          `.material-slot[data-slot="${sid}"] .palette-chip`,
        ),
      ].find((c) => c.title?.toLowerCase() === colour.toLowerCase());
      if (!chip) return false;
      chip.click();
      return true;
    },
    slotId,
    hex,
  );

const clickReset = (slotId) =>
  page.evaluate((sid) => {
    const button = document.querySelector(
      `.material-slot[data-slot="${sid}"] .material-reset`,
    );
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, slotId);

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

// Mirror of src/assets/materialSlots.ts targetColorFor so the expectations are
// independent of the application code under test.
const hexToRgb = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const rgbToHex = (rgb) =>
  "#" +
  rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const expectedTargetColor = (chosen, original, target) => {
  const c = hexToRgb(chosen);
  const o = hexToRgb(original);
  const t = hexToRgb(target);
  return rgbToHex(
    c.map((channel, index) => {
      const denominator = o[index];
      const ratio =
        denominator < 0.01
          ? 1
          : Math.min(2, Math.max(0.5, t[index] / denominator));
      return Math.min(1, Math.max(0, channel * ratio));
    }),
  );
};

await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector("canvas", { timeout: 15000 });
await sleep(2500);

// --- 1. Boot ---------------------------------------------------------------
const bridgeReady = await page.evaluate(() => Boolean(window.__homeDesigner));
expect("bridge is available", bridgeReady);
expect(
  "getMaterialState returns null for an unknown object",
  (await materialState("does-not-exist")) === null,
);

// --- 2. Place two sofas ----------------------------------------------------
const pickedSofa = await clickAsset("Sofa");
expect("Sofa asset button is clickable", pickedSofa);

const placePoint = await project(4.6, 0, 4.5);
await page.mouse.move(placePoint.x, placePoint.y);
await sleep(400);
await page.mouse.click(placePoint.x, placePoint.y);
await sleep(800);

const secondPoint = await project(4.6, 0, 2.0);
await page.mouse.move(secondPoint.x, secondPoint.y);
await sleep(400);
await page.mouse.click(secondPoint.x, secondPoint.y);
await sleep(800);
await page.keyboard.press("Escape");
await sleep(500);

const placedState = await bridge(() => {
  const house = window.__homeDesigner.getHouse();
  return Object.values(house.objects).filter((o) => o.assetId === "sofa");
});
expect(
  "two sofas are placed",
  placedState.length === 2,
  JSON.stringify(placedState.map((o) => o.position)),
);
const [sofaA, sofaB] = placedState;
const separation = sofaA && sofaB
  ? Math.hypot(sofaA.position.x - sofaB.position.x, sofaA.position.z - sofaB.position.z)
  : 0;
expect(
  "sofas sit apart on the floor",
  separation > 1.6 && separation < 6 &&
    placedState.every((o) => Math.abs(o.position.y) < 1e-9),
  `separation=${separation} positions=${JSON.stringify(placedState.map((o) => o.position))}`,
);

const idA = sofaA?.id;
const idB = sofaB?.id;

// --- 3. Select sofa A ------------------------------------------------------
const selectionA = await selectAt(idA);
expect("sofa A can be selected by clicking it", selectionA.ok, selectionA.reason);

const dom = await slotDom();
expect("inspector renders the Materials section", dom.hasMaterialsHeading);
expect(
  "sofa exposes exactly two material slots",
  dom.slotCount === 2,
  String(dom.slotCount),
);
expect(
  "upholstery slot starts on the GLB colour #ce896f",
  dom.fabricColor === "#ce896f",
  String(dom.fabricColor),
);
expect("Reset starts disabled", dom.fabricResetDisabled === true);
expect(
  "upholstery slot shows the fabric palette",
  dom.fabricChipCount === 8,
  String(dom.fabricChipCount),
);
expect(
  "finish select lists original plus four fabric finishes",
  dom.fabricFinishOptions.length === 5 &&
    dom.fabricFinishOptions[0] === "" &&
    dom.fabricFinishOptions.includes("leather"),
  JSON.stringify(dom.fabricFinishOptions),
);
expect(
  "legs slot starts on its GLB colour",
  dom.legsColor === "#ffffff",
  String(dom.legsColor),
);

await shot("01-materials-default");

// --- 4. Baseline material state -------------------------------------------
const baselineA = await materialState(idA);
const baselineB = await materialState(idB);
expect(
  "GLB fabric colours are preserved exactly",
  baselineA?.MAT_Fabric_Base?.color === "#ce896f" &&
    baselineA?.MAT_Fabric_Shadow?.color === "#b8735d" &&
    baselineA?.MAT_Wood_Base?.color === "#ffffff",
  JSON.stringify(baselineA),
);
const namedOnly = (state) =>
  state
    ? Object.fromEntries(Object.entries(state).filter(([key]) => key !== "(unnamed)"))
    : state;
expect(
  "both sofa instances start with identical materials",
  JSON.stringify(namedOnly(baselineA)) === JSON.stringify(namedOnly(baselineB)),
  JSON.stringify({ baselineA, baselineB }),
);
expect(
  "GLB PBR values are exposed (fabric is rough, not metal)",
  baselineA?.MAT_Fabric_Base?.roughness > 0.5 &&
    baselineA?.MAT_Fabric_Base?.metalness === 0,
  JSON.stringify(baselineA?.MAT_Fabric_Base),
);
const baselineKeysA = await objectKeys(idA);
expect(
  "untouched object keeps the exact five storage keys",
  baselineKeysA.join(",") === "assetId,id,position,rotationY,scale",
  baselineKeysA.join(","),
);
expect("overrides are absent before editing", (await overridesOf(idA)) === undefined);

const renderBaseline = await bridge(() => window.__homeDesigner.getRenderInfo());
expect(
  "renderer reports geometry after placement",
  renderBaseline.memory.geometries > 0 && renderBaseline.render.calls > 0,
  JSON.stringify(renderBaseline),
);

// --- 5. Colour change on sofa A -------------------------------------------
const FABRIC = "#3366cc";
await setColorInput("fabric", FABRIC);
await sleep(700);

const afterColorA = await materialState(idA);
const afterColorB = await materialState(idB);
const expectedShadow = expectedTargetColor(FABRIC, "#ce896f", "#b8735d");
expect(
  "colour applies to the main fabric material",
  afterColorA?.MAT_Fabric_Base?.color === FABRIC,
  JSON.stringify(afterColorA?.MAT_Fabric_Base),
);
expect(
  "colour keeps the shadow fabric's darker tone via a sRGB ratio",
  afterColorA?.MAT_Fabric_Shadow?.color === expectedShadow,
  `got=${afterColorA?.MAT_Fabric_Shadow?.color} expected=${expectedShadow}`,
);
expect(
  "PBR roughness/metalness survive a colour change",
  afterColorA?.MAT_Fabric_Base?.roughness === baselineA?.MAT_Fabric_Base?.roughness &&
    afterColorA?.MAT_Fabric_Base?.metalness === baselineA?.MAT_Fabric_Base?.metalness &&
    afterColorA?.MAT_Fabric_Shadow?.roughness === baselineA?.MAT_Fabric_Shadow?.roughness,
  JSON.stringify({
    before: baselineA?.MAT_Fabric_Base,
    after: afterColorA?.MAT_Fabric_Base,
  }),
);
expect(
  "other slots on the same object stay untouched",
  afterColorA?.MAT_Wood_Base?.color === "#ffffff",
  JSON.stringify(afterColorA?.MAT_Wood_Base),
);
expect(
  "the second sofa keeps its original colour",
  afterColorB?.MAT_Fabric_Base?.color === "#ce896f" &&
    afterColorB?.MAT_Fabric_Shadow?.color === "#b8735d",
  JSON.stringify(afterColorB?.MAT_Fabric_Base),
);
const overrideA = await overridesOf(idA);
expect(
  "colour override is stored as a single slot entry",
  overrideA?.colors?.fabric === FABRIC &&
    Object.keys(overrideA.colors).length === 1 &&
    overrideA.finishes === undefined,
  JSON.stringify(overrideA),
);
expect(
  "the other object still has no override key",
  (await overridesOf(idB)) === undefined,
);
const keysA = await objectKeys(idA);
expect(
  "storage keys stay minimal when overrides exist",
  keysA.join(",") === "assetId,id,materialOverrides,position,rotationY,scale",
  keysA.join(","),
);
const domAfterColor = await slotDom();
expect(
  "colour input follows the stored state",
  domAfterColor.fabricColor === FABRIC && domAfterColor.fabricResetDisabled === false,
  JSON.stringify(domAfterColor),
);

await shot("02-material-colour");

// --- 6. Palette chip -------------------------------------------------------
await clickChip("fabric", "#efe9df");
await sleep(700);
const afterChip = await materialState(idA);
const chipShadow = expectedTargetColor("#efe9df", "#ce896f", "#b8735d");
expect(
  "palette chip applies its colour",
  afterChip?.MAT_Fabric_Base?.color === "#efe9df" &&
    afterChip?.MAT_Fabric_Shadow?.color === chipShadow,
  JSON.stringify(afterChip?.MAT_Fabric_Base),
);
const chipActive = await page.evaluate(() =>
  [...document.querySelectorAll('.material-slot[data-slot="fabric"] .palette-chip')].some(
    (c) => c.title === "#efe9df" && c.classList.contains("active"),
  ),
);
expect("the active palette chip is highlighted", chipActive);

// --- 7. Finish selection and colour precedence -----------------------------
await setFinish("fabric", "leather");
await sleep(700);
const afterLeather = await materialState(idA);
expect(
  "finish changes roughness on every material in the slot",
  afterLeather?.MAT_Fabric_Base?.roughness === 0.42 &&
    afterLeather?.MAT_Fabric_Shadow?.roughness === 0.42,
  JSON.stringify({
    base: afterLeather?.MAT_Fabric_Base,
    shadow: afterLeather?.MAT_Fabric_Shadow,
  }),
);
expect(
  "a colourless finish keeps the chosen colour",
  afterLeather?.MAT_Fabric_Base?.color === "#efe9df",
  JSON.stringify(afterLeather?.MAT_Fabric_Base),
);

await setFinish("fabric", "linen");
await sleep(700);
const afterLinen = await materialState(idA);
expect(
  "an explicit colour beats a finish's own colour",
  afterLinen?.MAT_Fabric_Base?.color === "#efe9df" &&
    afterLinen?.MAT_Fabric_Base?.roughness === 0.9,
  JSON.stringify(afterLinen?.MAT_Fabric_Base),
);
const overrideLinen = await overridesOf(idA);
expect(
  "colour and finish are stored together",
  overrideLinen?.colors?.fabric === "#efe9df" &&
    overrideLinen?.finishes?.fabric === "linen",
  JSON.stringify(overrideLinen),
);

// --- 8. Reset --------------------------------------------------------------
const resetClicked = await clickReset("fabric");
expect("Reset button is usable once the slot is edited", resetClicked);
await sleep(700);
const afterReset = await materialState(idA);
expect(
  "reset restores the exact GLB materials",
  afterReset?.MAT_Fabric_Base?.color === "#ce896f" &&
    afterReset?.MAT_Fabric_Shadow?.color === "#b8735d" &&
    afterReset?.MAT_Fabric_Base?.roughness === baselineA?.MAT_Fabric_Base?.roughness &&
    afterReset?.MAT_Fabric_Base?.metalness === baselineA?.MAT_Fabric_Base?.metalness,
  JSON.stringify(afterReset?.MAT_Fabric_Base),
);
expect(
  "reset drops the override key entirely",
  (await overridesOf(idA)) === undefined,
);
const domReset = await slotDom();
expect(
  "reset restores the input value and disables Reset",
  domReset.fabricColor === "#ce896f" && domReset.fabricResetDisabled === true,
  JSON.stringify(domReset),
);

// --- 9. Finish with colour on a single-material slot -----------------------
await setFinish("legs", "walnut");
await sleep(700);
const afterWalnut = await materialState(idA);
expect(
  "walnut finish recolours the legs",
  afterWalnut?.MAT_Wood_Base?.color === "#7c5330" &&
    afterWalnut?.MAT_Wood_Base?.roughness === 0.45,
  JSON.stringify(afterWalnut?.MAT_Wood_Base),
);
const overrideWalnut = await overridesOf(idA);
expect(
  "finish override is stored for the legs slot",
  overrideWalnut?.finishes?.legs === "walnut" && overrideWalnut.colors === undefined,
  JSON.stringify(overrideWalnut),
);
const domWalnut = await slotDom();
expect(
  "legs swatch previews the finish colour",
  domWalnut.legsColor === "#7c5330" && domWalnut.legsFinishValue === "walnut",
  JSON.stringify(domWalnut),
);

await setFinish("legs", "");
await sleep(700);
const afterFinishReset = await materialState(idA);
expect(
  "choosing the original finish restores the GLB wood",
  afterFinishReset?.MAT_Wood_Base?.color === "#ffffff" &&
    afterFinishReset?.MAT_Wood_Base?.roughness === baselineA?.MAT_Wood_Base?.roughness,
  JSON.stringify(afterFinishReset?.MAT_Wood_Base),
);
expect(
  "clearing the finish drops the override key",
  (await overridesOf(idA)) === undefined,
);

// --- 10. Rendering resources stay stable -----------------------------------
const renderAfterEdits = await bridge(() => window.__homeDesigner.getRenderInfo());
expect(
  "colour edits clone no geometry or textures",
  renderAfterEdits.memory.geometries === renderBaseline.memory.geometries &&
    renderAfterEdits.memory.textures === renderBaseline.memory.textures,
  JSON.stringify({ before: renderBaseline.memory, after: renderAfterEdits.memory }),
);
expect(
  "colour edits reuse shader programs",
  renderAfterEdits.programs === renderBaseline.programs,
  JSON.stringify({ before: renderBaseline.programs, after: renderAfterEdits.programs }),
);
expect(
  "the scene keeps drawing",
  renderAfterEdits.render.calls > 0 && renderAfterEdits.render.triangles > 0,
  JSON.stringify(renderAfterEdits.render),
);

// --- 11. Save / load round-trip -------------------------------------------
await setColorInput("fabric", FABRIC);
await sleep(700);
const designJson = await bridge(() => window.__homeDesigner.getDesignJson());
expect(
  "saved design carries the material override",
  designJson.includes("materialOverrides") && designJson.includes(FABRIC),
);

const undoOfB = await selectAt(idB);
expect("sofa B can be selected", undoOfB.ok, undoOfB.reason);
await setColorInput("fabric", "#669933");
await sleep(700);
const bColored = await materialState(idB);
const aStillColored = await materialState(idA);
expect(
  "editing sofa B does not touch sofa A",
  bColored?.MAT_Fabric_Base?.color === "#669933" &&
    aStillColored?.MAT_Fabric_Base?.color === FABRIC,
  JSON.stringify({ b: bColored?.MAT_Fabric_Base, a: aStillColored?.MAT_Fabric_Base }),
);
await bridge(() => window.__homeDesigner.undo());
await sleep(700);
const bUndone = await materialState(idB);
const aAfterUndo = await materialState(idA);
expect(
  "undo reverts only sofa B's colour",
  bUndone?.MAT_Fabric_Base?.color === "#ce896f" &&
    (await overridesOf(idB)) === undefined &&
    aAfterUndo?.MAT_Fabric_Base?.color === FABRIC,
  JSON.stringify({ b: bUndone?.MAT_Fabric_Base, a: aAfterUndo?.MAT_Fabric_Base }),
);

const loaded = await bridge(
  (text) => window.__homeDesigner.loadDesignJson(text),
  designJson,
);
expect(
  "saved design reloads cleanly",
  loaded.ok && loaded.warnings.length === 0,
  JSON.stringify(loaded),
);
const reloadedA = await materialState(idA);
const reloadedB = await materialState(idB);
expect(
  "reloaded design restores the colour",
  reloadedA?.MAT_Fabric_Base?.color === FABRIC,
  JSON.stringify(reloadedA?.MAT_Fabric_Base),
);
expect(
  "reloaded design leaves the other sofa original",
  reloadedB?.MAT_Fabric_Base?.color === "#ce896f" &&
    (await overridesOf(idB)) === undefined,
  JSON.stringify(reloadedB?.MAT_Fabric_Base),
);

// --- 12. Sanitiser drops invalid override data -----------------------------
const corrupted = JSON.parse(designJson);
corrupted.house.objects[idA].materialOverrides = {
  colors: { fabric: "#ZZZZZZ", bogus: "#123456", legs: "#aabbcc" },
  finishes: { fabric: "nope" },
};
const repair = await bridge(
  (text) => window.__homeDesigner.loadDesignJson(text),
  JSON.stringify(corrupted),
);
expect(
  "a corrupted design still loads with warnings",
  repair.ok && repair.warnings.filter((w) => w.includes("dropped")).length >= 3,
  JSON.stringify(repair.warnings),
);
const repairedState = await materialState(idA);
expect(
  "invalid colours are dropped and valid ones kept",
  repairedState?.MAT_Fabric_Base?.color === "#ce896f" &&
    repairedState?.MAT_Wood_Base?.color === "#aabbcc",
  JSON.stringify(repairedState),
);
const repairedOverrides = await overridesOf(idA);
expect(
  "sanitised overrides contain only valid entries",
  repairedOverrides?.colors?.legs === "#aabbcc" &&
    repairedOverrides.colors.fabric === undefined &&
    repairedOverrides.finishes === undefined,
  JSON.stringify(repairedOverrides),
);

// --- 13. Material panel reappears after a reload ---------------------------
await selectAt(idA);
await sleep(300);
const panelVisible = await page.evaluate(
  () => document.querySelectorAll(".material-slot").length > 0,
);
expect("material panel stays visible after the reload", panelVisible);

await shot("03-material-final");

let failed = 0;
for (const check of checks) {
  if (!check.ok) failed += 1;
}
console.log(`\nmaterial check: ${checks.length - failed}/${checks.length} passed`);
console.log(`http/console errors: ${errors.length}`);
for (const error of errors) console.log("  " + error);

await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
