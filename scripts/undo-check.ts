/**
 * Undo/redo verification for the house editor.
 *
 * Exercises the real stores (houseStore + editorStore + history) the same way
 * the UI does: every action flows through the wrapped set(), batches mimic
 * drags and typing sessions, and undo/redo run the actual store actions.
 *
 * Run: npx tsx scripts/undo-check.ts
 */
import {
  clearHistory,
  forceEndHistoryBatches,
  getHistoryFlags,
  beginHistoryBatch,
  endHistoryBatch,
  historySizes,
  MAX_HISTORY_ENTRIES,
  suppressHistory,
  undoRedoAction,
} from "../src/store/history";
import { useHouseStore, type HouseState } from "../src/store/houseStore";
import { useEditorStore } from "../src/store/editorStore";
import { reconcile } from "../src/geometry/roomGeometry";
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
const clone = (value: unknown) => JSON.parse(JSON.stringify(value));
const sizes = () => {
  const { past, future } = historySizes();
  return `past=${past} future=${future}`;
};

const initialHouse = clone(house()) as House;

/** Restore a pristine document with empty history and no lingering drags. */
function reset() {
  suppressHistory(() => model().replaceHouse(clone(initialHouse)));
  clearHistory();
  editor().setDraggingWallId(null);
  editor().setDraggingObjectId(null);
  editor().setDraggingOpeningId(null);
  editor().select(null);
}

function editorSnapshot(): string {
  const state = editor();
  return JSON.stringify({
    tool: state.tool,
    viewMode: state.viewMode,
    ceilingVisible: state.ceilingVisible,
    snapSize: state.snapSize,
    selection: state.selection,
    placingAssetId: state.placingAssetId,
    placingRotationY: state.placingRotationY,
    ghostPosition: state.ghostPosition,
  });
}

function collectNonFinite(value: unknown, path: string, out: string[]): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) out.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectNonFinite(entry, `${path}[${index}]`, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      collectNonFinite(entry, path === "" ? key : `${path}.${key}`, out);
    }
  }
}

/** Corruption checks every snapshot must survive. */
function corruptionChecks(label: string, source: House) {
  const json = JSON.stringify(source);
  const roundTrip = JSON.stringify(JSON.parse(json));
  check(`${label}: JSON round-trip is stable`, json === roundTrip);

  const houseCopy = clone(source) as House;
  const first = JSON.stringify(reconcile(houseCopy));
  const second = JSON.stringify(reconcile(JSON.parse(first)));
  check(`${label}: reconcile is idempotent`, first === second);

  const nonFinite: string[] = [];
  collectNonFinite(source, "", nonFinite);
  check(
    `${label}: all numbers are finite`,
    nonFinite.length === 0,
    nonFinite.join(", "),
  );
}

// ---------------------------------------------------------------------------
console.log("--- initial state ---");
// ---------------------------------------------------------------------------
reset();
check("initial history is empty", sizes() === "past=0 future=0");
check("canUndo is false", getHistoryFlags().canUndo === false);
check("canRedo is false", getHistoryFlags().canRedo === false);
corruptionChecks("initial house", house());

// ---------------------------------------------------------------------------
console.log("--- timeline: undo/redo restores exact snapshots ---");
// ---------------------------------------------------------------------------
reset();

const labels: string[] = [];
const beforeStates: string[] = [];
const afterStates: string[] = [];
let createdRoom: string | null = null;
let createdObject: string | null = null;
let createdOpening: string | null = null;
const firstWall = Object.keys(house().walls)[0];

function act(label: string, mutation: () => void) {
  const before = snap();
  mutation();
  const after = snap();
  labels.push(label);
  beforeStates.push(before);
  afterStates.push(after);
  check(`${label}: changes the house`, before !== after);
}

act("setRoomDimensions", () =>
  model().setRoomDimensions("room-1", { width: 7 }),
);
act("setRoomPosition", () => model().setRoomPosition("room-1", -2.5, -2));
act("addRoom", () => {
  createdRoom = model().addRoom();
  check("addRoom returns a new room id", createdRoom !== null);
});
act("createPlacedObject", () => {
  createdObject = model().createPlacedObject("test_crate", { x: 1, z: 1 }, 45);
  check("createPlacedObject returns an id", createdObject !== null);
});
act("updatePlacedObject", () =>
  model().updatePlacedObject("obj-test-crate", {
    position: { x: 2.5, y: 0, z: 2 },
  }),
);
act("createOpening", () => {
  createdOpening = model().createOpening(firstWall, "door");
  check("createOpening returns an id", createdOpening !== null);
});
act("updateOpening", () =>
  model().updateOpening(createdOpening as string, { offset: 1.5, width: 1.2 }),
);
act("removeOpening", () => model().removeOpening(createdOpening as string));
act("removePlacedObject", () => model().removePlacedObject("obj-test-crate"));
act("removeRoom", () => model().removeRoom(createdRoom as string));

