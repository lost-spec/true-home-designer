import {
  createRoom,
  generateRoomWalls,
  roomWallId,
  type RoomEdge,
} from "../src/geometry/roomGeometry";
import { getFloorBox } from "../src/geometry/floorGeometry";
import { getCeilingBox } from "../src/geometry/ceilingGeometry";
import { getWallBoxes, getWallPlacement } from "../src/geometry/wallGeometry";
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
  origin: { x: -3, z: -2.5 },
  width: 6,
  depth: 5,
});

check("createRoom produces 4 walls", room.walls.length === 4);
check(
  "room.wallIds references generated walls",
  room.room.wallIds.length === 4 &&
    room.room.wallIds.every((id) => room.walls.some((w) => w.id === id)),
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
    initial.wallIds.every((id) => store.house.walls[id] !== undefined) &&
    Object.keys(store.house.walls).length === 4,
);
check("sample house has no openings/objects", Object.keys(store.house.openings).length === 0 && Object.keys(store.house.objects).length === 0);

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
  approx(updated.origin.x + updated.width / 2, 0) &&
    approx(updated.origin.z + updated.depth / 2, 0),
);
check("resize keeps same wall ids", updated.wallIds.length === 4 && Object.keys(house.walls).length === 4);
check("walls still NaN-free after width change", noNaN(Object.values(house.walls)));

useHouseStore.getState().setRoomDimensions("room-1", {
  depth: 8,
  wallHeight: 3.5,
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
  origin: { x: -3, z: -2.5 },
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
  const x0 = r.origin.x;
  const z0 = r.origin.z;
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
  approx(r.width, 7.4) && approx(r.origin.x, -3),
);
check(
  "east drag preserves depth and south edge",
  approx(r.depth, 5) && approx(r.origin.z, -2.5),
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
    approx(floorAfterEast.position[0], r.origin.x + r.width / 2) &&
    approx(floorAfterEast.position[2], r.origin.z + r.depth / 2),
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
  approx(r.origin.x, -3.83) && approx(r.origin.x + r.width, 4.4),
);
check("west drag keeps rectangle integrity", rectOk(storeState().house));

storeState().moveRoomEdge("room-1", "north", 3.72);
r = getRoom();
check(
  "north drag extends depth, south edge fixed",
  approx(r.origin.z, -2.5) && approx(r.origin.z + r.depth, 3.72),
);
check("north drag keeps rectangle integrity", rectOk(storeState().house));

storeState().moveRoomEdge("room-1", "south", -3.43);
r = getRoom();
check(
  "south drag moves south edge, north edge fixed",
  approx(r.origin.z, -3.43) && approx(r.origin.z + r.depth, 3.72),
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
  approx(r.width, 60) && approx(r.origin.x, -3.83),
);
check("max clamp keeps rectangle integrity", rectOk(storeState().house));

storeState().moveRoomEdge("room-1", "east", -50);
r = getRoom();
check(
  "east drag clamps width to minimum",
  approx(r.width, 1) && approx(r.origin.x, -3.83),
);
check("min clamp keeps rectangle integrity", rectOk(storeState().house));
check(
  "walls NaN-free after drag sequence",
  noNaN(Object.values(storeState().house.walls)),
);

console.log(failures === 0 ? "\nAll geometry checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
