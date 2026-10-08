/**
 * Save/load/new/autosave verification for the design persistence layer.
 *
 * Exercises the real validation pipeline and the real stores: documents are
 * built from the live editor state, corrupted and legacy inputs are pushed
 * through parse/validate, and load flows assert both that good data applies
 * and that bad data leaves the current design untouched.
 *
 * Run: npx tsx scripts/design-check.ts
 */
import {
  AUTOSAVE_KEY,
  clearAutosave,
  readAutosave,
  writeAutosave,
  type KeyValueStorage,
} from "../src/persistence/designStorage";
import {
  DEFAULT_DESIGN_SETTINGS,
  DESIGN_FORMAT,
  DESIGN_SCHEMA_VERSION,
  createDesignDocument,
  designFileName,
  parseDesignJson,
  serializeDesign,
  validateDesign,
  type DesignDocument,
} from "../src/persistence/houseData";
import {
  applyDesignDocument,
  currentDesignDocument,
  loadDesignText,
  newDesign,
  restoreAutosave,
  saveDesignFile,
  startDesignAutosave,
} from "../src/persistence/designIO";
import { createSampleHouse, useHouseStore } from "../src/store/houseStore";
import { useEditorStore } from "../src/store/editorStore";
import { clearHistory, getHistoryFlags, historySizes, suppressHistory } from "../src/store/history";
import type { House } from "../src/types/house";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label} ${detail}`);
  }
}

const house = () => useHouseStore.getState().house;
const model = () => useHouseStore.getState();
const editor = () => useEditorStore.getState();
const snap = () => JSON.stringify(house());
const clone = (value: unknown) => JSON.parse(JSON.stringify(value)) as House;
const sizes = () => {
  const { past, future } = historySizes();
  return `past=${past} future=${future}`;
};

function firstDifference(a: string, b: string): string {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) {
      return `at ${i}: …${a.slice(Math.max(0, i - 30), i + 30)}… vs …${b.slice(Math.max(0, i - 30), i + 30)}…`;
    }
  }
  return `length ${a.length} vs ${b.length}`;
}

function reset() {
  suppressHistory(() => model().replaceHouse(createSampleHouse()));
  clearHistory();
  editor().setTool("select");
  editor().select(null);
  editor().setViewMode("3d");
  editor().setCeilingVisible(true);
  editor().setSnapSize(0.1);
  editor().setDraggingWallId(null);
  editor().setDraggingObjectId(null);
  editor().setDraggingOpeningId(null);
}

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function expectRejected(label: string, value: unknown, contains?: string) {
  const result = validateDesign(value);
  if (result.ok) {
    check(label, false, "unexpectedly accepted");
    return;
  }
  check(
    label,
    contains === undefined || result.error.includes(contains),
    `error was: ${result.error}`,
  );
}

function expectRejectedJson(label: string, text: string, contains?: string) {
  const result = parseDesignJson(text);
  if (result.ok) {
    check(label, false, "unexpectedly accepted");
    return;
  }
  check(
    label,
    contains === undefined || result.error.includes(contains),
    `error was: ${result.error}`,
  );
}

// ---------------------------------------------------------------------------
console.log("--- round trip: live document -> JSON -> document ---");
// ---------------------------------------------------------------------------
reset();
const sample = createSampleHouse();
const firstWall = Object.keys(house().walls)[0];

// Build a design that exercises every serialisable part of the document.
model().setRoomDimensions("room-1", { width: 7.5 });
model().setRoomPosition("room-1", -3.5, -2.5);
model().addRoom({ name: "Bedroom" });
const doorId = model().createOpening(firstWall, "door");
const windowWall = Object.keys(house().walls)[1];
const windowId = model().createOpening(windowWall, "window");
const placedId = model().createPlacedObject("sofa", { x: 1.2, z: 0.8 }, Math.PI / 4);
model().updatePlacedObject("obj-test-crate", {
  position: { x: 2.4, y: 0.5, z: 1.6 },
  rotationY: 1.5,
  scale: 1.2,
});
editor().setViewMode("2d");
editor().setCeilingVisible(false);
editor().setSnapSize(0.25);

const liveHouse = snap();
const savedAt = new Date("2026-01-02T03:04:05.000Z");
const document = currentDesignDocument(savedAt);
const text = serializeDesign(document);
const reparsed = parseDesignJson(text);

check("round trip parses", reparsed.ok === true);
if (reparsed.ok) {
  check(
    "round trip preserves the house exactly",
    JSON.stringify(reparsed.document.house) === liveHouse,
    reparsed.ok
      ? firstDifference(JSON.stringify(reparsed.document.house), liveHouse)
      : "",
  );
  check(
    "round trip preserves settings",
    JSON.stringify(reparsed.document.settings) ===
      JSON.stringify({
        ceilingVisible: false,
        viewMode: "2d",
        snapSize: 0.25,
      }),
    JSON.stringify(reparsed.document.settings),
  );
  check(
    "round trip preserves savedAt",
    reparsed.document.savedAt === savedAt.toISOString(),
    reparsed.document.savedAt,
  );
  check(
    "round trip produces no warnings for a live document",
    reparsed.warnings.length === 0,
    reparsed.warnings.join(" | "),
  );
  check("door survives", reparsed.document.house.openings[doorId as string] !== undefined);
  check("window survives", reparsed.document.house.openings[windowId as string] !== undefined);
  check(
    "placed furniture survives with its transform",
    reparsed.document.house.objects[placedId as string] !== undefined &&
      reparsed.document.house.objects[placedId as string].rotationY !== undefined,
  );
  check(
    "rooms/walls counts match",
    Object.keys(reparsed.document.house.rooms).length ===
      Object.keys(house().rooms).length &&
      Object.keys(reparsed.document.house.walls).length ===
        Object.keys(house().walls).length,
  );
}

// ---------------------------------------------------------------------------
console.log("--- schema version and asset references ---");
// ---------------------------------------------------------------------------
check("DESIGN_SCHEMA_VERSION is 1", DESIGN_SCHEMA_VERSION === 1);
const raw = JSON.parse(text) as Record<string, unknown>;
check("format tag is present", raw.format === DESIGN_FORMAT);
check(
  "schemaVersion is present and numeric",
  typeof raw.schemaVersion === "number" && raw.schemaVersion === 1,
  JSON.stringify(raw.schemaVersion),
);
check("savedAt is present", typeof raw.savedAt === "string");
check("house payload is present", typeof raw.house === "object" && raw.house !== null);
check(
  "furniture is referenced by assetId",
  text.includes('"assetId": "test_crate"') && text.includes('"assetId": "sofa"'),
);
check(
  "no GLB/model data is embedded",
  !text.includes(".glb") && !text.includes("modelPath") && !text.includes("data:"),
);

// ---------------------------------------------------------------------------
console.log("--- corrupted data is rejected ---");
// ---------------------------------------------------------------------------
expectRejectedJson("invalid JSON text", "{not json", "not valid JSON");
expectRejectedJson("JSON number", "42", "must be an object");
expectRejectedJson("JSON string", '"hello"', "must be an object");
expectRejectedJson("JSON null", "null", "must be an object");
expectRejectedJson("JSON array", "[1,2,3]", "must be an object");
expectRejected("empty object", {}, "missing the format tag");
expectRejected("wrong format tag", { format: "other/design", schemaVersion: 1 }, "unrecognised format");
expectRejected("missing house", { format: DESIGN_FORMAT, schemaVersion: 1 }, "house must be an object");
expectRejected("string schemaVersion", { format: DESIGN_FORMAT, schemaVersion: "1", house: {} }, "positive integer");
expectRejected("zero schemaVersion", { format: DESIGN_FORMAT, schemaVersion: 0, house: {} }, "positive integer");
expectRejected("fractional schemaVersion", { format: DESIGN_FORMAT, schemaVersion: 1.5, house: {} }, "positive integer");
expectRejected(
  "future schemaVersion",
  { format: DESIGN_FORMAT, schemaVersion: 999, house: { version: 1, rooms: {}, walls: {}, openings: {}, objects: {} } },
  "newer version",
);
expectRejected(
  "future house schema",
  {
    format: DESIGN_FORMAT,
    schemaVersion: 1,
    house: { version: 2, rooms: {}, walls: {}, openings: {}, objects: {} },
  },
  "newer than the supported",
);
expectRejected(
  "rooms is an array",
  {
    format: DESIGN_FORMAT,
    schemaVersion: 1,
    house: { version: 1, rooms: [], walls: {}, openings: {}, objects: {} },
  },
  "house.rooms must be an object",
);
expectRejected(
  "room width has the wrong type",
  {
    format: DESIGN_FORMAT,
    schemaVersion: 1,
    house: {
      version: 1,
      rooms: {
        "room-1": {
          id: "room-1",
          name: "Room 1",
          position: { x: 0, z: 0 },
          width: "wide",
          depth: 5,
          height: 2.7,
          wallThickness: 0.2,
          edges: { south: "w-s", east: "w-e", north: "w-n", west: "w-w" },
        },
      },
      walls: {},
      openings: {},
      objects: {},
    },
  },
  "width must be a finite number",
);
expectRejected(
  "wall start is null",
  {
    format: DESIGN_FORMAT,
    schemaVersion: 1,
    house: {
      version: 1,
      rooms: {},
      walls: { "w-1": { id: "w-1", start: null, end: { x: 1, z: 1 }, height: 2.7, thickness: 0.2 } },
      openings: {},
      objects: {},
    },
  },
  "start must be an object",
);
expectRejected(
  "object assetId is not a string",
  {
    format: DESIGN_FORMAT,
    schemaVersion: 1,
    house: {
      version: 1,
      rooms: {},
      walls: {},
      openings: {},
      objects: { o1: { id: "o1", assetId: 7, position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 } },
    },
  },
  "assetId must be a string",
);
expectRejected(
  "opening without wallId",
  {
    format: DESIGN_FORMAT,
    schemaVersion: 1,
    house: {
      version: 1,
      rooms: {},
      walls: {},
      openings: { d1: { id: "d1", kind: "door", offset: 0, width: 0.9, height: 2.1, sillHeight: 0 } },
      objects: {},
    },
  },
  "wallId must be a non-empty string",
);
expectRejected(
  "NaN smuggled through JSON as null",
  {
    format: DESIGN_FORMAT,
    schemaVersion: 1,
    house: {
      version: 1,
      rooms: {
        "room-1": {
          id: "room-1",
          position: { x: null, z: 0 },
          width: 6,
          depth: 5,
          height: 2.7,
          wallThickness: 0.2,
          edges: {},
        },
      },
      walls: {},
      openings: {},
      objects: {},
    },
  },
  "position.x must be a finite number",
);

// ---------------------------------------------------------------------------
console.log("--- damaged data is repaired with warnings ---");
// ---------------------------------------------------------------------------
function houselessDesign(houseValue: unknown, settings?: unknown): unknown {
  return {
    format: DESIGN_FORMAT,
    schemaVersion: 1,
    savedAt: "2026-01-01T00:00:00.000Z",
    house: houseValue,
    ...(settings === undefined ? {} : { settings }),
  };
}

{
  const result = validateDesign(
    houselessDesign({
      version: 1,
      rooms: {},
      walls: {},
      openings: {},
      objects: {
        o1: {
          id: "o1",
          assetId: "flux_capacitor",
          position: { x: 0, y: 0, z: 0 },
          rotationY: 0,
          scale: 1,
        },
      },
    }),
  );
  check("unknown assetId loads", result.ok === true);
  if (result.ok) {
    check(
      "unknown asset object is kept",
      result.document.house.objects.o1 !== undefined,
    );
    check(
      "unknown assetId is reported",
      result.warnings.some((warning) => warning.includes("flux_capacitor")),
      result.warnings.join(" | "),
    );
  }
}

{
  const result = validateDesign(
    houselessDesign({
      version: 1,
      rooms: {
        "room-1": {
          id: "room-1",
          name: "Broken",
          position: { x: 0, z: 0 },
          width: -5,
          depth: 999,
          height: -1,
          wallThickness: 0,
          edges: { south: "missing-wall" },
        },
      },
      walls: {},
      openings: {
        d1: { id: "d1", wallId: "missing-wall", kind: "door", offset: 0.5, width: 0.9, height: 2.1, sillHeight: 0 },
      },
      objects: {
        o1: {
          id: "o1",
          assetId: "test_crate",
          position: { x: 0, y: -3, z: 0 },
          rotationY: -1,
          scale: 99,
        },
      },
    }),
  );
  check("damaged room/object data loads", result.ok === true);
  if (result.ok) {
    const room = result.document.house.rooms["room-1"];
    check("negative width is clamped", room.width === 1, String(room.width));
    check("huge depth is clamped", room.depth === 60, String(room.depth));
    check("negative height falls back to default", room.height === 2.7, String(room.height));
    check("zero wall thickness falls back to default", room.wallThickness === 0.2, String(room.wallThickness));
    const object = result.document.house.objects.o1;
    check("negative elevation is clamped", object.position.y === 0, String(object.position.y));
    check("huge scale is clamped", object.scale === 4, String(object.scale));
    check(
      "negative rotation is normalised into [0, 2pi)",
      object.rotationY >= 0 && object.rotationY < Math.PI * 2,
      String(object.rotationY),
    );
    check(
      "dangling wall reference is rebuilt",
      room.edges.south !== undefined &&
        result.document.house.walls[room.edges.south] !== undefined,
      JSON.stringify(room.edges),
    );
    check(
      "opening on a missing wall is dropped, not crashing",
      result.document.house.openings.d1 === undefined,
    );
    check("repairs are reported", result.warnings.length >= 4, result.warnings.join(" | "));
  }
}

{
  const result = validateDesign(
    houselessDesign(
      {
        version: 1,
        rooms: {
          "room-1": {
            id: "room-key-mismatch",
            position: { x: 0, z: 0 },
            width: 6,
            depth: 5,
            height: 2.7,
            wallThickness: 0.2,
            edges: {},
          },
        },
        walls: {},
        openings: {},
        objects: {},
      },
      { ceilingVisible: "yes", viewMode: "iso", snapSize: 0.37 },
    ),
  );
  check("id mismatch and bad settings still load", result.ok === true);
  if (result.ok) {
    const room = result.document.house.rooms["room-1"];
    check("entity id is forced to its key", room !== undefined && room.id === "room-1", room?.id);
    check(
      "missing name defaults to Room",
      room !== undefined && room.name === "Room",
      room?.name,
    );
    check(
      "bad ceiling flag falls back",
      result.document.settings.ceilingVisible === DEFAULT_DESIGN_SETTINGS.ceilingVisible,
    );
    check(
      "bad view mode falls back",
      result.document.settings.viewMode === "3d",
    );
    check(
      "bad snap size falls back",
      result.document.settings.snapSize === 0.1,
      String(result.document.settings.snapSize),
    );
    check(
      "bad settings are reported",
      result.warnings.filter((warning) => warning.startsWith("settings")).length >= 3,
      result.warnings.join(" | "),
    );
  }
}

{
  const result = validateDesign(
    houselessDesign({
      version: 1,
      rooms: {
        "room-1": {
          id: "room-1",
          position: { x: 0, z: 0 },
          width: 6,
          depth: 5,
          height: 2.7,
          wallThickness: 0.2,
          edges: {},
        },
      },
      walls: {},
      openings: {},
      objects: {},
    }),
  );
  check("missing settings loads with defaults", result.ok === true);
  if (result.ok) {
    check(
      "missing settings uses defaults",
      JSON.stringify(result.document.settings) === JSON.stringify(DEFAULT_DESIGN_SETTINGS),
    );
  }
}

// ---------------------------------------------------------------------------
console.log("--- old and future files ---");
// ---------------------------------------------------------------------------
{
  const legacy = clone(sample);
  const result = validateDesign(legacy);
  check("legacy bare-house file loads", result.ok === true);
  if (result.ok) {
    check(
      "legacy file is upgraded to schema 1",
      result.document.schemaVersion === DESIGN_SCHEMA_VERSION,
      String(result.document.schemaVersion),
    );
    check(
      "legacy house survives the upgrade",
      JSON.stringify(result.document.house.rooms["room-1"]) !== undefined &&
        Object.keys(result.document.house.rooms).length === 1,
    );
    check(
      "legacy upgrade is reported",
      result.warnings.some((warning) => warning.includes("legacy")),
      result.warnings.join(" | "),
    );
    check(
      "legacy defaults to default settings",
      JSON.stringify(result.document.settings) === JSON.stringify(DEFAULT_DESIGN_SETTINGS),
    );
  }
}

{
  const future = {
    format: DESIGN_FORMAT,
    schemaVersion: DESIGN_SCHEMA_VERSION + 1,
    savedAt: "2030-01-01T00:00:00.000Z",
    house: clone(sample),
    settings: DEFAULT_DESIGN_SETTINGS,
    futureField: { extra: true },
  };
  const result = validateDesign(future);
  check(
    "files from a newer schema are rejected, not misread",
    result.ok === false && result.error.includes("newer version"),
    result.ok ? "accepted" : result.error,
  );
}

// ---------------------------------------------------------------------------
console.log("--- validation is stable across repeated loads ---");
// ---------------------------------------------------------------------------
{
  const result = parseDesignJson(text);
  check("first load of a saved file succeeds", result.ok === true);
  if (result.ok) {
    const second = parseDesignJson(serializeDesign(result.document));
    check("second load succeeds", second.ok === true);
    if (second.ok) {
      check(
        "repeated loads do not drift",
        JSON.stringify(second.document) === JSON.stringify(result.document),
        firstDifference(
          JSON.stringify(second.document),
          JSON.stringify(result.document),
        ),
      );
    }
  }
}

// ---------------------------------------------------------------------------
console.log("--- document flows against the stores ---");
// ---------------------------------------------------------------------------
reset();
editor().setViewMode("2d");
editor().setCeilingVisible(false);
editor().setSnapSize(0.25);
editor().select({ kind: "room", id: "room-1" });
model().setRoomPosition("room-1", -3, -2.5);
model().addRoom();
check("one edit is undoable before load", getHistoryFlags().canUndo === true, sizes());

const documentB = createDesignDocument(clone(sample), {
  ceilingVisible: true,
  viewMode: "3d",
  snapSize: 0.05,
}, new Date("2026-02-02T00:00:00.000Z"));
applyDesignDocument(documentB);
check(
  "apply replaces the house",
  Object.keys(house().rooms).length === 1 && snap() === JSON.stringify(sample),
  firstDifference(snap(), JSON.stringify(sample)),
);
check("apply clears history", sizes() === "past=0 future=0", sizes());
check("apply clears selection", editor().selection === null);
check(
  "apply restores document settings",
  editor().viewMode === "3d" &&
    editor().ceilingVisible === true &&
    editor().snapSize === 0.05,
  `${editor().viewMode} ${editor().ceilingVisible} ${editor().snapSize}`,
);
check("apply resets the tool", editor().tool === "select");

model().setRoomPosition("room-1", -1, -1);
model().undo();
check(
  "undo after load returns to the loaded document",
  snap() === JSON.stringify(sample),
  firstDifference(snap(), JSON.stringify(sample)),
);

{
  const bad = loadDesignText("{ definitely not json");
  check("invalid text fails to load", bad.ok === false);
  if (!bad.ok) {
    check(
      "failed load leaves the design untouched",
      snap() === JSON.stringify(sample),
      firstDifference(snap(), JSON.stringify(sample)),
    );
    check("failed load leaves history usable", getHistoryFlags().canUndo === false, sizes());
  }
}

{
  const good = loadDesignText(serializeDesign(documentB));
  check("valid text loads", good.ok === true);
  check("loaded design is applied", snap() === JSON.stringify(sample));
}

{
  newDesign();
  check(
    "new design resets to the sample house",
    snap() === JSON.stringify(createSampleHouse()),
    firstDifference(snap(), JSON.stringify(createSampleHouse())),
  );
  check(
    "new design resets settings",
    editor().viewMode === "3d" &&
      editor().ceilingVisible === true &&
      editor().snapSize === 0.1,
  );
  check("new design clears history", sizes() === "past=0 future=0", sizes());
  check("new design clears selection", editor().selection === null);
}

{
  const savedAt = new Date("2026-03-04T05:06:07.000Z");
  const saved = saveDesignFile(savedAt);
  const expectedFilename = designFileName(savedAt);
  check(
    "save returns a dated filename",
    saved.filename === expectedFilename,
    `${saved.filename} (expected ${expectedFilename})`,
  );
  const parsed = parseDesignJson(saved.text);
  check("saved text is a valid design", parsed.ok === true);
  if (parsed.ok) {
    check(
      "saved text matches the live document",
      JSON.stringify(parsed.document.house) === snap(),
    );
    check(
      "saved text carries the requested timestamp",
      parsed.document.savedAt === "2026-03-04T05:06:07.000Z",
      parsed.document.savedAt,
    );
  }
}

check(
  "designFileName pads components",
  designFileName(new Date(2026, 0, 2, 3, 4)) === "home-design-2026-01-02-0304.json",
  designFileName(new Date(2026, 0, 2, 3, 4)),
);

// ---------------------------------------------------------------------------
console.log("--- autosave storage ---");
// ---------------------------------------------------------------------------
{
  const memory = new MemoryStorage();
  check("empty storage reports no autosave", readAutosave(memory) === null);

  reset();
  model().addRoom();
  const doc = currentDesignDocument(new Date("2026-04-05T06:07:08.000Z"));
  check("writeAutosave succeeds", writeAutosave(doc, memory) === true);

  const read = readAutosave(memory);
  check("autosave entry parses", read !== null && read.ok === true);
  if (read && read.ok) {
    check(
      "autosave entry matches the document",
      JSON.stringify(read.document) === JSON.stringify(doc),
      read.ok ? firstDifference(JSON.stringify(read.document), JSON.stringify(doc)) : "",
    );
  }

  check("clearAutosave removes the entry", (() => {
    clearAutosave(memory);
    return readAutosave(memory) === null;
  })());

  memory.setItem(AUTOSAVE_KEY, "{ corrupted");
  const corrupt = readAutosave(memory);
  check("corrupted autosave reports an error", corrupt !== null && corrupt.ok === false);
  if (corrupt && !corrupt.ok) {
    check("corrupted autosave error mentions JSON", corrupt.error.includes("not valid JSON"), corrupt.error);
  }

  memory.setItem(AUTOSAVE_KEY, JSON.stringify({ format: "something-else" }));
  const foreign = readAutosave(memory);
  check("foreign autosave is rejected", foreign !== null && foreign.ok === false);

  const readOnly: KeyValueStorage = {
    getItem() {
      throw new Error("storage disabled");
    },
    setItem() {
      throw new Error("storage disabled");
    },
    removeItem() {
      throw new Error("storage disabled");
    },
  };
  check("throwing getItem degrades to null", readAutosave(readOnly) === null);
  check("throwing setItem degrades to false", writeAutosave(doc, readOnly) === false);
  const removeItemOk = (() => {
    clearAutosave(readOnly);
    return true;
  })();
  check("throwing removeItem does not throw", removeItemOk);
}

// ---------------------------------------------------------------------------
console.log("--- restoreAutosave against the stores ---");
// ---------------------------------------------------------------------------
{
  const memory = new MemoryStorage();
  reset();
  model().setRoomDimensions("room-1", { width: 9 });
  const edited = snap();
  writeAutosave(currentDesignDocument(new Date("2026-05-05T00:00:00.000Z")), memory);

  reset();
  editor().setViewMode("2d");
  const restore = restoreAutosave(memory);
  check("restoreAutosave applies the entry", restore !== null && restore.ok === true);
  check("restored house matches the saved edit", snap() === edited, firstDifference(snap(), edited));
  check(
    "restored settings come from the document",
    editor().viewMode === "3d" && editor().ceilingVisible === true && editor().snapSize === 0.1,
  );
  check("restore clears history", sizes() === "past=0 future=0", sizes());

  memory.setItem(AUTOSAVE_KEY, "###");
  const beforeBad = snap();
  const badRestore = restoreAutosave(memory);
  check("corrupt autosave restore reports failure", badRestore !== null && badRestore.ok === false);
  check("corrupt autosave leaves the design untouched", snap() === beforeBad);

  const memoryEmpty = new MemoryStorage();
  check("missing autosave restore returns null", restoreAutosave(memoryEmpty) === null);
  check("missing autosave leaves the design untouched", snap() === beforeBad);
}

// ---------------------------------------------------------------------------
console.log("--- debounced autosave loop (async) ---");
// ---------------------------------------------------------------------------
{
  const memory = new MemoryStorage();
  reset();
  const stop = startDesignAutosave({ storage: memory, debounceMs: 10 });

  model().addRoom();
  check("edit does not write synchronously", readAutosave(memory) === null);
  await new Promise((resolve) => setTimeout(resolve, 60));
  const written = readAutosave(memory);
  check("debounced autosave writes after an edit", written !== null && written.ok === true);
  if (written && written.ok) {
    check(
      "autosave content tracks the edit",
      Object.keys(written.document.house.rooms).length === 2,
      String(Object.keys(written.document.house.rooms).length),
    );
  }

  editor().setCeilingVisible(false);
  await new Promise((resolve) => setTimeout(resolve, 60));
  const settingsWritten = readAutosave(memory);
  check(
    "settings change triggers the autosave",
    settingsWritten !== null && settingsWritten.ok && settingsWritten.document.settings.ceilingVisible === false,
  );

  stop();
  model().addRoom();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const afterStop = readAutosave(memory);
  check(
    "stopped autosave no longer writes",
    afterStop !== null &&
      afterStop.ok &&
      Object.keys(afterStop.document.house.rooms).length === 2,
    afterStop && afterStop.ok
      ? String(Object.keys(afterStop.document.house.rooms).length)
      : "missing",
  );
}

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll design persistence checks passed");
