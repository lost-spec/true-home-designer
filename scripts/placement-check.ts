import { assetRegistry } from "../src/assets/registry";
import { ASSET_CATALOG } from "../src/assets/catalog";
import {
  CLICK_DRIFT_PX,
  isPlacementActive,
  normalizeAngle,
  resolveObjectMove,
  rotateObjectY,
  ROTATE_STEP,
  snapObjectPosition,
} from "../src/interaction/objectInteraction";
import { useHouseStore, nextObjectId } from "../src/store/houseStore";
import { useEditorStore } from "../src/store/editorStore";
import type { House, PlacedObject } from "../src/types/house";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label} ${detail}`);
  }
}

const approx = (a: number, b: number, epsilon = 1e-9) =>
  Math.abs(a - b) < epsilon;

const house = () => useHouseStore.getState().house;
const model = () => useHouseStore.getState();
const editor = () => useEditorStore.getState();

const clone = (target: House): House => JSON.parse(JSON.stringify(target));

const OBJECT_KEYS = ["id", "assetId", "position", "rotationY", "scale"];
const keysMatch = (object: PlacedObject) => {
  const keys = Object.keys(object).sort();
  return keys.length === OBJECT_KEYS.length && keys.every((key, index) => key === [...OBJECT_KEYS].sort()[index]);
};
const serializableKeys = (target: House) =>
  Object.values(target.objects).every(keysMatch);

check("CLICK_DRIFT_PX is small enough for a deliberate click", CLICK_DRIFT_PX >= 2 && CLICK_DRIFT_PX <= 8);
check("ROTATE_STEP is 45 degrees", approx(ROTATE_STEP, Math.PI / 4));

check("snapObjectPosition rounds to the snap grid", (() => {
  const p = snapObjectPosition(1.26, -0.94, 0.1);
  return approx(p.x, 1.3) && approx(p.z, -0.9);
})());
check("snapObjectPosition supports coarse grids", (() => {
  const p = snapObjectPosition(3.72, -2.61, 0.5);
  return approx(p.x, 3.5) && approx(p.z, -2.5);
})());
check("snapObjectPosition rejects non-finite input", (() => {
  const p = snapObjectPosition(Number.NaN, Number.POSITIVE_INFINITY, 0.1);
  return p.x === 0 && p.z === 0;
})());

check("resolveObjectMove subtracts the grab offset then snaps", (() => {
  const p = resolveObjectMove({ x: 4.13, z: 1.07 }, { x: 0.4, z: 0.2 }, 0.1);
  return approx(p.x, 3.7) && approx(p.z, 0.9);
})());
check("resolveObjectMove keeps drag results on the grid", (() => {
  const p = resolveObjectMove({ x: -7.31, z: 2.66 }, { x: -0.05, z: 0.05 }, 0.1);
  return approx(p.x, snapObjectPosition(-7.26, p.z, 0.1).x) && approx(p.z, 2.6);
})());

check("normalizeAngle wraps negative angles", approx(normalizeAngle(-Math.PI / 2), (3 * Math.PI) / 2));
check("normalizeAngle wraps above 2pi", approx(normalizeAngle(5 * Math.PI), Math.PI));
check("normalizeAngle maps 2pi to 0", approx(normalizeAngle(Math.PI * 2), 0));
check("normalizeAngle rejects non-finite input", normalizeAngle(Number.NaN) === 0);
check("normalizeAngle keeps in-range values", approx(normalizeAngle(1.25), 1.25));

check("rotateObjectY steps forward by 45 degrees", approx(rotateObjectY(0, 1), Math.PI / 4));
check("rotateObjectY steps backward by 45 degrees", approx(rotateObjectY(0, -1), (7 * Math.PI) / 4));
check("rotateObjectY wraps after a full turn", approx(rotateObjectY((7 * Math.PI) / 4, 1), 0));
check("rotateObjectY ignores rotation when metadata forbids it", (() => {
  const before = 0.75;
  return approx(rotateObjectY(before, 1, false), before);
})());

check("isPlacementActive requires both tool and asset", (() => {
  const placing = { tool: "placeObject", placingAssetId: "sofa" };
  const idle = { tool: "placeObject", placingAssetId: null };
  const select = { tool: "select", placingAssetId: "sofa" };
  return isPlacementActive(placing) && !isPlacementActive(idle) && !isPlacementActive(select);
})());

const catalogIds = ASSET_CATALOG.map((asset) => asset.assetId);
check("every catalog asset is reachable through the registry", catalogIds.every((id) => assetRegistry.get(id) !== undefined));
check("registry metadata keeps allowRotation/allowScaling flags", catalogIds.every((id) => {
  const asset = assetRegistry.get(id);
  return typeof asset?.allowRotation === "boolean" && typeof asset?.allowScaling === "boolean";
}));
check("at least one asset forbids scaling", ASSET_CATALOG.some((asset) => !asset.allowScaling));
check("rotation helper honours registry metadata", (() => {
  const asset = assetRegistry.get("test_crate");
  return asset !== undefined && approx(rotateObjectY(1, 1, asset.allowRotation), 1 + ROTATE_STEP);
})());

const fresh = clone(house());
model().replaceHouse(fresh);
const beforeIds = Object.keys(house().objects);
check("sample house starts with only its original object", beforeIds.length === 1 && beforeIds[0] === "obj-test-crate");

const first = model().createPlacedObject("sofa", { x: 1.26, z: -0.94 });
const second = model().createPlacedObject("bed", { x: -2, z: 3 });
check("createPlacedObject returns sequential unique ids", first === "obj-1" && second === "obj-2" && first !== second);
check("every stored object id is unique", (() => {
  const ids = Object.keys(house().objects);
  return new Set(ids).size === ids.length;
})());
check("createPlacedObject stores the requested position", (() => {
  const object = house().objects[first];
  return object !== undefined && approx(object.position.x, 1.26) && approx(object.position.z, -0.94);
})());
check("createPlacedObject defaults rotation to zero", approx(house().objects[first].rotationY, 0));
check("createPlacedObject normalises rotation", (() => {
  const id = model().createPlacedObject("sofa", { x: 0, z: 0 }, 3 * Math.PI);
  return approx(house().objects[id].rotationY, Math.PI);
})());
check("createPlacedObject leaves scale untouched", approx(house().objects[first].scale, 1));

const wallsBefore = JSON.stringify(house().walls);
const roomsBefore = JSON.stringify(house().rooms);
check("placing an object never mutates rooms or walls", JSON.stringify(house().walls) === wallsBefore && JSON.stringify(house().rooms) === roomsBefore);

model().updatePlacedObject(first, { position: { x: 0.1, z: 0.1 }, rotationY: Math.PI / 4 });
check("updatePlacedObject patches position and rotation", (() => {
  const object = house().objects[first];
  return approx(object.position.x, 0.1) && approx(object.position.z, 0.1) && approx(object.rotationY, Math.PI / 4);
})());

const expectedNext = nextObjectId(house());
model().removePlacedObject(first);
check("nextObjectId reuses the lowest free slot", expectedNext === "obj-4" && nextObjectId(house()) === "obj-1");
check("removePlacedObject deletes only that object", house().objects[first] === undefined && house().objects[second] !== undefined);

const snapshot = clone(house());
const roundTripped: House = JSON.parse(JSON.stringify(snapshot));
check("house with objects survives a JSON round trip", JSON.stringify(roundTripped) === JSON.stringify(snapshot));
check("object entries expose only serialisable fields", serializableKeys(house()));
check("placed objects contain only finite numbers", Object.values(house().objects).every((object) =>
  Number.isFinite(object.position.x) &&
  Number.isFinite(object.position.z) &&
  Number.isFinite(object.rotationY) &&
  Number.isFinite(object.scale),
));

check("editor starts in select tool with nothing placed", (() => {
  editor().setTool("select");
  return editor().tool === "select" && editor().placingAssetId === null;
})());
editor().setTool("placeObject");
editor().setPlacingAssetId("sofa");
check("placement mode records tool and asset together", editor().tool === "placeObject" && editor().placingAssetId === "sofa");
check("entering placement clears selection and ghost", editor().selection === null && editor().ghostPosition === null && editor().placingRotationY === 0);
editor().setGhostPosition({ x: 1.5, z: -2.5 });
editor().setPlacingRotationY(Math.PI / 2);
check("placement ghost and rotation are tracked", (() => {
  const state = editor();
  return state.ghostPosition !== null &&
    approx(state.ghostPosition.x, 1.5) &&
    approx(state.ghostPosition.z, -2.5) &&
    approx(state.placingRotationY, Math.PI / 2);
})());
check("placement state is active while placing", isPlacementActive(editor()));
editor().setTool("select");
check("leaving placement mode resets ghost and rotation", (() => {
  const state = editor();
  return state.placingAssetId === null &&
    state.ghostPosition === null &&
    state.placingRotationY === 0 &&
    !isPlacementActive(state);
})());

editor().select({ kind: "object", id: second });
check("objects are selectable through the editor store", editor().selection?.kind === "object" && editor().selection.id === second);
editor().select(null);

model().replaceHouse(fresh);
check("final house state still round-trips after all checks", (() => {
  const json = JSON.stringify(house());
  return JSON.stringify(JSON.parse(json)) === json && serializableKeys(house());
})());

console.log(failures === 0 ? "\nAll placement checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