const timelineInitial = beforeStates[0];
check(
  "history holds one entry per action",
  sizes() === `past=${labels.length} future=0`,
  sizes(),
);
check(
  "canUndo true with entries",
  getHistoryFlags().canUndo === true,
);
check(
  "canRedo false before any undo",
  getHistoryFlags().canRedo === false,
);

for (let i = labels.length - 1; i >= 0; i -= 1) {
  model().undo();
  check(
    `undo restores pre-${labels[i]} snapshot`,
    snap() === beforeStates[i],
    sizes(),
  );
}
check("undoing everything reaches the initial state", snap() === timelineInitial);
check(
  "undoing everything empties the undo stack",
    getHistoryFlags().canUndo === false,
);
check(
  "undoing everything fills the redo stack",
  getHistoryFlags().canRedo === true,
);

for (let i = 0; i < labels.length; i += 1) {
  model().redo();
  check(
    `redo restores post-${labels[i]} snapshot`,
    snap() === afterStates[i],
    sizes(),
  );
}
check(
  "redoing everything empties the redo stack",
  getHistoryFlags().canRedo === false,
);
corruptionChecks("timeline final house", house());

// ---------------------------------------------------------------------------
console.log("--- redo stack is cleared by a new action ---");
// ---------------------------------------------------------------------------
reset();
model().setRoomPosition("room-1", 0, 0);
model().setRoomPosition("room-1", 1, 1);
model().undo();
check(
  "one undo leaves one redo available",
  sizes() === "past=1 future=1",
  sizes(),
);
model().setRoomPosition("room-1", 2, 2);
check(
  "a new action clears the redo stack",
  sizes() === "past=2 future=0",
  sizes(),
);
check("canRedo false after new action", getHistoryFlags().canRedo === false);

// ---------------------------------------------------------------------------
console.log("--- continuous drag groups into one entry ---");
// ---------------------------------------------------------------------------
reset();
const dragStart = snap();
beginHistoryBatch();
for (let i = 1; i <= 50; i += 1) {
  model().updatePlacedObject("obj-test-crate", {
    position: { x: i * 0.1, y: 0, z: 0 },
  });
}
endHistoryBatch();
const dragEnd = snap();
check("50 drag moves commit exactly one entry", sizes() === "past=1 future=0", sizes());
model().undo();
check("drag undo reverts to the pre-drag snapshot", snap() === dragStart);
model().redo();
check("drag redo restores the post-drag snapshot", snap() === dragEnd);

// ---------------------------------------------------------------------------
console.log("--- batches that change nothing record nothing ---");
// ---------------------------------------------------------------------------
reset();
const untouched = snap();
beginHistoryBatch();
endHistoryBatch();
check("empty batch records nothing", sizes() === "past=0 future=0", sizes());
check("empty batch leaves the house alone", snap() === untouched);

beginHistoryBatch();
model().updatePlacedObject("obj-test-crate", {
  position: { x: 3, y: 0, z: 1.5 },
});
model().updatePlacedObject("obj-test-crate", {
  position: { x: 2, y: 0, z: 1.5 },
});
endHistoryBatch();
check(
  "a net-zero batch records nothing",
  sizes() === "past=0 future=0",
  sizes(),
);
check("net-zero batch leaves the house alone", snap() === untouched);

// ---------------------------------------------------------------------------
console.log("--- nested batches commit once ---");
// ---------------------------------------------------------------------------
reset();
const nestedStart = snap();
beginHistoryBatch();
beginHistoryBatch();
model().setRoomPosition("room-1", 0, 0);
beginHistoryBatch();
model().setRoomPosition("room-1", 1, 1);
endHistoryBatch();
endHistoryBatch();
endHistoryBatch();
check("three nested batches commit one entry", sizes() === "past=1 future=0", sizes());
model().undo();
check("nested batch undo restores pre-batch snapshot", snap() === nestedStart);

