import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:5199/";
const OUT_DIR = join(tmpdir(), "opencode", "room-tests");

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

const stats = {};
const shot = async (name) => {
  const viewport = await page.$(".viewport");
  const buffer = await viewport.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  const b64 = buffer.toString("base64");
  stats[name] = await page.evaluate(async (data) => {
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
    `shot: ${name}.png warm=${stats[name].warm} bbox=${stats[name].bboxW}x${stats[name].bboxH} of ${stats[name].width}x${stats[name].height}`,
  );
};

const setNumber = async (index, value) => {
  await page.evaluate(
    (i, v) => {
      const inputs = document.querySelectorAll(".dimension-row input");
      const el = inputs[i];
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    index,
    value,
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
};

const readInputs = () =>
  page.$$eval(".dimension-row input", (els) => els.map((el) => el.value));

const clickButton = async (label) => {
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
    button?.click();
  }, label);
  await new Promise((resolve) => setTimeout(resolve, 500));
};

const checks = [];
const expect = (label, condition, detail = "") => {
  checks.push({ label, ok: condition, detail });
};

await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector("canvas", { timeout: 15000 });
await new Promise((resolve) => setTimeout(resolve, 2500));

const initialInputs = await readInputs();
console.log("inputs(initial):", initialInputs.join(" | "));
expect(
  "initial dimensions 6x5x2.7x0.2",
  initialInputs.join("|") === "6|5|2.7|0.2",
  initialInputs.join("|"),
);
await shot("01-initial-ceiling-on");
expect(
  "room renders (ceiling on)",
  stats["01-initial-ceiling-on"].warm > 3000,
  `warm=${stats["01-initial-ceiling-on"].warm}`,
);

const assetState = await page.evaluate(() => {
  const api = window.__homeDesigner;
  if (!api) return null;
  const house = api.getHouse();
  const objects = Object.values(house.objects);
  const testObject = objects.find((o) => o.assetId === "test_crate");
  return {
    objectCount: objects.length,
    hasTestCrate: Boolean(testObject),
    bounds: testObject ? api.measure(`object-${testObject.id}`) : null,
  };
});
expect("asset bridge available", assetState !== null, JSON.stringify(assetState));
expect(
  "sample house places the test asset",
  assetState?.hasTestCrate === true,
  JSON.stringify(assetState),
);
{
  const b = assetState?.bounds;
  const height = b ? b.max.y - b.min.y : Number.NaN;
  const centerX = b ? (b.min.x + b.max.x) / 2 : Number.NaN;
  const centerZ = b ? (b.min.z + b.max.z) / 2 : Number.NaN;
  const minY = b ? b.min.y : Number.NaN;
  expect(
    "test asset GLB renders centered on floor (0.5m at 2.0,1.5)",
    b != null &&
      Math.abs(height - 0.5) < 0.02 &&
      Math.abs(minY) < 0.02 &&
      Math.abs(centerX - 2) < 0.02 &&
      Math.abs(centerZ - 1.5) < 0.02,
    JSON.stringify(b),
  );
}

await clickButton("Hide ceiling");
await shot("02-ceiling-off");
expect(
  "floor visible after hiding ceiling",
  stats["02-ceiling-off"].warm > 3000,
  `warm=${stats["02-ceiling-off"].warm}`,
);

const base = stats["02-ceiling-off"];

await setNumber(0, 10);
const widthInputs = await readInputs();
console.log("inputs(width=10):", widthInputs.join(" | "));
expect("width input = 10", widthInputs[0] === "10", widthInputs[0]);
await shot("03-width-10");
expect(
  "geometry grows when width 6 -> 10",
  stats["03-width-10"].bboxW > base.bboxW * 1.15,
  `${base.bboxW} -> ${stats["03-width-10"].bboxW}`,
);

await setNumber(1, 8);
await setNumber(2, 3.5);
const tallInputs = await readInputs();
console.log("inputs(depth=8,height=3.5):", tallInputs.join(" | "));
expect("depth input = 8", tallInputs[1] === "8", tallInputs[1]);
expect("height input = 3.5", tallInputs[2] === "3.5", tallInputs[2]);
await shot("04-depth-8-height-3.5");
expect(
  "geometry grows when depth 5 -> 8 and height 2.7 -> 3.5",
  stats["04-depth-8-height-3.5"].warm >
    stats["03-width-10"].warm * 1.05,
  `${stats["03-width-10"].warm} -> ${stats["04-depth-8-height-3.5"].warm}`,
);

await clickButton("Show ceiling");
await shot("05-final-ceiling-on");
expect(
  "ceiling toggle round-trips",
  (await readInputs())[0] === "10",
);

await setNumber(0, 6);
await setNumber(1, 5);
await setNumber(2, 2.7);
expect(
  "dimensions restore cleanly",
  (await readInputs()).join("|") === "6|5|2.7|0.2",
);

let failed = 0;
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.label}${check.ok ? "" : "  [" + check.detail + "]"}`);
  if (!check.ok) failed += 1;
}
console.log(`\nhttp/console errors: ${errors.length}`);
for (const error of errors) console.log("  " + error);

await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
