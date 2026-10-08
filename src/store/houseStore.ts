import { create } from "zustand";
import type {
  House,
  ObjectId,
  Opening,
  OpeningId,
  OpeningKind,
  PlacedObject,
  RoomEdge,
  RoomId,
  WallId,
} from "../types/house";
import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
} from "../types/house";
import {
  MIN_ROOM_SIZE,
  MAX_ROOM_SIZE,
  createRoom,
  moveRoomEdgeRect,
  reconcile,
  wallUsers,
  type RoomSpec,
} from "../geometry/roomGeometry";
import {
  defaultOpeningSize,
  findOpeningOffset,
  normalizeOpening,
  openingsConflict,
} from "../geometry/openingGeometry";
import { normalizeAngle } from "../interaction/objectInteraction";
import {
  recordHouseChange,
  suppressHistory,
  takeRedo,
  takeUndo,
} from "./history";
import { useEditorStore } from "./editorStore";

const MIN_WALL_HEIGHT = 1.5;
const MAX_WALL_HEIGHT = 6;
const MIN_WALL_THICKNESS = 0.05;
const MAX_WALL_THICKNESS = 0.5;

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

export function nextObjectId(house: House): ObjectId {
  let index = 1;
  while (house.objects[`obj-${index}`]) index += 1;
  return `obj-${index}`;
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
  objects: {
    "obj-test-crate": {
      id: "obj-test-crate",
      assetId: "test_crate",
      position: { x: 2, y: 0, z: 1.5 },
      rotationY: 0,
      scale: 1,
    },
  },
};

/** A fresh copy of the starting design, used by "New Design". */
export function createSampleHouse(): House {
  return JSON.parse(JSON.stringify(sampleHouse)) as House;
}

export interface RoomDimensionsPatch {
  width?: number;
  depth?: number;
  height?: number;
  wallThickness?: number;
}