// ---------------------------------------------------------------------------
console.log("--- unbatched actions stay separate ---");
// ---------------------------------------------------------------------------
reset();
model().setRoomPosition("room-1", 0, 0);
const afterFirst = snap();
model().setRoomPosition("room-1", 1, 1);
check("two plain actions record two entries", sizes() === "past=2 future=0", sizes());
model().undo();
check("first undo returns to the first action's result", snap() === afterFirst);
model().undo();
check(
  "second undo reaches the pristine state",
  snap() === JSON.stringify(initialHouse),
);

// ---------------------------------------------------------------------------
console.log(`--- history is capped at ${MAX_HISTORY_ENTRIES} ---`);
// ---------------------------------------------------------------------------
reset();
const capStates: string[] = [snap()];
for (let i = 1; i <= 120; i += 1) {
  model().setRoomPosition("room-1", i % 2 === 0 ? -3 : -2.9, -2.5);
  capStates.push(snap());
  check(
    `cap action ${i} changed the house`,
    capStates[i] !== capStates[i - 1],
  );
  if (capStates[i] === capStates[i - 1]) break;
}
check(
  `past is capped at ${MAX_HISTORY_ENTRIES}`,
  historySizes().past === MAX_HISTORY_ENTRIES,
  sizes(),
);

let undoCount = 0;
while (getHistoryFlags().canUndo && undoCount <= MAX_HISTORY_ENTRIES + 10) {
  model().undo();
  undoCount += 1;
}
check(
  `exactly ${MAX_HISTORY_ENTRIES} undos are available after capping`,
  undoCount === MAX_HISTORY_ENTRIES,
  `count=${undoCount}`,
);
check(
  "undoing past the cap lands on the state after the oldest surviving action",
  snap() === capStates[20],
);
check(
  "redo stack holds every capped undo",
  historySizes().future === MAX_HISTORY_ENTRIES,
  sizes(),
);

// ---------------------------------------------------------------------------
console.log("--- undo is blocked mid-batch ---");
// ---------------------------------------------------------------------------
reset();
model().setRoomPosition("room-1", 0, 0);
const preBatch = snap();
beginHistoryBatch();
model().setRoomPosition("room-1", 1, 1);
model().undo();
check(
  "undo mid-batch does not restore anything",
  snap() !== preBatch,
  sizes(),
);
check(
  "undo mid-batch leaves the stacks untouched",
  sizes() === "past=1 future=0",
  sizes(),
);
endHistoryBatch();
check(
  "ending the batch commits its single entry",
  sizes() === "past=2 future=0",
  sizes(),
);
model().undo();
check(
  "undo after the batch restores the pre-batch snapshot",
  snap() === preBatch,
);

// ---------------------------------------------------------------------------
console.log("--- undo is blocked while dragging ---");
// ---------------------------------------------------------------------------
reset();
model().setRoomPosition("room-1", 0, 0);
const draggingState = snap();
editor().setDraggingObjectId("obj-test-crate");
model().undo();
check(
  "undo while dragging keeps the house unchanged",
  snap() === draggingState,
  sizes(),
);
check(
  "undo while dragging leaves the stacks untouched",
  sizes() === "past=1 future=0",
  sizes(),
);
editor().setDraggingObjectId(null);
model().undo();
check(
  "undo works again once the drag clears",
  snap() !== draggingState,
  sizes(),
);

// ---------------------------------------------------------------------------
console.log("--- selection repair after restore ---");
// ---------------------------------------------------------------------------
reset();
// Object selection is dropped when the object no longer exists.
const restoredObject = model().createPlacedObject("test_crate", { x: 4, z: 4 });
editor().select({ kind: "object", id: restoredObject });
model().undo();
check(
  "selection on a removed object is cleared",
  editor().selection === null,
);

// Room selection survives because the room still exists after the undo.
editor().select({ kind: "room", id: "room-1" });
model().setRoomPosition("room-1", 0, 0);
model().undo();
check(
  "selection on a surviving room is kept",
  editor().selection !== null && editor().selection.id === "room-1",
);

// A wall selection that is already dangling is cleared on the next restore.
reset();
const wallsBefore = Object.keys(house().walls);
const secondRoom = model().addRoom();
const newWall = Object.keys(house().walls).find(
  (id) => !wallsBefore.includes(id),
);
check("addRoom creates a new wall", newWall !== undefined);
editor().select({ kind: "wall", id: newWall as string });
model().removeRoom(secondRoom);
model().setRoomPosition("room-1", 0, 0);
model().undo();
check(
  "selection on a removed wall is cleared",
  editor().selection === null,
);

