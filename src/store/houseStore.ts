import { create } from "zustand";
import type {
  House,
  ObjectId,
  Opening,
  OpeningId,
  OpeningKind,
  PlacedObject,
  Room,
  RoomEdge,
  RoomId,
  WallId,
} from "../types/house";
import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
} from "../types/house";
import {
  createRoom,
  generateRoomWalls,
  type RoomSpec,
} from "../geometry/roomGeometry";
import { getWallPlacement } from "../geometry/wallGeometry";

const MIN_ROOM_SIZE = 1;
const MAX_ROOM_SIZE = 60;
const MIN_WALL_HEIGHT = 1.5;
const MAX_WALL_HEIGHT = 6;
const MIN_WALL_THICKNESS = 0.05;
const MAX_WALL_THICKNESS = 0.5;
const MIN_OPENING_WIDTH = 0.3;
const MIN_OPENING_HEIGHT = 0.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampOr(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  return value !== undefined && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;
}

function withUpdatedRoom(house: House, updated: Room): House {
  const walls = generateRoomWalls(updated);
  const nextWalls = { ...house.walls };
  for (const wall of walls) {
    nextWalls[wall.id] = wall;
  }
  return {
    ...house,
    rooms: { ...house.rooms, [updated.id]: updated },
    walls: nextWalls,
  };
}

function nextRoomId(house: House): RoomId {
  let index = 1;
  while (house.rooms[`room-${index}`]) index += 1;
  return `room-${index}`;
}

function nextOpeningId(house: House, kind: OpeningKind): OpeningId {
  let index = 1;
  while (house.openings[`${kind}-${index}`]) index += 1;
  return `${kind}-${index}`;
}

const firstRoom = createRoom({
  id: "room-1",
  name: "Room 1",
  position: { x: -3, z: -2.5 },
  width: 6,
  depth: 5,
});

const sampleHouse: House = {
  version: 1,
  rooms: { [firstRoom.room.id]: firstRoom.room },
  walls: Object.fromEntries(firstRoom.walls.map((wall) => [wall.id, wall])),
  openings: {},
  objects: {},
};

export interface RoomDimensionsPatch {
  width?: number;
  depth?: number;
  height?: number;
  wallThickness?: number;
}

