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
  RoomNotch,
  RoomSurfaces,
  Wall,
  WallBaseboard,
  WallId,
} from "../types/house";
import {
  DEFAULT_BASEBOARD_HEIGHT,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  MAX_BASEBOARD_HEIGHT,
  MIN_BASEBOARD_HEIGHT,
  SINGLE_ROOM_ID,
} from "../types/house";
import {
  MIN_ROOM_SIZE,
  MAX_ROOM_SIZE,
  buildPartitionWall,
  carryOverrides,
  createRoom,
  movePartitionWall,
  moveRoomEdgeRect,
  normalizeRoom,
  partitionWallId,
  partitionWalls,
  reconcile,
  wallUsers,
  type RoomSpec,
} from "../geometry/roomGeometry";
import {
  findRoomTemplate,
  roomFromTemplate,
  templateObjects,
} from "../assets/roomTemplates";
import {
  defaultOpeningSize,
  findOpeningOffset,
  normalizeOpening,
  openingsConflict,
} from "../geometry/openingGeometry";
import { normalizeAngle } from "../interaction/objectInteraction";
import {
  normalizeHex,
  withSlotColor,
  withSlotFinish,
} from "../assets/materialSlots";
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

function roomContainingPoint(house: House, x: number, z: number) {
  for (const room of Object.values(house.rooms)) {
    const x0 = room.position.x;
    const z0 = room.position.z;
    if (x >= x0 && x <= x0 + room.width && z >= z0 && z <= z0 + room.depth) {
      return room;
    }
  }
  return null;
}

