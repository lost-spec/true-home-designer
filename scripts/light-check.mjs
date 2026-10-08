import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Lighting/visual quality check.
 *
 * Loads the app at the default camera and:
 *   - samples luminance at known 3D probe points (lit vs shadowed wall, ground
 *     shadow vs lit ground, ceiling top)
 *   - checks the static camera for frame-to-frame flicker
 *   - orbits representative angles
 *   - raises the camera with the ceiling off and samples the interior
 *     (sunlit floor vs wall-shaded floor, crate shadow vs control, inner walls)
 *
 * Every probe reports which surface the pixel actually belongs to (via the
 * dev pickTop bridge) so an occluded probe fails instead of being trusted.
 *
 * Run: npm run dev -- --port 5199   (separate shell)
 *      node scripts/light-check.mjs
 */
const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:5199/";
const OUT_DIR = join(tmpdir(), "opencode", "light-tests");

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
const warnings = [];
page.on("console", (message) => {
  const text = message.text();
  if (message.type() === "error") errors.push(`console: ${text}`);
  else if (message.type() === "warning") warnings.push(`console: ${text}`);
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

const failures = [];
const assert = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${message}`);
};

const stats = {};

const capture = async (name) => {
  await new Promise((resolve) => setTimeout(resolve, 700));
  const viewport = await page.$(".viewport");
  return viewport.screenshot({ path: join(OUT_DIR, `${name}.png`) });
};

const analyse = async (buffer) =>
  page.evaluate(async (data) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    let black = 0;
    let white = 0;
    let dark = 0;
    let n = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += lum;
      if (lum < 10) black += 1;
      if (lum < 32) dark += 1;
      if (lum > 248) white += 1;
      n += 1;
    }
    return {
      mean: +(sum / n).toFixed(1),
      blackPct: +((black / n) * 100).toFixed(2),
      darkPct: +((dark / n) * 100).toFixed(2),
      whitePct: +((white / n) * 100).toFixed(2),
    };
  }, buffer.toString("base64"));

const shot = async (name) => {
  const buffer = await capture(name);
  const s = await analyse(buffer);
  stats[name] = s;
  console.log(
    `shot ${name}: mean=${s.mean} black=${s.blackPct}% dark=${s.darkPct}% white=${s.whitePct}%`,
  );
  return s;
};

const drag = async (x, y, dx, dy, steps = 12) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 700));
};

const wheel = async (x, y, delta) => {
  await page.mouse.move(x, y);
  await page.mouse.wheel({ deltaY: delta });
  await new Promise((resolve) => setTimeout(resolve, 700));
};

const clickButton = async (label) => {
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
    button?.click();
  }, label);
  await new Promise((resolve) => setTimeout(resolve, 600));
};

/** A spot inside the viewport where nothing interactive sits under the mouse,
 *  with enough room around it for a vertical drag. */
const emptySpot = async (dy) =>
  page.evaluate((dragAmount) => {
    const rect = document.querySelector(".viewport").getBoundingClientRect();
    const y0 = rect.top + Math.max(60, Math.abs(dragAmount) + 40);
    const y1 = rect.bottom - Math.max(60, Math.abs(dragAmount) + 40);
    for (let y = y0; y <= y1; y += 50) {
      for (let x = rect.left + 60; x <= rect.right - 60; x += 60) {
        if (window.__homeDesigner.pickTop(x, y) === null) return { x, y };
      }
    }
    return null;
  }, dy);

/** Orbit the camera vertically until `test` in the page returns true. */
const orbitUntil = async (label, dy, test, tries = 6) => {
  for (let i = 0; i < tries; i += 1) {
    const state = await page.evaluate(test);
    if (state.ok) return state;
    const spot = await emptySpot(dy);
    if (!spot) break;
    await drag(spot.x, spot.y, 0, dy);
  }
  return page.evaluate(test);
};

/**
 * Screenshot + sample a 7x7 patch around each projected world point. Each row
 * carries the surface under the pixel (pickTop) and the math ground hit so a
 * caller can reject occluded probes.
 */
const sampleRows = async (buffer, points, radius = 3) =>
  page.evaluate(
    async (data, pts, rad) => {
      const img = new Image();
      img.src = "data:image/png;base64," + data;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const viewport = document.querySelector(".viewport").getBoundingClientRect();
      const canvasRect = document.querySelector("canvas").getBoundingClientRect();
      const offX = canvasRect.left - viewport.left;
      const offY = canvasRect.top - viewport.top;
      return pts.map((p) => {
        const c = window.__homeDesigner.project(p.x, p.y, p.z);
        if (!c) return { ...p, lum: null, surface: "offscreen" };
        const lx = Math.round(c.x - viewport.left - offX);
        const ly = Math.round(c.y - viewport.top - offY);
        if (lx < 4 || ly < 4 || lx >= canvas.width - 4 || ly >= canvas.height - 4) {
          return { ...p, lum: null, surface: "offscreen" };
        }
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -rad; dy <= rad; dy += 1) {
          for (let dx = -rad; dx <= rad; dx += 1) {
            const px = lx + dx;
            const py = ly + dy;
            if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
            const i = (py * canvas.width + px) * 4;
            r += pixels[i];
            g += pixels[i + 1];
            b += pixels[i + 2];
            n += 1;
          }
        }
        let surface = null;
        try {
          surface = window.__homeDesigner.pickTop(c.x, c.y);
        } catch {
          surface = "pick-error";
        }
        let ground = null;
        try {
          ground = window.__homeDesigner.groundAt(c.x, c.y);
        } catch {
          ground = null;
        }
        return {
          ...p,
          ground,
          lum: Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) / n),
          rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
          surface: surface ?? "(none)",
        };
      });
    },
    buffer.toString("base64"),
    points,
    radius,
  );

/**
 * Screenshot once, then for each role try its candidate points in order and
 * keep the first that is on screen and sits on the expected surface.
 */
const probe = async (label, roles) => {
  const buffer = await capture(label);
  const flat = [];
  for (const role of roles) {
    role.points.forEach((point, index) =>
      flat.push({ role: role.name, index, ...point }),
    );
  }
  const rows = await sampleRows(buffer, flat);

  const results = {};
  console.log(`probe ${label}:`);
  for (const role of roles) {
    const candidates = rows.filter((row) => row.role === role.name);
    const chosen =
      candidates.find((row) => row.lum !== null && role.match(row)) ?? null;
    results[role.name] = chosen;
    if (!chosen) {
      const why = candidates
        .map((c) => `${JSON.stringify([c.x, c.y, c.z])}=>${c.surface}/${c.lum}`)
        .join(" ");
      console.log(`  ${role.name.padEnd(18)} NO USABLE CANDIDATE  ${why}`);
      continue;
    }
    console.log(
      `  ${role.name.padEnd(18)} lum=${String(chosen.lum).padStart(3)} rgb=${JSON.stringify(chosen.rgb)} surface=${chosen.surface} at ${JSON.stringify([chosen.x, chosen.y, chosen.z])}`,
    );
  }
  return results;
};

/** Luminance along a world-space line (used to measure shadow edge softness).
 *  Uses a single-pixel patch so the transition is not smoothed away by the
 *  measurement itself. */
const profile = async (label, points) => {
  const buffer = await capture(label);
  const rows = await sampleRows(buffer, points, 0);
  console.log(
    `profile ${label}: ` +
      rows.map((row) => `${row.lum ?? "-"}`).join(" ") +
      `   [${rows.map((row) => row.surface).join(", ")}]`,
  );
  return rows;
};

/** Mean/stddev of luminance in a box around a projected point: a flat shaded
 *  surface should have a very low stddev (no acne stripes or speckle). */
const flatness = async (label, point, radius = 20) => {
  const buffer = await capture(label);
  const result = await page.evaluate(
    async (data, p, rad) => {
      const img = new Image();
      img.src = "data:image/png;base64," + data;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const viewport = document.querySelector(".viewport").getBoundingClientRect();
      const canvasRect = document.querySelector("canvas").getBoundingClientRect();
      const c = window.__homeDesigner.project(p.x, p.y, p.z);
      if (!c) return null;
      const lx = Math.round(c.x - viewport.left - (canvasRect.left - viewport.left));
      const ly = Math.round(c.y - viewport.top - (canvasRect.top - viewport.top));
      if (lx - rad < 0 || ly - rad < 0 || lx + rad >= canvas.width || ly + rad >= canvas.height) {
        return null;
      }
      const lums = [];
      for (let dy = -rad; dy <= rad; dy += 1) {
        for (let dx = -rad; dx <= rad; dx += 1) {
          const i = ((ly + dy) * canvas.width + (lx + dx)) * 4;
          lums.push(
            0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2],
          );
        }
      }
      const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
      const variance =
        lums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lums.length;
      let surface = null;
      try {
        surface = window.__homeDesigner.pickTop(c.x, c.y);
      } catch {
        surface = "pick-error";
      }
      return {
        mean: +mean.toFixed(1),
        std: +Math.sqrt(variance).toFixed(2),
        n: lums.length,
        surface: surface ?? "(none)",
      };
    },
    buffer.toString("base64"),
    point,
    radius,
  );
  if (!result) {
    console.log(`flatness ${label}: (off screen)`);
  } else {
    console.log(
      `flatness ${label}: mean=${result.mean} std=${result.std} n=${result.n} surface=${result.surface}`,
    );
  }
  return result;
};

const measureFps = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames += 1;
          const elapsed = performance.now() - start;
          if (elapsed < 2000) requestAnimationFrame(tick);
          else resolve(Math.round((frames / elapsed) * 1000));
        };
        requestAnimationFrame(tick);
      }),
  );

const flicker = async (name) => {
  const a = await capture(`${name}-a`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const b = await capture(`${name}-b`);
  return page.evaluate(
    async (left, right) => {
      const load = async (data) => {
        const img = new Image();
        img.src = "data:image/png;base64," + data;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const pa = await load(left);
      const pb = await load(right);
      let changed = 0;
      let max = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(
          Math.abs(pa[i] - pb[i]),
          Math.abs(pa[i + 1] - pb[i + 1]),
          Math.abs(pa[i + 2] - pb[i + 2]),
        );
        if (d > 2) changed += 1;
        if (d > max) max = d;
      }
      return { changed, max, total: pa.length / 4 };
    },
    a.toString("base64"),
    b.toString("base64"),
  );
};

await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector("canvas", { timeout: 15000 });
await new Promise((resolve) => setTimeout(resolve, 3000));

const anySurface = () => true;
const isFloor = (row) => row.surface === "room-floor";
const isWall = (row) => row.surface.includes("wall-");
/** On the visible ground plane: nothing interactive under the pixel, and the
 *  math ground ray lands next to the point we meant to sample. */
const isGround = (row) =>
  row.surface === "(none)" &&
  !!row.ground &&
  Math.hypot(row.ground.x - row.x, row.ground.z - row.z) < 0.5;

console.log("\n== exterior probes (ceiling on, default camera) ==");
await shot("01-default-ceiling-on");
const ext = await probe("exterior", [
  {
    name: "ceiling-top",
    points: [{ x: 0, y: 2.83, z: 0 }],
    match: anySurface,
  },
  {
    name: "wall-sunlit",
    points: [
      { x: 0, y: 1.4, z: 2.61 },
      { x: -2, y: 1.4, z: 2.61 },
    ],
    match: isWall,
  },
  {
    name: "wall-shaded",
    points: [
      { x: 3.11, y: 1.4, z: 0 },
      { x: 3.11, y: 1.4, z: -1.5 },
    ],
    match: isWall,
  },
  {
    name: "ground-shadow",
    points: [
      { x: 4, y: -0.015, z: 1 },
      { x: 4.6, y: -0.015, z: -1 },
      { x: 3.6, y: -0.015, z: 2 },
    ],
    match: isGround,
  },
  {
    name: "ground-lit",
    points: [
      { x: 7, y: -0.015, z: 0 },
      { x: 8, y: -0.015, z: -3 },
      { x: 6, y: -0.015, z: -6 },
      { x: -6, y: -0.015, z: -6 },
      { x: -7, y: -0.015, z: 4 },
    ],
    match: isGround,
  },
]);

console.log("\n== flicker check (static camera) ==");
const fl = await flicker("02-flicker");
assert(
  fl.changed <= 16 && fl.max <= 4,
  `no shadow flicker: changed=${fl.changed}/${fl.total} px maxDelta=${fl.max}`,
);

console.log("\n== orbit shots ==");
await drag(700, 240, 260, 0);
await shot("03-orbit-90");
await drag(700, 240, 260, 0);
await shot("04-orbit-180");
await drag(700, 240, -520, 0);
await wheel(700, 400, -600);
await shot("05-close-in");
await drag(700, 300, 0, -160);
await shot("06-low-angle");

console.log("\n== interior probes (ceiling off, camera raised) ==");
// Fresh load so the interior phase starts from the default camera again.
await page.reload({ waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector("canvas", { timeout: 15000 });
await new Promise((resolve) => setTimeout(resolve, 3000));
await clickButton("Hide ceiling");
const raised = await orbitUntil(
  "raise",
  70,
  () => {
    const c = window.__homeDesigner.project(0, 0.03, 0);
    const crate = window.__homeDesigner.project(2, 0.25, 1.5);
    return {
      ok:
        !!c &&
        window.__homeDesigner.pickTop(c.x, c.y) === "room-floor" &&
        !!crate &&
        (window.__homeDesigner.pickTop(crate.x, crate.y) ?? "").startsWith("Test"),
    };
  },
  6,
);
console.log(`  camera raised for interior view: ${raised.ok}`);
const int = await probe("interior", [
  {
    name: "floor-lit",
    points: [{ x: 0, y: 0.03, z: 0 }],
    match: isFloor,
  },
  {
    name: "floor-shade-west",
    points: [{ x: -2, y: 0.03, z: 0 }],
    match: isFloor,
  },
  {
    name: "floor-shade-north",
    points: [{ x: 0, y: 0.03, z: 2.1 }],
    match: isFloor,
  },
  {
    name: "crate-shadow",
    points: [{ x: 2.41, y: 0.03, z: 1.31 }],
    match: isFloor,
  },
  {
    name: "crate-lit",
    points: [{ x: 1.59, y: 0.03, z: 1.69 }],
    match: isFloor,
  },
  {
    name: "wall-inner-west",
    points: [{ x: -2.88, y: 1.4, z: 0 }],
    match: isWall,
  },
  {
    name: "wall-inner-north",
    points: [{ x: 0, y: 1.4, z: 2.38 }],
    match: isWall,
  },
]);
await shot("07-ceiling-off");

// Shadow-edge softness: 17 samples every 25 mm across the crate's shadow
// boundary on the floor (boundary sits near x=2.53). A hard/aliased edge
// shows one huge jump; PCF should spread the transition over several steps.
const edgeProfile = await profile(
  "crate-shadow-edge",
  Array.from({ length: 17 }, (_, i) => ({
    x: 2.35 + i * 0.025,
    y: 0.03,
    z: 1.4,
  })),
);
const edgeLums = edgeProfile.map((row) => row.lum).filter((l) => l !== null);
const edgeMin = Math.min(...edgeLums);
const edgeMax = Math.max(...edgeLums);
const edgeSpan = edgeMax - edgeMin;
let edgeJump = 0;
for (let i = 1; i < edgeLums.length; i += 1) {
  edgeJump = Math.max(edgeJump, Math.abs(edgeLums[i] - edgeLums[i - 1]));
}
const edgeFloorHits = edgeProfile.filter(
  (row) => row.surface === "room-floor",
).length;
console.log(
  `  edge: floor=${edgeFloorHits}/${edgeProfile.length} min=${edgeMin} max=${edgeMax} span=${edgeSpan} maxJump=${edgeJump}`,
);

// Flatness (shadow acne / speckle): stddev of a 41x41 px patch on a shaded
// floor area and on a lit floor area, both away from any shadow boundary.
const flatShade = await flatness("floor-shaded-flat", { x: -2, y: 0.03, z: 0 }, 20);
const flatLit = await flatness("floor-lit-flat", { x: 0, y: 0.03, z: 0.6 }, 20);

await clickButton("Show ceiling");

const fps = await measureFps();
console.log(`\napprox fps (swiftshader): ${fps}`);

console.log("\n== assertions ==");
for (const [name, row] of Object.entries(ext)) {
  assert(!!row, `exterior probe ${name} resolved`);
}
if (ext["wall-sunlit"] && ext["wall-shaded"]) {
  assert(
    ext["wall-sunlit"].lum > ext["wall-shaded"].lum + 8,
    `sunlit wall brighter than shaded wall (${ext["wall-sunlit"].lum} vs ${ext["wall-shaded"].lum})`,
  );
}
if (ext["ground-lit"] && ext["ground-shadow"]) {
  assert(
    ext["ground-lit"].lum > ext["ground-shadow"].lum + 4,
    `ground shadow visible (${ext["ground-lit"].lum} lit vs ${ext["ground-shadow"].lum} shadow)`,
  );
}
if (ext["ceiling-top"]) {
  assert(ext["ceiling-top"].lum > 120, `ceiling top lit by sun (${ext["ceiling-top"].lum})`);
}
assert(raised.ok, "floor and crate visible with ceiling off");
for (const [name, row] of Object.entries(int)) {
  assert(!!row, `interior probe ${name} resolved`);
  if (row) assert(row.lum >= 45, `interior probe ${name} not black (lum=${row.lum})`);
}
if (int["floor-lit"] && int["floor-shade-west"]) {
  assert(
    int["floor-lit"].lum > int["floor-shade-west"].lum + 6,
    `interior sun band contrast (${int["floor-lit"].lum} lit vs ${int["floor-shade-west"].lum} shaded)`,
  );
}
if (int["crate-lit"] && int["crate-shadow"]) {
  assert(
    int["crate-lit"].lum > int["crate-shadow"].lum + 5,
    `crate casts shadow (${int["crate-lit"].lum} control vs ${int["crate-shadow"].lum} shadow)`,
  );
}
assert(
  edgeFloorHits === edgeProfile.length,
  `shadow edge profile all on floor (${edgeFloorHits}/${edgeProfile.length})`,
);
assert(
  edgeSpan >= 25,
  `shadow edge has tonal range (span=${edgeSpan})`,
);
assert(
  edgeJump <= Math.max(edgeSpan * 0.6, 18),
  `shadow edge is soft, not a step (jump=${edgeJump} of span=${edgeSpan})`,
);
assert(
  !!flatShade && flatShade.surface === "room-floor" && flatShade.std < 12,
  `shaded floor is flat, no acne (std=${flatShade?.std ?? "n/a"})`,
);
assert(
  !!flatLit && flatLit.surface === "room-floor" && flatLit.std < 12,
  `lit floor is flat, no acne (std=${flatLit?.std ?? "n/a"})`,
);
for (const [name, s] of Object.entries(stats)) {
  assert(s.whitePct < 0.5, `${name} no clipped whites (${s.whitePct}%)`);
  assert(s.blackPct < 5, `${name} no crushed blacks (${s.blackPct}%)`);
}

console.log("\nconsole/webgl errors:", errors.length);
for (const error of errors) console.log("  " + error);
if (warnings.length) {
  console.log("warnings:");
  for (const warning of warnings.slice(0, 12)) console.log("  " + warning);
}
console.log(`screenshots: ${OUT_DIR}`);
console.log(`result: ${failures.length} failed, ${errors.length} errors`);

await browser.close();
process.exit(errors.length === 0 && failures.length === 0 ? 0 : 1);