export interface OpeningSpec {
  id?: OpeningId;
  wallId: WallId;
  kind: OpeningKind;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

export interface HouseState {
  house: House;
  replaceHouse: (house: House) => void;
  setRoomDimensions: (roomId: RoomId, patch: RoomDimensionsPatch) => void;
  moveRoomEdge: (roomId: RoomId, edge: RoomEdge, worldPosition: number) => void;
  addRoom: (spec?: Partial<RoomSpec>) => RoomId;
  removeRoom: (roomId: RoomId) => void;
  addOpening: (spec: OpeningSpec) => OpeningId | null;
  removeOpening: (openingId: OpeningId) => void;
  addPlacedObject: (object: PlacedObject) => void;
  updatePlacedObject: (
    id: ObjectId,
    patch: Partial<Omit<PlacedObject, "id">>,
  ) => void;
  removePlacedObject: (id: ObjectId) => void;
}

export const useHouseStore = create<HouseState>((set, get) => ({
  house: sampleHouse,

  replaceHouse: (house) => set({ house }),

  setRoomDimensions: (roomId, patch) =>
    set((state) => {
      const room = state.house.rooms[roomId];
      if (!room) return state;

      const width =
        patch.width !== undefined && Number.isFinite(patch.width)
          ? clamp(patch.width, MIN_ROOM_SIZE, MAX_ROOM_SIZE)
          : room.width;
      const depth =
        patch.depth !== undefined && Number.isFinite(patch.depth)
          ? clamp(patch.depth, MIN_ROOM_SIZE, MAX_ROOM_SIZE)
          : room.depth;
      const height =
        patch.height !== undefined && Number.isFinite(patch.height)
          ? clamp(patch.height, MIN_WALL_HEIGHT, MAX_WALL_HEIGHT)
          : room.height;
      const wallThickness =
        patch.wallThickness !== undefined && Number.isFinite(patch.wallThickness)
          ? clamp(patch.wallThickness, MIN_WALL_THICKNESS, MAX_WALL_THICKNESS)
          : room.wallThickness;

      const centerX = room.position.x + room.width / 2;
      const centerZ = room.position.z + room.depth / 2;

      const updated: Room = {
        ...room,
        width,
        depth,
        height,
        wallThickness,
        position: { x: centerX - width / 2, z: centerZ - depth / 2 },
      };

      return { house: withUpdatedRoom(state.house, updated) };
    }),

  moveRoomEdge: (roomId, edge, worldPosition) =>
    set((state) => {
      const room = state.house.rooms[roomId];
      if (!room || !Number.isFinite(worldPosition)) return state;

      const x0 = room.position.x;
      const z0 = room.position.z;
      const x1 = x0 + room.width;
      const z1 = z0 + room.depth;

      let width = room.width;
      let depth = room.depth;
      let positionX = x0;
      let positionZ = z0;

      if (edge === "east") {
        width = clamp(worldPosition - x0, MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      } else if (edge === "west") {
        width = clamp(x1 - worldPosition, MIN_ROOM_SIZE, MAX_ROOM_SIZE);
        positionX = x1 - width;
      } else if (edge === "north") {
        depth = clamp(worldPosition - z0, MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      } else {
        depth = clamp(z1 - worldPosition, MIN_ROOM_SIZE, MAX_ROOM_SIZE);
        positionZ = z1 - depth;
      }

      const updated: Room = {
        ...room,
        width,
        depth,
        position: { x: positionX, z: positionZ },
      };

      return { house: withUpdatedRoom(state.house, updated) };
    }),

  addRoom: (spec = {}) => {
    const house = get().house;
    const requestedId = spec.id;
    const id =
      requestedId !== undefined && !house.rooms[requestedId]
        ? requestedId
        : nextRoomId(house);
    const position =
      spec.position !== undefined &&
      Number.isFinite(spec.position.x) &&
      Number.isFinite(spec.position.z)
        ? spec.position
        : { x: 4, z: -2.5 };

    const { room, walls } = createRoom({
      id,
      name: spec.name ?? `Room ${Object.keys(house.rooms).length + 1}`,
      position,
      width: clampOr(spec.width, 4, MIN_ROOM_SIZE, MAX_ROOM_SIZE),
      depth: clampOr(spec.depth, 4, MIN_ROOM_SIZE, MAX_ROOM_SIZE),
      height: clampOr(spec.height, DEFAULT_WALL_HEIGHT, MIN_WALL_HEIGHT, MAX_WALL_HEIGHT),
      wallThickness: clampOr(
        spec.wallThickness,
        DEFAULT_WALL_THICKNESS,
        MIN_WALL_THICKNESS,
        MAX_WALL_THICKNESS,
      ),
    });

    set((state) => ({
      house: {
        ...state.house,
        rooms: { ...state.house.rooms, [room.id]: room },
        walls: {
          ...state.house.walls,
          ...Object.fromEntries(walls.map((wall) => [wall.id, wall])),
        },
      },
    }));

    return room.id;
  },

  removeRoom: (roomId) =>
    set((state) => {
      if (!state.house.rooms[roomId]) return state;

      const rooms = { ...state.house.rooms };
      delete rooms[roomId];

      const removedWallIds = new Set<WallId>();
      const walls = Object.fromEntries(
        Object.entries(state.house.walls).filter(([, wall]) => {
          if (wall.roomId !== roomId) return true;
          removedWallIds.add(wall.id);
          return false;
        }),
      );

      const openings = Object.fromEntries(
        Object.entries(state.house.openings).filter(
          ([, opening]) => !removedWallIds.has(opening.wallId),
        ),
      );

      return { house: { ...state.house, rooms, walls, openings } };
    }),

  addOpening: (spec) => {
    const house = get().house;
    const wall = house.walls[spec.wallId];
    if (!wall) return null;
    if (
      ![spec.offset, spec.width, spec.height, spec.sillHeight].every(
        Number.isFinite,
      )
    ) {
      return null;
    }

    const { length } = getWallPlacement(wall);
    if (length <= 1e-4) return null;

    const width = clamp(spec.width, Math.min(MIN_OPENING_WIDTH, length), length);
    const offset = clamp(spec.offset, 0, length - width);
    const sillHeight = clamp(
      spec.sillHeight,
      0,
      Math.max(0, wall.height - MIN_OPENING_HEIGHT),
    );
    const height = clamp(
      spec.height,
      Math.min(MIN_OPENING_HEIGHT, wall.height - sillHeight),
      wall.height - sillHeight,
    );

    const id =
      spec.id !== undefined && !house.openings[spec.id]
        ? spec.id
        : nextOpeningId(house, spec.kind);

    const opening: Opening = {
      id,
      wallId: spec.wallId,
      kind: spec.kind,
      offset,
      width,
      height,
      sillHeight,
    };

    set((state) => ({
      house: {
        ...state.house,
        openings: { ...state.house.openings, [opening.id]: opening },
      },
    }));

    return opening.id;
  },

  removeOpening: (openingId) =>
    set((state) => {
      if (!state.house.openings[openingId]) return state;
      const openings = { ...state.house.openings };
      delete openings[openingId];
      return { house: { ...state.house, openings } };
    }),

  addPlacedObject: (object) =>
    set((state) => ({
      house: {
        ...state.house,
        objects: { ...state.house.objects, [object.id]: object },
      },
    })),

  updatePlacedObject: (id, patch) =>
    set((state) => {
      const existing = state.house.objects[id];
      if (!existing) return state;
      return {
        house: {
          ...state.house,
          objects: {
            ...state.house.objects,
            [id]: { ...existing, ...patch },
          },
        },
      };
    }),

  removePlacedObject: (id) =>
    set((state) => {
      const objects = { ...state.house.objects };
      delete objects[id];
      return { house: { ...state.house, objects } };
    }),
}));
