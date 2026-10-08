import {
  ROOM_EDGES,
  createRoom,
  edgeSpan,
  reconcile,
  roomWallId,
  roomWallIds,
  wallSpan,
  wallUsers,
  type RoomEdge,
} from "../src/geometry/roomGeometry";
import { getFloorBox } from "../src/geometry/floorGeometry";
import { getCeilingBox } from "../src/geometry/ceilingGeometry";
import {
  getOpeningFillBox,
  getOpeningFrameBoxes,
  getWallBoxes,
  getWallHoleRects,
  getWallPlacement,
  type BoxSpec,
} from "../src/geometry/wallGeometry";
import {
  DEFAULT_DOOR_SIZE,
  findOpeningOffset,
  openingsConflict,
  rectsOverlap,
  type OpeningRect,
} from "../src/geometry/openingGeometry";
import { resolveOpeningOffset } from "../src/interaction/openingInteraction";
import { useHouseStore } from "../src/store/houseStore";
import {
  createWallDragAnchor,
  edgeAxis,
  findRoomEdgeForWall,
  resolveWallDrag,
  snapToGrid,
} from "../src/interaction/wallInteraction";
import {
  CEILING_THICKNESS,
  FLOOR_THICKNESS,
  type House,
  type Opening,
  type Wall,
} from "../src/types/house";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label} ${detail}`);
  }
}

const approx = (a: number, b: number, epsilon = 1e-6) =>
  Math.abs(a - b) < epsilon;

const room = createRoom({
  id: "test",
  name: "Test",
  position: { x: -3, z: -2.5 },
  width: 6,
  depth: 5,
});

check("createRoom produces 4 walls", room.walls.length === 4);
check(
  "roomWallIds references generated walls",
  roomWallIds("test").length === 4 &&
    roomWallIds("test").every((id) => room.walls.some((w) => w.id === id)),
);
check(
  "wall ids are deterministic",
  room.walls.map((w) => w.id).join(",") ===
    [
      roomWallId("test", "south"),
      roomWallId("test", "east"),
      roomWallId("test", "north"),
      roomWallId("test", "west"),
    ].join(","),
);

const byId = Object.fromEntries(room.walls.map((w) => [w.id, w]));
const south = byId[roomWallId("test", "south")];
const east = byId[roomWallId("test", "east")];

check("south wall length equals room width", approx(getWallPlacement(south).length, 6));
check("east wall length equals room depth", approx(getWallPlacement(east).length, 5));
check(
  "wall height/thickness come from room",
  south.height === 2.7 && south.thickness === 0.2,
);

const floor = getFloorBox(room.room);
check("floor size matches room", floor.size[0] === 6 && floor.size[2] === 5);
check(
  "floor sits below y=0",
  approx(floor.position[1], -FLOOR_THICKNESS / 2) &&
    approx(floor.position[1] + floor.size[1] / 2, 0),
);
check(
  "floor centered on room",
  approx(floor.position[0], 0) && approx(floor.position[2], 0),
);

const ceiling = getCeilingBox(room.room);
check(
  "ceiling sits on top of walls",
  approx(ceiling.position[1], 2.7 + CEILING_THICKNESS / 2),
);
check(
  "ceiling size matches room",
  ceiling.size[0] === 6 && ceiling.size[2] === 5,
);

const boxes = getWallBoxes(south, []);
check("solid wall generates exactly 1 box", boxes.length === 1);
check(
  "wall box spans full length/height/thickness",
  boxes.length === 1 &&
    approx(boxes[0].size[0], 6) &&
    approx(boxes[0].size[1], 2.7) &&
    approx(boxes[0].size[2], 0.2),
);

const noNaN = (walls: typeof room.walls) =>
  walls.every((w) =>
    [w.start.x, w.start.z, w.end.x, w.end.z, w.height, w.thickness].every(
      Number.isFinite,
    ),
  );
check("generated walls contain no NaN", noNaN(room.walls));

const store = useHouseStore.getState();
const initial = store.house.rooms["room-1"];
check("sample house has one room", Object.keys(store.house.rooms).length === 1);
check(
  "sample room has 4 walls in store",
  initial !== undefined &&
    roomWallIds("room-1").every((id) => store.house.walls[id] !== undefined) &&
    Object.keys(store.house.walls).length === 4,
);
check(
  "every sample wall is referenced by room edges",
  Object.values(store.house.rooms["room-1"].edges).every(
    (id) => store.house.walls[id] !== undefined,
  ) &&
    Object.values(store.house.walls).every((wall) =>
      Object.values(store.house.rooms["room-1"].edges).includes(wall.id),
    ),
);
check(
  "sample house has no openings and only the test asset",
  Object.keys(store.house.openings).length === 0 &&
    Object.keys(store.house.objects).length === 1 &&
    Object.values(store.house.objects)[0].assetId === "test_crate",
);

useHouseStore.getState().setRoomDimensions("room-1", { width: 10 });
let house = useHouseStore.getState().house;
let updated = house.rooms["room-1"];
let updatedSouth = house.walls[roomWallId("room-1", "south")];

check("width change updates room", updated.width === 10);
check(
  "width change regenerates south wall to length 10",
  updatedSouth !== undefined && approx(getWallPlacement(updatedSouth).length, 10),
);
check(
  "resize preserves room center",
  approx(updated.position.x + updated.width / 2, 0) &&
    approx(updated.position.z + updated.depth / 2, 0),
);
check(
  "resize keeps same wall ids",
  roomWallIds("room-1").every((id) => house.walls[id] !== undefined) &&
    Object.keys(house.walls).length === 4,
);
check("walls still NaN-free after width change", noNaN(Object.values(house.walls)));

useHouseStore.getState().setRoomDimensions("room-1", {
  depth: 8,
  height: 3.5,
  wallThickness: 0.3,
});
house = useHouseStore.getState().house;
updated = house.rooms["room-1"];
const eastWall = house.walls[roomWallId("room-1", "east")];
check("depth change updates room", updated.depth === 8);
check(
  "depth change regenerates east wall to length 8",
  eastWall !== undefined && approx(getWallPlacement(eastWall).length, 8),
);
check(
  "wall height/thickness flow into walls",
  eastWall !== undefined &&
    eastWall.height === 3.5 &&
    eastWall.thickness === 0.3,
);
check(
  "ceiling follows new wall height",
  approx(getCeilingBox(updated).position[1], 3.5 + CEILING_THICKNESS / 2),
);

useHouseStore.getState().setRoomDimensions("room-1", { width: 0.1, depth: 999 });
house = useHouseStore.getState().house;
updated = house.rooms["room-1"];
check("width clamped to minimum", updated.width === 1);
check("depth clamped to maximum", updated.depth === 60);

useHouseStore.getState().setRoomDimensions("room-1", { width: Number.NaN });
house = useHouseStore.getState().house;
check("NaN input ignored", house.rooms["room-1"].width === 1);

check("snapToGrid rounds to 0.1 grid", approx(snapToGrid(4.37, 0.1), 4.4));
check("snapToGrid rounds negative values", approx(snapToGrid(-3.83, 0.1), -3.8));
check("snapToGrid supports coarse grids", approx(snapToGrid(3.72, 0.5), 3.5));
check(
  "snapToGrid leaves value when snap invalid",
  snapToGrid(1.234, 0) === 1.234 && approx(snapToGrid(1.234, Number.NaN), 1.234),
);
check(
  "edgeAxis classifies edges",
  edgeAxis("east") === "x" &&
    edgeAxis("west") === "x" &&
    edgeAxis("north") === "z" &&
    edgeAxis("south") === "z",
);

const fresh = createRoom({
  id: "room-1",
  name: "Room 1",
  position: { x: -3, z: -2.5 },
  width: 6,
  depth: 5,
});
const freshHouse: House = {
  version: 1,
  rooms: { "room-1": fresh.room },
  walls: Object.fromEntries(fresh.walls.map((wall) => [wall.id, wall])),
  openings: {},
  objects: {},
};
useHouseStore.getState().replaceHouse(freshHouse);

const storeState = () => useHouseStore.getState();
const getRoom = () => storeState().house.rooms["room-1"];

const rectOk = (house: House) => {
  const r = house.rooms["room-1"];
  const x0 = r.position.x;
  const z0 = r.position.z;
  const x1 = x0 + r.width;
  const z1 = z0 + r.depth;
  const wall = (edge: RoomEdge) => house.walls[roomWallId("room-1", edge)];
  const s = wall("south");
  const e = wall("east");
  const n = wall("north");
  const w = wall("west");
  if (!s || !e || !n || !w) return false;
  const eps = 1e-9;
  const pt = (p: { x: number; z: number }, x: number, z: number) =>
    Math.abs(p.x - x) < eps && Math.abs(p.z - z) < eps;
  return (
    pt(s.start, x0, z0) &&
    pt(s.end, x1, z0) &&
    pt(e.start, x1, z0) &&
    pt(e.end, x1, z1) &&
    pt(n.start, x1, z1) &&
    pt(n.end, x0, z1) &&
    pt(w.start, x0, z1) &&
    pt(w.end, x0, z0) &&
    approx(getWallPlacement(s).length, r.width) &&
    approx(getWallPlacement(e).length, r.depth) &&
    approx(getWallPlacement(n).length, r.width) &&
    approx(getWallPlacement(w).length, r.depth)
  );
};

check("reset house rectangle intact", rectOk(storeState().house));
check(
  "reset house has 4 walls",
  Object.keys(storeState().house.walls).length === 4,
);

const eastTarget = findRoomEdgeForWall(
  storeState().house,
  roomWallId("room-1", "east"),
);
check(
  "findRoomEdgeForWall resolves east wall",
  eastTarget !== null && eastTarget.edge === "east" && eastTarget.roomId === "room-1",
);
const anchorEast = eastTarget
  ? createWallDragAnchor(eastTarget, getRoom(), { x: 3.6, z: 0 })
  : null;
check(
  "anchor captures edge coordinate and grab offset",
  anchorEast !== null &&
    anchorEast.axis === "x" &&
    approx(anchorEast.edgeCoord, 3) &&
    approx(anchorEast.grabOffset, -0.6),
);
check(
  "resolveWallDrag applies snap",
  anchorEast !== null && approx(resolveWallDrag(anchorEast, { x: 4.12, z: 123 }, 0.1), 3.5),
);
check(
  "resolveWallDrag ignores non-finite ground",
  anchorEast !== null &&
    approx(resolveWallDrag(anchorEast, { x: Number.NaN, z: 0 }, 0.1), 3),
);
check(
  "findRoomEdgeForWall rejects unknown wall",
  findRoomEdgeForWall(storeState().house, "nope") === null,
);
const southTarget = findRoomEdgeForWall(
  storeState().house,
  roomWallId("room-1", "south"),
);
const anchorSouth = southTarget
  ? createWallDragAnchor(southTarget, getRoom(), { x: 0, z: -2 })
  : null;
check(
  "south anchor uses z axis",
  anchorSouth !== null &&
    anchorSouth.axis === "z" &&
    approx(anchorSouth.edgeCoord, -2.5) &&
    approx(anchorSouth.grabOffset, -0.5),
);

storeState().moveRoomEdge("room-1", "east", 4.4);
let r = getRoom();
check(
  "east drag extends width, west edge fixed",
  approx(r.width, 7.4) && approx(r.position.x, -3),
);
check(
  "east drag preserves depth and south edge",
  approx(r.depth, 5) && approx(r.position.z, -2.5),
);
check("east drag keeps rectangle integrity", rectOk(storeState().house));
check(
  "east drag regenerates all 4 walls",
  Object.keys(storeState().house.walls).length === 4,
);
const floorAfterEast = getFloorBox(r);
check(
  "floor follows east drag",
  approx(floorAfterEast.size[0], r.width) &&
    approx(floorAfterEast.size[2], r.depth) &&
    approx(floorAfterEast.position[0], r.position.x + r.width / 2) &&
    approx(floorAfterEast.position[2], r.position.z + r.depth / 2),
);
const ceilingAfterEast = getCeilingBox(r);
check(
  "ceiling follows east drag",
  approx(ceilingAfterEast.size[0], r.width) &&
    approx(ceilingAfterEast.size[2], r.depth),
);

storeState().moveRoomEdge("room-1", "west", -3.83);
r = getRoom();
check(
  "west drag moves west edge, east edge fixed",
  approx(r.position.x, -3.83) && approx(r.position.x + r.width, 4.4),
);
check("west drag keeps rectangle integrity", rectOk(storeState().house));

storeState().moveRoomEdge("room-1", "north", 3.72);
r = getRoom();
check(
  "north drag extends depth, south edge fixed",
  approx(r.position.z, -2.5) && approx(r.position.z + r.depth, 3.72),
);
check("north drag keeps rectangle integrity", rectOk(storeState().house));

storeState().moveRoomEdge("room-1", "south", -3.43);
r = getRoom();
check(
  "south drag moves south edge, north edge fixed",
  approx(r.position.z, -3.43) && approx(r.position.z + r.depth, 3.72),
);
check("south drag keeps rectangle integrity", rectOk(storeState().house));
check(
  "floor matches room after all drags",
  approx(getFloorBox(r).size[0], r.width) && approx(getFloorBox(r).size[2], r.depth),
);

const beforeNaN = JSON.stringify(storeState().house);
storeState().moveRoomEdge("room-1", "east", Number.NaN);
check("NaN world position ignored", JSON.stringify(storeState().house) === beforeNaN);

storeState().moveRoomEdge("room-1", "east", 200);
r = getRoom();
check(
  "east drag clamps width to maximum",
  approx(r.width, 60) && approx(r.position.x, -3.83),
);
check("max clamp keeps rectangle integrity", rectOk(storeState().house));

storeState().moveRoomEdge("room-1", "east", -50);
r = getRoom();
check(
  "east drag clamps width to minimum",
  approx(r.width, 1) && approx(r.position.x, -3.83),
);
check("min clamp keeps rectangle integrity", rectOk(storeState().house));
check(
  "walls NaN-free after drag sequence",
  noNaN(Object.values(storeState().house.walls)),
);

useHouseStore.getState().replaceHouse(freshHouse);
const model = () => useHouseStore.getState();
const houseNow = () => model().house;

const addedId = model().addRoom({
  position: { x: 4, z: -2.5 },
  width: 4,
  depth: 5,
});
let h = houseNow();
check(
  "addRoom creates a second room",
  addedId !== "room-1" &&
    Object.keys(h.rooms).length === 2 &&
    h.rooms[addedId] !== undefined,
);
check(
  "addRoom generates 4 more walls",
  Object.keys(h.walls).length === 8,
);
check(
  "new room walls are owned by the new room",
  roomWallIds(addedId).every((id) => {
    const wall = h.walls[id];
    return (
      wall !== undefined &&
      wallUsers(h, id).some((user) => user.roomId === addedId)
    );
  }),
);
check(
  "room-1 untouched by addRoom",
  h.rooms["room-1"].width === 6 &&
    h.rooms["room-1"].depth === 5 &&
    roomWallIds("room-1").every((id) => h.walls[id] !== undefined),
);

const addedTarget = findRoomEdgeForWall(h, roomWallId(addedId, "east"));
check(
  "findRoomEdgeForWall resolves via wall ownership",
  addedTarget !== null &&
    addedTarget.roomId === addedId &&
    addedTarget.edge === "east",
);

const roomOneBefore = JSON.stringify(h.rooms["room-1"]);
model().moveRoomEdge(addedId, "east", 10);
h = houseNow();
check(
  "dragging second room leaves room-1 unchanged",
  JSON.stringify(h.rooms["room-1"]) === roomOneBefore &&
    approx(h.rooms[addedId].width, 6) &&
    Object.keys(h.walls).length === 8,
);

const southWall = h.walls[roomWallId("room-1", "south")];
const doorId = model().addOpening({
  wallId: roomWallId("room-1", "south"),
  kind: "door",
  offset: 1,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
h = houseNow();
const door = doorId !== null ? h.openings[doorId] : undefined;
check(
  "addOpening stores a door on the wall",
  door !== undefined &&
    door.wallId === roomWallId("room-1", "south") &&
    door.kind === "door",
);
check(
  "opening splits wall into 3 boxes",
  door !== undefined && getWallBoxes(southWall, [door]).length === 3,
);
check(
  "opening fill box centered on opening",
  door !== undefined && approx(getOpeningFillBox(southWall, door).position[0], 1.45),
);

const rejected = model().addOpening({
  wallId: "nope",
  kind: "window",
  offset: 0,
  width: 1,
  height: 1,
  sillHeight: 1,
});
check(
  "addOpening rejects unknown wall",
  rejected === null && Object.keys(houseNow().openings).length === 1,
);
const nonFinite = model().addOpening({
  wallId: roomWallId("room-1", "south"),
  kind: "window",
  offset: Number.NaN,
  width: 1,
  height: 1,
  sillHeight: 1,
});
check(
  "addOpening rejects non-finite input",
  nonFinite === null && Object.keys(houseNow().openings).length === 1,
);

const windowId = model().addOpening({
  wallId: roomWallId("room-1", "west"),
  kind: "window",
  offset: -5,
  width: 99,
  height: 1,
  sillHeight: 0,
});
h = houseNow();
const win = windowId !== null ? h.openings[windowId] : undefined;
const westWall = h.walls[roomWallId("room-1", "west")];
check(
  "opening values clamp to wall bounds",
  win !== undefined &&
    win.offset >= 0 &&
    win.offset + win.width <= 5 &&
    win.sillHeight >= 0 &&
    win.sillHeight + win.height <= westWall.height,
);
check(
  "doors and windows coexist in one collection",
  Object.values(h.openings).filter((o) => o.kind === "door").length === 1 &&
    Object.values(h.openings).filter((o) => o.kind === "window").length === 1,
);

model().addPlacedObject({
  id: "obj-1",
  assetId: "sofa",
  position: { x: 1, z: 1 },
  rotationY: 0,
  scale: 1.5,
});
check(
  "addPlacedObject stores scale",
  houseNow().objects["obj-1"] !== undefined &&
    houseNow().objects["obj-1"].scale === 1.5,
);
model().updatePlacedObject("obj-1", { scale: 2, rotationY: Math.PI });
check(
  "updatePlacedObject patches scale",
  houseNow().objects["obj-1"].scale === 2 &&
    houseNow().objects["obj-1"].rotationY === Math.PI,
);
model().removePlacedObject("obj-1");
check(
  "removePlacedObject deletes object",
  houseNow().objects["obj-1"] === undefined,
);

const doorOnRemoved = model().addOpening({
  wallId: roomWallId(addedId, "south"),
  kind: "door",
  offset: 0.5,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
check("door added to second room", doorOnRemoved !== null);

model().removeRoom(addedId);
h = houseNow();
check(
  "removeRoom deletes the room",
  Object.keys(h.rooms).length === 1 && h.rooms[addedId] === undefined,
);
check(
  "removeRoom deletes its walls only",
  Object.keys(h.walls).length === 4 &&
    roomWallIds("room-1").every((id) => h.walls[id] !== undefined),
);
check(
  "removeRoom deletes openings on its walls",
  doorOnRemoved !== null && h.openings[doorOnRemoved] === undefined,
);
check(
  "removeRoom keeps other rooms' openings",
  doorId !== null &&
    h.openings[doorId] !== undefined &&
    windowId !== null &&
    h.openings[windowId] !== undefined,
);
check(
  "house stays consistent after cleanup",
  roomWallIds("room-1").every((id) => h.walls[id] !== undefined) &&
    noNaN(Object.values(h.walls)),
);

const noDuplicateOverlaps = (target: House): boolean => {
  const walls = Object.values(target.walls);
  for (let i = 0; i < walls.length; i += 1) {
    for (let j = i + 1; j < walls.length; j += 1) {
      const a = wallSpan(walls[i]);
      const b = wallSpan(walls[j]);
      if (!a || !b) continue;
      if (a.run !== b.run || Math.abs(a.coord - b.coord) > 1e-6) continue;
      if (Math.min(a.to, b.to) - Math.max(a.from, b.from) > 1e-6) return false;
    }
  }
  return true;
};

const coverageOk = (target: House, roomId: string): boolean => {
  const r = target.rooms[roomId];
  if (!r) return false;
  for (const edge of ROOM_EDGES) {
    const wall = target.walls[r.edges[edge]];
    if (!wall) return false;
    const wallLine = wallSpan(wall);
    const edgeLine = edgeSpan(r, edge);
    if (
      !wallLine ||
      wallLine.run !== edgeLine.run ||
      Math.abs(wallLine.coord - edgeLine.coord) > 1e-6
    ) {
      return false;
    }
    if (wallLine.from - 1e-6 > edgeLine.from || wallLine.to + 1e-6 < edgeLine.to) {
      return false;
    }
  }
  return true;
};

useHouseStore.getState().replaceHouse(freshHouse);
const shared = model().addRoom({ width: 4, depth: 4 });
h = houseNow();
const sharedId = roomWallId("room-1", "east");

check(
  "flush addRoom places rooms side by side",
  approx(h.rooms[shared].position.x, 3) &&
    approx(h.rooms[shared].position.z, -2),
);
check("flush rooms share one wall (7 total)", Object.keys(h.walls).length === 7);
check(
  "shared wall id assigned to both rooms",
  h.rooms["room-1"].edges.east === sharedId &&
    h.rooms[shared].edges.west === sharedId &&
    h.walls[sharedId] !== undefined,
);
check("shared wall has two users", wallUsers(h, sharedId).length === 2);
check(
  "no duplicate overlapping walls after flush add",
  noDuplicateOverlaps(h),
);

model().moveRoomEdge(shared, "west", 4);
h = houseNow();
check(
  "dragging shared wall resizes both rooms",
  approx(h.rooms["room-1"].width, 7) && approx(h.rooms[shared].width, 3),
);
check("shared wall drag keeps 7 walls", Object.keys(h.walls).length === 7);
check(
  "shared wall id stable through drag",
  h.rooms["room-1"].edges.east === sharedId &&
    h.rooms[shared].edges.west === sharedId,
);
check("shared wall still has two users", wallUsers(h, sharedId).length === 2);
check(
  "both rooms rectangle-consistent after shared drag",
  coverageOk(h, "room-1") && coverageOk(h, shared),
);
check(
  "no duplicate overlapping walls after shared drag",
  noDuplicateOverlaps(h),
);

const sharedDoor = model().addOpening({
  wallId: sharedId,
  kind: "door",
  offset: 0.5,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
check("door added to shared wall", sharedDoor !== null);

model().removeRoom(shared);
h = houseNow();
check(
  "removing neighbor keeps shared wall for remaining room",
  Object.keys(h.walls).length === 4 &&
    h.rooms["room-1"].edges.east === sharedId &&
    h.walls[sharedId] !== undefined,
);
check(
  "door on shared wall survives neighbor removal",
  sharedDoor !== null &&
    h.openings[sharedDoor] !== undefined &&
    h.openings[sharedDoor].wallId === sharedId,
);
check(
  "no duplicate overlapping walls after removal",
  noDuplicateOverlaps(h),
);

useHouseStore.getState().replaceHouse(freshHouse);
const moved = model().addRoom({ width: 4, depth: 4 });
model().setRoomPosition(moved, 20, 20);
h = houseNow();
check(
  "setRoomPosition detaches a room into open space",
  Object.keys(h.walls).length === 8 &&
    approx(h.rooms[moved].position.x, 20) &&
    approx(h.rooms[moved].position.z, 20),
);
check(
  "detach gives the moved room its own walls",
  h.rooms[moved].edges.west === roomWallId(moved, "west") &&
    h.walls[roomWallId(moved, "west")] !== undefined,
);
check(
  "detach keeps the stationary room's wall id",
  h.rooms["room-1"].edges.east === roomWallId("room-1", "east"),
);
check(
  "both rooms rectangle-consistent after detach",
  coverageOk(h, "room-1") && coverageOk(h, moved),
);
check("no duplicate overlapping walls after detach", noDuplicateOverlaps(h));
check(
  "reconcile is idempotent",
  JSON.stringify(reconcile(h)) === JSON.stringify(h),
);

useHouseStore.getState().replaceHouse(freshHouse);
const split = model().addRoom({ width: 4, depth: 4 });
model().moveRoomEdge(split, "west", -50);
h = houseNow();
check(
  "extreme shared drag detaches cleanly",
  Object.keys(h.walls).length === 8 &&
    approx(h.rooms["room-1"].width, 1) &&
    noDuplicateOverlaps(h),
);
check(
  "extreme drag keeps both rooms rectangle-consistent",
  coverageOk(h, "room-1") && coverageOk(h, split),
);

// ---------------------------------------------------------------------------
// Opening authoring: creation, editing, serialisation, geometry invariants
// ---------------------------------------------------------------------------

const boxRect = (b: BoxSpec): OpeningRect => ({
  x0: b.position[0] - b.size[0] / 2,
  x1: b.position[0] + b.size[0] / 2,
  y0: b.position[1] - b.size[1] / 2,
  y1: b.position[1] + b.size[1] / 2,
});

const rectContains = (r: OpeningRect, x: number, y: number) =>
  x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

const rectsDisjoint = (rects: OpeningRect[]): boolean => {
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (rectsOverlap(rects[i], rects[j])) return false;
    }
  }
  return true;
};

useHouseStore.getState().replaceHouse(freshHouse);
h = houseNow();
const authorWallId = roomWallId("room-1", "south");

const autoDoorId = model().createOpening(authorWallId, "door");
h = houseNow();
const autoDoorRec = autoDoorId !== null ? h.openings[autoDoorId] : undefined;
check(
  "createOpening adds an auto-placed door",
  autoDoorRec !== undefined &&
    autoDoorRec.kind === "door" &&
    autoDoorRec.sillHeight === 0 &&
    autoDoorRec.width > 0,
);
check(
  "auto-placed door is centred on an empty wall",
  autoDoorRec !== undefined &&
    approx(autoDoorRec.offset + autoDoorRec.width / 2, 3),
);
const autoDoorId2 = model().createOpening(authorWallId, "door");
h = houseNow();
const autoDoorRec2 = autoDoorId2 !== null ? h.openings[autoDoorId2] : undefined;
check(
  "second auto-placed door clears the first",
  autoDoorRec2 !== undefined &&
    autoDoorRec !== undefined &&
    !openingsConflict(autoDoorRec2, [autoDoorRec]),
);
check(
  "createOpening rejects an unknown wall",
  model().createOpening("nope", "window") === null,
);
check(
  "findOpeningOffset gives up when the wall is full",
  findOpeningOffset(h.walls[authorWallId], DEFAULT_DOOR_SIZE, [
    {
      id: "blocker",
      wallId: authorWallId,
      kind: "door",
      offset: 0,
      width: 6,
      height: 2.1,
      sillHeight: 0,
    },
  ]) === null,
);

useHouseStore.getState().replaceHouse(freshHouse);
h = houseNow();
const overlapWallId = roomWallId("room-1", "south");
const overlapDoorId = model().addOpening({
  wallId: overlapWallId,
  kind: "door",
  offset: 2,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
const overlapping = model().addOpening({
  wallId: overlapWallId,
  kind: "door",
  offset: 2.5,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
check(
  "addOpening rejects an overlapping opening",
  overlapDoorId !== null &&
    overlapping === null &&
    Object.keys(houseNow().openings).length === 1,
);

const stackedId = model().addOpening({
  wallId: overlapWallId,
  kind: "window",
  offset: 2.5,
  width: 0.8,
  height: 0.6,
  sillHeight: 2.15,
});
h = houseNow();
const stackedRec = stackedId !== null ? h.openings[stackedId] : undefined;
const overlapDoorRec = h.openings[overlapDoorId as string];
check(
  "window stacked above a door is accepted",
  stackedRec !== undefined &&
    overlapDoorRec !== undefined &&
    !openingsConflict(stackedRec, [overlapDoorRec]),
);
check(
  "stacked window stays within the wall",
  stackedRec !== undefined &&
    stackedRec.sillHeight + stackedRec.height <=
      h.walls[overlapWallId].height + 1e-9,
);

const forcedSillId = model().addOpening({
  wallId: overlapWallId,
  kind: "door",
  offset: 4.8,
  width: 0.9,
  height: 2.1,
  sillHeight: 1.5,
});
h = houseNow();
check(
  "doors are forced down to floor level",
  forcedSillId !== null && h.openings[forcedSillId].sillHeight === 0,
);

useHouseStore.getState().replaceHouse(freshHouse);
h = houseNow();
const editWallId = roomWallId("room-1", "south");
const editDoorA = model().addOpening({
  wallId: editWallId,
  kind: "door",
  offset: 1,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
const editDoorB = model().addOpening({
  wallId: editWallId,
  kind: "door",
  offset: 3,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
check(
  "two doors added for edit checks",
  editDoorA !== null && editDoorB !== null,
);

if (editDoorA !== null) {
  model().updateOpening(editDoorA, { offset: 4.6 });
  h = houseNow();
  check(
    "updateOpening moves an opening",
    approx(h.openings[editDoorA].offset, 4.6),
  );

  model().updateOpening(editDoorA, { offset: 2.5 });
  h = houseNow();
  check(
    "updateOpening refuses a move into a neighbour",
    approx(h.openings[editDoorA].offset, 4.6),
  );

  model().updateOpening(editDoorA, { offset: Number.NaN });
  h = houseNow();
  check(
    "updateOpening ignores non-finite patches",
    approx(h.openings[editDoorA].offset, 4.6),
  );

  model().updateOpening(editDoorA, { sillHeight: 1.2 });
  h = houseNow();
  check(
    "updateOpening keeps doors on the floor",
    h.openings[editDoorA].sillHeight === 0,
  );

  model().updateOpening(editDoorA, { height: 99 });
  h = houseNow();
  check(
    "updateOpening clamps height to the wall",
    h.openings[editDoorA].height <= h.walls[editWallId].height,
  );

  model().updateOpening("missing-opening", { offset: 0 });
  check(
    "updateOpening on an unknown id is a no-op",
    houseNow().openings[editDoorA] !== undefined,
  );
}

useHouseStore.getState().replaceHouse(freshHouse);
h = houseNow();
const resizeWallId = roomWallId("room-1", "south");
const resizeDoor = model().addOpening({
  wallId: resizeWallId,
  kind: "door",
  offset: 1,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
if (resizeDoor !== null) {
  model().updateOpening(resizeDoor, { width: 99 });
  h = houseNow();
  check(
    "updateOpening clamps an oversized width",
    h.openings[resizeDoor].width <= 6 + 1e-9 &&
      approx(h.openings[resizeDoor].offset, 0),
  );
}
const resizeWinWallId = roomWallId("room-1", "west");
const resizeWin = model().addOpening({
  wallId: resizeWinWallId,
  kind: "window",
  offset: 2,
  width: 1.2,
  height: 1.2,
  sillHeight: 0.9,
});
h = houseNow();
if (resizeWin !== null) {
  model().updateOpening(resizeWin, { sillHeight: 1.4 });
  h = houseNow();
  check(
    "updateOpening moves a window sill",
    approx(h.openings[resizeWin].sillHeight, 1.4),
  );
  model().updateOpening(resizeWin, { sillHeight: 99 });
  h = houseNow();
  check(
    "updateOpening clamps an oversized sill",
    h.openings[resizeWin].sillHeight + h.openings[resizeWin].height <=
      h.walls[resizeWinWallId].height + 1e-9,
  );
}

useHouseStore.getState().replaceHouse(freshHouse);
h = houseNow();
model().addOpening({
  wallId: roomWallId("room-1", "south"),
  kind: "door",
  offset: 1,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
model().addOpening({
  wallId: roomWallId("room-1", "west"),
  kind: "window",
  offset: 1,
  width: 1.2,
  height: 1.2,
  sillHeight: 0.9,
});
h = houseNow();
const jsonBefore = JSON.stringify(h);
const roundTripped = JSON.parse(jsonBefore) as House;
check("house JSON round-trips exactly", JSON.stringify(roundTripped) === jsonBefore);
check("every opening survives serialisation", Object.keys(roundTripped.openings).length === 2);
const serialisedOpening = Object.values(h.openings)[0];
check(
  "opening records contain only plain serialisable fields",
  serialisedOpening !== undefined &&
    Object.keys(serialisedOpening).sort().join(",") ===
      "height,id,kind,offset,sillHeight,wallId,width" &&
    Object.values(serialisedOpening).every(
      (value) => typeof value === "string" || typeof value === "number",
    ),
);

const serialDoor = Object.values(h.openings).find((o) => o.kind === "door");
const serialDoorWall = h.walls[roomWallId("room-1", "south")];
if (serialDoor !== undefined) {
  const frameBoxes = getOpeningFrameBoxes(serialDoorWall, serialDoor);
  check(
    "frame boxes are positive and finite",
    frameBoxes.length > 0 &&
      frameBoxes.every((b) => b.size.every((v) => Number.isFinite(v) && v > 0)),
  );
  check(
    "frame boxes never overlap each other",
    rectsDisjoint(frameBoxes.map(boxRect)),
  );
}

const synthWall: Wall = {
  id: "synth",
  start: { x: 0, z: 0 },
  end: { x: 6, z: 0 },
  height: 2.7,
  thickness: 0.2,
};
const synthOpenings: Opening[] = [
  { id: "o1", wallId: "synth", kind: "door", offset: 1, width: 2, height: 2.1, sillHeight: 0 },
  { id: "o2", wallId: "synth", kind: "door", offset: 2.5, width: 2, height: 1, sillHeight: 0.5 },
  { id: "o3", wallId: "synth", kind: "window", offset: 1.5, width: 3, height: 0.5, sillHeight: 2.1 },
  { id: "o4", wallId: "synth", kind: "window", offset: -1, width: 1.5, height: 1, sillHeight: 0 },
];
const synthBoxes = getWallBoxes(synthWall, synthOpenings);
const synthHoles = getWallHoleRects(synthWall, synthOpenings);

check(
  "hand-crafted overlapping openings still carve a wall",
  synthBoxes.length >= 1 && synthHoles.length >= 3,
);
check(
  "holes are clipped into the wall bounds",
  synthHoles.every(
    (hole) =>
      hole.x0 >= -1e-9 &&
      hole.x1 <= 6 + 1e-9 &&
      hole.y0 >= -1e-9 &&
      hole.y1 <= 2.7 + 1e-9,
  ),
);
check(
  "wall boxes stay disjoint for any input",
  rectsDisjoint(synthBoxes.map(boxRect)),
);

let partitionOk = true;
for (let i = 0; partitionOk && i < 90; i += 1) {
  const x = 0.03 + i * 0.07;
  if (x >= 6) break;
  for (let j = 0; j < 55; j += 1) {
    const y = 0.017 + j * 0.053;
    if (y >= 2.7) break;
    const solidHits = synthBoxes.filter((b) => rectContains(boxRect(b), x, y)).length;
    const holeHits = synthHoles.filter((hole) => rectContains(hole, x, y)).length;
    const ok =
      solidHits === 1 ? holeHits === 0 : solidHits === 0 && holeHits >= 1;
    if (!ok) {
      partitionOk = false;
      break;
    }
  }
}
check(
  "solid/hole partition covers the wall exactly (overlapping input)",
  partitionOk,
);

const dragWall: Wall = {
  id: "drag",
  start: { x: 0, z: 0 },
  end: { x: 6, z: 0 },
  height: 2.7,
  thickness: 0.2,
};
const draggedDoor: Opening = {
  id: "d",
  wallId: "drag",
  kind: "door",
  offset: 2,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
};
const dragNeighbour: Opening = {
  id: "n",
  wallId: "drag",
  kind: "door",
  offset: 1,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
};
const stackedHigh: Opening = {
  id: "w",
  wallId: "drag",
  kind: "window",
  offset: 0,
  width: 1,
  height: 0.5,
  sillHeight: 2.1,
};

check(
  "drag offset follows the pointer with grid snap",
  approx(resolveOpeningOffset(dragWall, draggedDoor, { x: 3.04, z: 0 }, 0.1, []), 2.6),
);
check(
  "drag stops at the far end of the wall",
  approx(resolveOpeningOffset(dragWall, draggedDoor, { x: 10, z: 0 }, 0, []), 5.1),
);
check(
  "drag stops flush against a neighbour",
  approx(
    resolveOpeningOffset(dragWall, draggedDoor, { x: 1.5, z: 0 }, 0, [dragNeighbour]),
    1.9,
  ),
);
check(
  "a window stacked above does not block the drag",
  approx(
    resolveOpeningOffset(dragWall, draggedDoor, { x: 1.5, z: 0 }, 0, [stackedHigh]),
    1.05,
  ),
);
check(
  "non-finite drag point keeps the current offset",
  resolveOpeningOffset(
    dragWall,
    draggedDoor,
    { x: Number.NaN, z: 0 },
    0.1,
    [],
  ) === 2,
);

useHouseStore.getState().replaceHouse(freshHouse);
h = houseNow();
const shrinkWallId = roomWallId("room-1", "south");
const shrinkDoorId = model().addOpening({
  wallId: shrinkWallId,
  kind: "door",
  offset: 2,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
});
model().setRoomDimensions("room-1", { height: 1.8 });
h = houseNow();
const shrinkDoorRec = shrinkDoorId !== null ? h.openings[shrinkDoorId] : undefined;
check(
  "door survives a wall-height shrink",
  shrinkDoorRec !== undefined,
);
check(
  "shrinking the wall re-clamps the door it carries",
  shrinkDoorRec !== undefined &&
    shrinkDoorRec.height <= 1.8 + 1e-9 &&
    shrinkDoorRec.sillHeight === 0,
);

console.log(failures === 0 ? "\nAll geometry checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