const firstRoom = createRoom({
  id: "room-1",
  name: "Room 1",
  position: { x: -3.5, z: -3 },
  width: 7,
  depth: 6,
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
  setRoomNotch: (roomId: RoomId, notch: RoomNotch | null) => void;
  setRoomSurface: (
    roomId: RoomId,
    key: keyof RoomSurfaces,
    color: string,
  ) => void;
  setWallColor: (wallId: WallId, color: string | null) => void;
  setWallBaseboard: (wallId: WallId, baseboard: WallBaseboard | null) => void;
  addPartition: (roomId: RoomId, run: "x" | "z") => WallId | null;
  movePartition: (wallId: WallId, coord: number) => void;
  removePartition: (wallId: WallId) => void;
  applyRoomTemplate: (templateId: string) => void;
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
  duplicatePlacedObject: (id: ObjectId) => ObjectId | null;
  mirrorPlacedObject: (id: ObjectId) => ObjectId | null;
  setMaterialOverride: (
    id: ObjectId,
    slotId: string,
    patch: { color?: string | null; finish?: string | null },
  ) => void;
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

  setWallColor: (wallId, color) =>
    set((state) => {
      const wall = state.house.walls[wallId];
      if (!wall) return state;
      const updated: Wall = { ...wall };
      if (color === null) {
        if (updated.color === undefined) return state;
        delete updated.color;
      } else {
        const hex = normalizeHex(color);
        if (!hex || updated.color === hex) return state;
        updated.color = hex;
      }
      return {
        house: {
          ...state.house,
          walls: { ...state.house.walls, [wallId]: updated },
        },
      };
    }),

  setWallBaseboard: (wallId, baseboard) =>
    set((state) => {
      const wall = state.house.walls[wallId];
      if (!wall) return state;
      const updated: Wall = { ...wall };
      if (baseboard === null) {
        if (updated.baseboard === null) return state;
        updated.baseboard = null;
      } else {
        const height = clampOr(
          baseboard.height,
          DEFAULT_BASEBOARD_HEIGHT,
          MIN_BASEBOARD_HEIGHT,
          Math.min(MAX_BASEBOARD_HEIGHT, wall.height),
        );
        const color = normalizeHex(baseboard.color);
        if (!color) return state;
        const normalized: WallBaseboard = { height, color };
        if (
          updated.baseboard &&
          updated.baseboard.height === normalized.height &&
          updated.baseboard.color === normalized.color
        ) {
          return state;
        }
        updated.baseboard = normalized;
      }
      return {
        house: {
          ...state.house,
          walls: { ...state.house.walls, [wallId]: updated },
        },
      };
    }),

  addPartition: (roomId, run) => {
    const house = get().house;
    const room = house.rooms[roomId];
    if (!room || room.notch) return null;

    const existing = partitionWalls(house, roomId);
    const used = new Set(existing.map((wall) => wall.id));
    let index = 1;
    while (used.has(partitionWallId(roomId, index))) index += 1;
    const id = partitionWallId(roomId, index);

    const coord =
      run === "x"
        ? room.position.z + room.depth / 2
        : room.position.x + room.width / 2;
    const wall = buildPartitionWall(id, room, run, coord);

    set((state) => ({
      house: reconcile({
        ...state.house,
        walls: { ...state.house.walls, [id]: wall },
      }),
    }));
    useEditorStore.getState().select({ kind: "wall", id });
    return id;
  },

  movePartition: (wallId, coord) =>
    set((state) => {
      const wall = state.house.walls[wallId];
      if (!wall?.partition || !wall.roomId) return state;
      const room = state.house.rooms[wall.roomId];
      if (!room || room.notch || !Number.isFinite(coord)) return state;

      const moved = carryOverrides(wall, movePartitionWall(room, wall, coord));
      if (
        moved.start.x === wall.start.x &&
        moved.start.z === wall.start.z &&
        moved.end.x === wall.end.x &&
        moved.end.z === wall.end.z
      ) {
        return state;
      }

      return {
        house: reconcile({
          ...state.house,
          walls: { ...state.house.walls, [wallId]: moved },
        }),
      };
    }),

  removePartition: (wallId) =>
    set((state) => {
      const wall = state.house.walls[wallId];
      if (!wall?.partition) return state;
      const walls = { ...state.house.walls };
      delete walls[wallId];
      return { house: reconcile({ ...state.house, walls }) };
    }),

  setRoomNotch: (roomId, notch) =>
    set((state) => {
      const room = state.house.rooms[roomId];
      if (!room) return state;
      const next = notch ? { ...notch } : null;
      const same =
        room.notch === next ||
        (room.notch !== null &&
          next !== null &&
          room.notch.corner === next.corner &&
          room.notch.width === next.width &&
          room.notch.depth === next.depth);
      if (same) return state;
      return {
        house: reconcile({
          ...state.house,
          rooms: { ...state.house.rooms, [roomId]: { ...room, notch: next } },
        }),
      };
    }),

  setRoomSurface: (roomId, key, color) =>
    set((state) => {
      const room = state.house.rooms[roomId];
      if (!room) return state;
      const hex = normalizeHex(color);
      if (!hex || room.surfaces[key] === hex) return state;
      const surfaces = { ...room.surfaces, [key]: hex };
      return {
        house: {
          ...state.house,
          rooms: { ...state.house.rooms, [roomId]: { ...room, surfaces } },
        },
      };
    }),

  applyRoomTemplate: (templateId) =>
    set((state) => {
      const template = findRoomTemplate(templateId);
      const base =
        state.house.rooms[SINGLE_ROOM_ID] ??
        Object.values(state.house.rooms)[0];
      if (!template || !base) return state;
      const room = roomFromTemplate(template, base);
      const objects = Object.fromEntries(
        templateObjects(template, room).map((object) => [object.id, object]),
      );
      return {
        house: reconcile({
          ...state.house,
          rooms: { [room.id]: normalizeRoom(room) },
          objects,
        }),
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

  duplicatePlacedObject: (id) => {
    const existing = get().house.objects[id];
    if (!existing) return null;
    const newId = nextObjectId(get().house);
    const overrides = existing.materialOverrides;
    const copy: PlacedObject = {
      ...existing,
      id: newId,
      position: {
        x: existing.position.x + 0.4,
        y: existing.position.y,
        z: existing.position.z + 0.4,
      },
      materialOverrides: overrides
        ? {
            colors: overrides.colors ? { ...overrides.colors } : undefined,
            finishes: overrides.finishes ? { ...overrides.finishes } : undefined,
          }
        : undefined,
    };
    set((state) => ({
      house: {
        ...state.house,
        objects: { ...state.house.objects, [newId]: copy },
      },
    }));
    return newId;
  },

  mirrorPlacedObject: (id) => {
    const existing = get().house.objects[id];
    if (!existing) return null;
    const room = roomContainingPoint(
      get().house,
      existing.position.x,
      existing.position.z,
    );
    const axisX = room ? room.position.x + room.width / 2 : 0;
    set((state) => ({
      house: {
        ...state.house,
        objects: {
          ...state.house.objects,
          [id]: {
            ...existing,
            position: { ...existing.position, x: axisX * 2 - existing.position.x },
            rotationY: normalizeAngle(-existing.rotationY),
          },
        },
      },
    }));
    return id;
  },

  setMaterialOverride: (id, slotId, patch) =>
    set((state) => {
      const existing = state.house.objects[id];
      if (!existing) return state;

      let overrides = existing.materialOverrides;
      if (patch.color !== undefined) {
        overrides = withSlotColor(overrides, slotId, patch.color);
      }
      if (patch.finish !== undefined) {
        overrides = withSlotFinish(overrides, slotId, patch.finish);
      }
      if (overrides === existing.materialOverrides) return state;

      const updated: PlacedObject = { ...existing };
      if (overrides) updated.materialOverrides = overrides;
      else delete updated.materialOverrides;
      return {
        house: {
          ...state.house,
          objects: { ...state.house.objects, [id]: updated },
        },
      };
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