export interface AddRoomSpec extends Partial<RoomSpec> {
  relativeTo?: RoomId;
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

export interface OpeningPatch {
  offset?: number;
  width?: number;
  height?: number;
  sillHeight?: number;
}

/**
 * Validate and normalise a requested opening against its wall: values are
 * clamped to what the wall can hold (doors sit on the floor) and the result is
 * rejected when it would collide with an opening already on that wall.
 */
function buildOpening(house: House, spec: OpeningSpec): Opening | null {
  const wall = house.walls[spec.wallId];
  if (!wall) return null;

  const fields = normalizeOpening(wall, spec.kind, spec);
  if (!fields) return null;

  if (openingsConflict(fields, openingsOnWall(house, spec.wallId))) {
    return null;
  }

  const id =
    spec.id !== undefined && !house.openings[spec.id]
      ? spec.id
      : nextOpeningId(house, spec.kind);

  return {
    id,
    wallId: spec.wallId,
    kind: spec.kind,
    offset: fields.offset,
    width: fields.width,
    height: fields.height,
    sillHeight: fields.sillHeight,
  };
}

function openingsOnWall(house: House, wallId: WallId): Opening[] {
  return Object.values(house.openings).filter(
    (opening) => opening.wallId === wallId,
  );
}

export interface HouseState {
  house: House;
  replaceHouse: (house: House) => void;
  setRoomDimensions: (roomId: RoomId, patch: RoomDimensionsPatch) => void;
  setRoomPosition: (roomId: RoomId, x: number, z: number) => void;
  moveRoomEdge: (roomId: RoomId, edge: RoomEdge, worldPosition: number) => void;
  addRoom: (spec?: AddRoomSpec) => RoomId;
  removeRoom: (roomId: RoomId) => void;
  addOpening: (spec: OpeningSpec) => OpeningId | null;
  createOpening: (wallId: WallId, kind: OpeningKind) => OpeningId | null;
  updateOpening: (openingId: OpeningId, patch: OpeningPatch) => void;
  removeOpening: (openingId: OpeningId) => void;
  addPlacedObject: (object: PlacedObject) => void;
  updatePlacedObject: (
    id: ObjectId,
    patch: Partial<Omit<PlacedObject, "id">>,
  ) => void;
  removePlacedObject: (id: ObjectId) => void;
  createPlacedObject: (
    assetId: string,
    position: { x: number; z: number },
    rotationY?: number,
  ) => ObjectId;
  undo: () => void;
  redo: () => void;
}

/**
 * After restoring a snapshot the current selection may reference an entity
 * that no longer exists; drop it so no panel or drag can act on a phantom id.
 */
function repairSelection(house: House): void {
  const editor = useEditorStore.getState();
  const selection = editor.selection;
  if (!selection) return;
  const exists =
    selection.kind === "room"
      ? house.rooms[selection.id] !== undefined
      : selection.kind === "wall"
        ? house.walls[selection.id] !== undefined
        : selection.kind === "opening"
          ? house.openings[selection.id] !== undefined
          : house.objects[selection.id] !== undefined;
  if (!exists) editor.select(null);
}

export const useHouseStore = create<HouseState>((rawSet, get) => {
  // Every action mutates through this set, so each house write is observed
  // exactly once and history recording stays in one place. Actions that
  // return the unchanged state are skipped by the reference check inside
  // recordHouseChange.
  const set = (
    partial:
      | HouseState
      | Partial<HouseState>
      | ((state: HouseState) => HouseState | Partial<HouseState>),
    replace?: false,
  ) => {
    const previous = get().house;
    rawSet(partial, replace);
    recordHouseChange(previous, get().house);
  };

  return {
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

      const updated = {
        ...room,
        width,
        depth,
        height,
        wallThickness,
        position: { x: centerX - width / 2, z: centerZ - depth / 2 },
      };

      return {
        house: reconcile({
          ...state.house,
          rooms: { ...state.house.rooms, [roomId]: updated },
        }),
      };
    }),

  setRoomPosition: (roomId, x, z) =>
    set((state) => {
      const room = state.house.rooms[roomId];
      if (!room || !Number.isFinite(x) || !Number.isFinite(z)) return state;
      if (room.position.x === x && room.position.z === z) return state;

      const updated = { ...room, position: { x, z } };
      return {
        house: reconcile({
          ...state.house,
          rooms: { ...state.house.rooms, [roomId]: updated },
        }),
      };
    }),

  moveRoomEdge: (roomId, edge, worldPosition) =>
    set((state) => {
      const room = state.house.rooms[roomId];
      if (!room || !Number.isFinite(worldPosition)) return state;

      const refId = room.edges[edge];
      const users = wallUsers(state.house, refId);
      const rooms = { ...state.house.rooms };

      for (const user of users) {
        const target = rooms[user.roomId];
        if (!target) continue;
        const moved = moveRoomEdgeRect(target, user.edge, worldPosition);
        if (moved) rooms[user.roomId] = moved;
      }

      if (!users.some((user) => user.roomId === roomId && user.edge === edge)) {
        const moved = moveRoomEdgeRect(room, edge, worldPosition);
        if (moved) rooms[roomId] = moved;
      }

      return {
        house: reconcile({ ...state.house, rooms }),
      };
    }),

  addRoom: (spec = {}) => {
    const house = get().house;
    const requestedId = spec.id;
    const id =
      requestedId !== undefined && !house.rooms[requestedId]
        ? requestedId
        : nextRoomId(house);
    const width = clampOr(spec.width, 4, MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    const depth = clampOr(spec.depth, 4, MIN_ROOM_SIZE, MAX_ROOM_SIZE);

    let position = { x: 0, z: 0 };
    if (
      spec.position !== undefined &&
      Number.isFinite(spec.position.x) &&
      Number.isFinite(spec.position.z)
    ) {
      position = spec.position;
    } else {
      const relative =
        spec.relativeTo !== undefined
          ? house.rooms[spec.relativeTo]
          : undefined;
      const anchor = relative ?? Object.values(house.rooms)[0];
      if (anchor) {
        position = {
          x: anchor.position.x + anchor.width,
          z: anchor.position.z + (anchor.depth - depth) / 2,
        };
      } else {
        position = { x: -width / 2, z: -depth / 2 };
      }
    }

    const { room } = createRoom({
      id,
      name: spec.name ?? `Room ${Object.keys(house.rooms).length + 1}`,
      position,
      width,
      depth,
      height: clampOr(spec.height, DEFAULT_WALL_HEIGHT, MIN_WALL_HEIGHT, MAX_WALL_HEIGHT),
      wallThickness: clampOr(
        spec.wallThickness,
        DEFAULT_WALL_THICKNESS,
        MIN_WALL_THICKNESS,
        MAX_WALL_THICKNESS,
      ),
    });

    set((state) => ({
      house: reconcile({
        ...state.house,
        rooms: { ...state.house.rooms, [room.id]: room },
      }),
    }));

    return room.id;
  },

  removeRoom: (roomId) =>
    set((state) => {
      if (!state.house.rooms[roomId]) return state;
      const rooms = { ...state.house.rooms };
      delete rooms[roomId];
      return { house: reconcile({ ...state.house, rooms }) };
    }),

  addOpening: (spec) => {
    const house = get().house;
    const opening = buildOpening(house, spec);
    if (!opening) return null;

    set((state) => ({
      house: {
        ...state.house,
        openings: { ...state.house.openings, [opening.id]: opening },
      },
    }));

    return opening.id;
  },

  createOpening: (wallId, kind) => {
    const house = get().house;
    const wall = house.walls[wallId];
    if (!wall) return null;

    const offset = findOpeningOffset(
      wall,
      defaultOpeningSize(kind),
      openingsOnWall(house, wallId),
    );
    if (offset === null) return null;

    const size = defaultOpeningSize(kind);
    const opening = buildOpening(house, {
      wallId,
      kind,
      offset,
      width: size.width,
      height: size.height,
      sillHeight: size.sillHeight,
    });
    if (!opening) return null;

    set((state) => ({
      house: {
        ...state.house,
        openings: { ...state.house.openings, [opening.id]: opening },
      },
    }));

    return opening.id;
  },

  updateOpening: (openingId, patch) =>
    set((state) => {
      const existing = state.house.openings[openingId];
      if (!existing) return state;
      const wall = state.house.walls[existing.wallId];
      if (!wall) return state;

      const merged = { ...existing, ...patch };
      const fields = normalizeOpening(wall, existing.kind, merged);
      if (!fields) return state;

      const unchanged =
        fields.offset === existing.offset &&
        fields.width === existing.width &&
        fields.height === existing.height &&
        fields.sillHeight === existing.sillHeight;
      if (unchanged) return state;

      const siblings = openingsOnWall(state.house, existing.wallId).filter(
        (opening) => opening.id !== openingId,
      );
      if (openingsConflict(fields, siblings)) return state;

      const updated: Opening = { ...existing, ...fields };
      return {
        house: {
          ...state.house,
          openings: { ...state.house.openings, [openingId]: updated },
        },
      };
    }),

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

  createPlacedObject: (assetId, position, rotationY = 0) => {
    const id = nextObjectId(get().house);
    const object: PlacedObject = {
      id,
      assetId,
      position: { x: position.x, y: 0, z: position.z },
      rotationY: normalizeAngle(rotationY),
      scale: 1,
    };
    set((state) => ({
      house: {
        ...state.house,
        objects: { ...state.house.objects, [object.id]: object },
      },
    }));
    return id;
  },

  undo: () => {
    const editor = useEditorStore.getState();
    if (
      editor.draggingWallId !== null ||
      editor.draggingObjectId !== null ||
      editor.draggingOpeningId !== null
    ) {
      return;
    }
    const previous = takeUndo(get().house);
    if (previous === null) return;
    suppressHistory(() => set({ house: previous }));
    repairSelection(previous);
  },

  redo: () => {
    const editor = useEditorStore.getState();
    if (
      editor.draggingWallId !== null ||
      editor.draggingObjectId !== null ||
      editor.draggingOpeningId !== null
    ) {
      return;
    }
    const next = takeRedo(get().house);
    if (next === null) return;
    suppressHistory(() => set({ house: next }));
    repairSelection(next);
  },
  };
});