// ---------------------------------------------------------------------------
console.log("--- undo/redo apply snapshots without re-recording ---");
// ---------------------------------------------------------------------------
reset();
model().setRoomPosition("room-1", 0, 0);
model().undo();
check(
  "undo records nothing (stacks moved only by the pop)",
  sizes() === "past=0 future=1",
  sizes(),
);
model().redo();
check(
  "redo records nothing (stacks moved only by the pop)",
  sizes() === "past=1 future=0",
  sizes(),
);

// ---------------------------------------------------------------------------
console.log("--- history tracks the house only ---");
// ---------------------------------------------------------------------------
reset();
editor().setViewMode("2d");
editor().setSnapSize(0.25);
editor().toggleCeiling();
editor().setTool("wall");
editor().select({ kind: "room", id: "room-1" });
check(
  "editor-only operations record nothing",
  sizes() === "past=0 future=0",
  sizes(),
);
const editorBefore = editorSnapshot();
model().setRoomDimensions("room-1", { depth: 6.5 });
model().undo();
check(
  "undo leaves every editor field untouched",
  editorSnapshot() === editorBefore,
);
check(
  "house action plus undo leaves only the redo entry",
  sizes() === "past=0 future=1",
  sizes(),
);
check("editor-only operations keep canUndo false", getHistoryFlags().canUndo === false);

// ---------------------------------------------------------------------------
console.log("--- editor-only state changes never enter history ---");
// ---------------------------------------------------------------------------
reset();
editor().setGhostPosition({ x: 1, z: 2 });
editor().setPlacingAssetId("test_crate");
editor().setPlacingRotationY(45);
editor().setDraggingWallId("wall-1");
editor().setDraggingOpeningId(null);
editor().setDraggingWallId(null);
check(
  "placement/drag editor changes record nothing",
  sizes() === "past=0 future=0",
  sizes(),
);

// ---------------------------------------------------------------------------
console.log("--- safety nets ---");
// ---------------------------------------------------------------------------
reset();
beginHistoryBatch();
model().setRoomPosition("room-1", 0, 0);
forceEndHistoryBatches();
check(
  "forceEndHistoryBatches commits a leaked batch",
  sizes() === "past=1 future=0",
  sizes(),
);
endHistoryBatch();
endHistoryBatch();
check(
  "extra endHistoryBatch calls are no-ops",
  sizes() === "past=1 future=0",
  sizes(),
);
forceEndHistoryBatches();
check(
  "forceEndHistoryBatches is a no-op when idle",
  sizes() === "past=1 future=0",
  sizes(),
);
model().undo();
check(
  "history still works after the safety nets",
  sizes() === "past=0 future=1",
  sizes(),
);

// ---------------------------------------------------------------------------
console.log("--- keyboard mapping ---");
// ---------------------------------------------------------------------------
const keyEvent = (overrides: Partial<{
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}>) => ({
  key: "z",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

check("Ctrl+Z maps to undo", undoRedoAction(keyEvent({ ctrlKey: true })) === "undo");
check("Cmd+Z maps to undo", undoRedoAction(keyEvent({ metaKey: true })) === "undo");
check(
  "Ctrl+Shift+Z maps to redo",
  undoRedoAction(keyEvent({ ctrlKey: true, shiftKey: true })) === "redo",
);
check(
  "Cmd+Shift+Z maps to redo",
  undoRedoAction(keyEvent({ metaKey: true, shiftKey: true })) === "redo",
);
check(
  "uppercase Z is handled",
  undoRedoAction(keyEvent({ ctrlKey: true, key: "Z" })) === "undo",
);
check(
  "Ctrl+Alt+Z is ignored",
  undoRedoAction(keyEvent({ ctrlKey: true, altKey: true })) === null,
);
check(
  "plain Z is ignored",
  undoRedoAction(keyEvent({})) === null,
);
check(
  "Ctrl+Y is ignored",
  undoRedoAction(keyEvent({ ctrlKey: true, key: "y" })) === null,
);
check(
  "Ctrl+A is ignored",
  undoRedoAction(keyEvent({ ctrlKey: true, key: "a" })) === null,
);

// ---------------------------------------------------------------------------
console.log("--- store wiring sanity ---");
// ---------------------------------------------------------------------------
reset();
check(
  "houseStore exposes undo and redo",
  typeof (model() as HouseState).undo === "function" &&
    typeof (model() as HouseState).redo === "function",
);
model().undo();
check("undo on an empty history is a no-op", sizes() === "past=0 future=0", sizes());
model().redo();
check("redo on an empty history is a no-op", sizes() === "past=0 future=0", sizes());

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll undo/redo checks passed");
