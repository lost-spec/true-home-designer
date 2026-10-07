import {
  createRoom,
  generateRoomWalls,
  roomWallId,
} from "../src/geometry/roomGeometry";
import { getFloorBox } from "../src/geometry/floorGeometry";
import { getCeilingBox } from "../src/geometry/ceilingGeometry";
import { getWallBoxes, getWallPlacement } from "../src/geometry/wallGeometry";
import { useHouseStore } from "../src/store/houseStore";
import { CEILING_THICKNESS, FLOOR_THICKNESS } from "../src/types/house";

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

console.log(failures === 0 ? "\nAll geometry checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
