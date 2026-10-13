import type {
  House,
  NotchCorner,
  Opening,
  Room,
  RoomEdge,
  RoomId,
  RoomNotch,
  RoomSurfaces,
  Vec2,
  Wall,
  WallId,
} from "../types/house";
import {
  DEFAULT_SURFACES,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
} from "../types/house";
import { normalizeOpening } from "./openingGeometry";
import { normalizeHex } from "../assets/materialSlots";

export type { RoomEdge };

export const MIN_ROOM_SIZE = 1;
export const MAX_ROOM_SIZE = 60;
/** Smallest a notch may be before it is treated as no notch at all. */
export const NOTCH_MIN = 0.5;

const LINE_EPS = 1e-6;

export interface RoomSpec {
  id: string;
  name: string;
  position: Vec2;
  width: number;
  depth: number;
  height?: number;
  wallThickness?: number;
  notch?: RoomNotch | null;
  surfaces?: Partial<RoomSurfaces>;
}

export interface WallUser {
  roomId: RoomId;
  edge: RoomEdge;
}

/** Who owns a given wall: one of the four outer edges, a notch face, or the room's partition. */
export type WallOwner =
  | { roomId: RoomId; edge: RoomEdge }
  | { roomId: RoomId; notch: "a" | "b" }
  | { roomId: RoomId; partition: true };

export interface EdgeSpan {
  run: "x" | "z";
  coord: number;
  from: number;
  to: number;
}

/** An axis-aligned XZ rectangle used to build floor and ceiling slabs. */
export interface RoomRect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export const ROOM_EDGES: RoomEdge[] = ["south", "east", "north", "west"];

export function roomWallId(roomId: string, edge: RoomEdge): string {
  return `${roomId}-wall-${edge}`;
}

export function roomWallIds(roomId: string): string[] {
  return ROOM_EDGES.map((edge) => roomWallId(roomId, edge));
}

export function notchWallId(roomId: string, slot: "a" | "b"): string {
  return `${roomId}-notch-${slot}`;
}

export function notchWallIds(roomId: string): string[] {
  return [notchWallId(roomId, "a"), notchWallId(roomId, "b")];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Reduce a raw notch against its room: drop it when too small, otherwise clamp
 * it so the two notch faces stay inside the footprint. Returns the input when
 * nothing changed so callers can keep referential equality.
 */
export function normalizeNotch(room: Room): RoomNotch | null {
  const notch = room.notch;
  if (!notch) return null;
  const maxWidth = room.width - MIN_ROOM_SIZE;
  const maxDepth = room.depth - MIN_ROOM_SIZE;
  const width = clamp(notch.width, NOTCH_MIN, Math.max(NOTCH_MIN, maxWidth));
  const depth = clamp(notch.depth, NOTCH_MIN, Math.max(NOTCH_MIN, maxDepth));
  if (width < NOTCH_MIN || depth < NOTCH_MIN) return null;
  if (
    notch.corner === room.notch?.corner &&
    width === room.notch.width &&
    depth === room.notch.depth
  ) {
    return notch;
  }
  return { corner: notch.corner, width, depth };
}

function normalizeSurfaces(room: Room): RoomSurfaces {
  const surfaces = room.surfaces;
  if (!surfaces) return { ...DEFAULT_SURFACES };
  return {
    wall: normalizeHex(surfaces.wall) ?? DEFAULT_SURFACES.wall,
    floor: normalizeHex(surfaces.floor) ?? DEFAULT_SURFACES.floor,
    ceiling: normalizeHex(surfaces.ceiling) ?? DEFAULT_SURFACES.ceiling,
  };
}

/** Clamp a room's notch and surfaces; returns the same object when unchanged. */
export function normalizeRoom(input: Room): Room {
  const notch = normalizeNotch(input);
  const surfaces = normalizeSurfaces(input);
  const notchSame = input.notch === notch;
  const surfacesSame =
    input.surfaces &&
    input.surfaces.wall === surfaces.wall &&
    input.surfaces.floor === surfaces.floor &&
    input.surfaces.ceiling === surfaces.ceiling;
  if (notchSame && surfacesSame) return input;
  return { ...input, notch, surfaces };
}

interface NotchFrame {
  nx: number;
  nz: number;
  a: EdgeSpan;
  b: EdgeSpan;
}

/** Position of the two notch faces for the room, or null when it is a box. */
export function notchFrame(room: Room): NotchFrame | null {
  const notch = normalizeNotch(room);
  if (!notch) return null;

  const x0 = room.position.x;
  const z0 = room.position.z;
  const x1 = x0 + room.width;
  const z1 = z0 + room.depth;

  let nx: number;
  let nz: number;
  switch (notch.corner) {
    case "se":
      nx = x1 - notch.width;
      nz = z0 + notch.depth;
      break;
    case "sw":
      nx = x0 + notch.width;
      nz = z0 + notch.depth;
      break;
    case "ne":
      nx = x1 - notch.width;
      nz = z1 - notch.depth;
      break;
    default:
      nx = x0 + notch.width;
      nz = z1 - notch.depth;
      break;
  }

  const lowZ = notch.corner === "se" || notch.corner === "sw";
  const east = notch.corner === "se" || notch.corner === "ne";

  // Wall A is the vertical face at x = nx.
  const a: EdgeSpan = {
    run: "z",
    coord: nx,
    from: lowZ ? z0 : nz,
    to: lowZ ? nz : z1,
  };
  // Wall B is the horizontal face at z = nz.
  const b: EdgeSpan = {
    run: "x",
    coord: nz,
    from: east ? nx : x0,
    to: east ? x1 : nx,
  };
  return { nx, nz, a, b };
}

export function edgeSpan(room: Room, edge: RoomEdge): EdgeSpan {
  const x0 = room.position.x;
  const z0 = room.position.z;
  const x1 = x0 + room.width;
  const z1 = z0 + room.depth;

  let span: EdgeSpan;
  if (edge === "south") span = { run: "x", coord: z0, from: x0, to: x1 };
  else if (edge === "north") span = { run: "x", coord: z1, from: x0, to: x1 };
  else if (edge === "west") span = { run: "z", coord: x0, from: z0, to: z1 };
  else span = { run: "z", coord: x1, from: z0, to: z1 };

  const frame = notchFrame(room);
  if (!frame) return span;
  const corner = room.notch?.corner;
  if (!corner) return span;

  // Shorten the two outer edges that run up to the notch.
  if (edge === "south" && (corner === "se" || corner === "sw")) {
    return corner === "se"
      ? { ...span, to: frame.nx }
      : { ...span, from: frame.nx };
  }
  if (edge === "north" && (corner === "ne" || corner === "nw")) {
    return corner === "ne"
      ? { ...span, to: frame.nx }
      : { ...span, from: frame.nx };
  }
  if (edge === "east" && (corner === "se" || corner === "ne")) {
    return corner === "se"
      ? { ...span, from: frame.nz }
      : { ...span, to: frame.nz };
  }
  if (edge === "west" && (corner === "sw" || corner === "nw")) {
    return corner === "sw"
      ? { ...span, from: frame.nz }
      : { ...span, to: frame.nz };
  }
  return span;
}

/**
 * The room footprint as one or two axis-aligned rectangles. An L-shaped room is
 * split into a full-width band and a partial band so floors and ceilings can be
 * built without any triangulation.
 */
export function roomBaseRects(room: Room): RoomRect[] {
  const x0 = room.position.x;
  const z0 = room.position.z;
  const full: RoomRect = {
    x: x0,
    z: z0,
    width: room.width,
    depth: room.depth,
  };
  const frame = notchFrame(room);
  if (!frame) return [full];

  const corner = room.notch?.corner as NotchCorner;
  const east = corner === "se" || corner === "ne";
  const lowZ = corner === "se" || corner === "sw";

  const fullBand: RoomRect = lowZ
    ? { x: x0, z: frame.nz, width: room.width, depth: room.depth - (frame.nz - z0) }
    : { x: x0, z: z0, width: room.width, depth: frame.nz - z0 };

  const partialBand: RoomRect = lowZ
    ? {
        x: east ? x0 : frame.nx,
        z: z0,
        width: east ? frame.nx - x0 : x0 + room.width - frame.nx,
        depth: frame.nz - z0,
      }
    : {
        x: east ? x0 : frame.nx,
        z: frame.nz,
        width: east ? frame.nx - x0 : x0 + room.width - frame.nx,
        depth: z0 + room.depth - frame.nz,
      };

  const rects = [fullBand, partialBand].filter(
    (rect) => rect.width > LINE_EPS && rect.depth > LINE_EPS,
  );
  return rects.length ? rects : [full];
}

export function wallSpan(wall: Wall): EdgeSpan | null {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  if (Math.abs(dz) <= LINE_EPS && Math.abs(dx) > LINE_EPS) {
    return {
      run: "x",
      coord: (wall.start.z + wall.end.z) / 2,
      from: Math.min(wall.start.x, wall.end.x),
      to: Math.max(wall.start.x, wall.end.x),
    };
  }
  if (Math.abs(dx) <= LINE_EPS && Math.abs(dz) > LINE_EPS) {
    return {
      run: "z",
      coord: (wall.start.x + wall.end.x) / 2,
      from: Math.min(wall.start.z, wall.end.z),
      to: Math.max(wall.start.z, wall.end.z),
    };
  }
  return null;
}

export function wallUsers(house: House, wallId: WallId): WallUser[] {
  const users: WallUser[] = [];
  for (const room of Object.values(house.rooms)) {
    for (const edge of ROOM_EDGES) {
      if (room.edges[edge] === wallId) users.push({ roomId: room.id, edge });
    }
  }
  return users;
}

export function firstWallUser(house: House, wallId: WallId): WallUser | null {
  for (const room of Object.values(house.rooms)) {
    for (const edge of ROOM_EDGES) {
      if (room.edges[edge] === wallId) return { roomId: room.id, edge };
    }
  }
  return null;
}

/** Resolve any wall id (outer edge, notch face, or partition) back to its room. */
export function roomForWall(house: House, wallId: WallId): WallOwner | null {
  const wall = house.walls[wallId];
  if (wall?.partition && wall.roomId) {
    return house.rooms[wall.roomId]
      ? { roomId: wall.roomId, partition: true }
      : null;
  }
  for (const room of Object.values(house.rooms)) {
    for (const edge of ROOM_EDGES) {
      if (room.edges[edge] === wallId) return { roomId: room.id, edge };
    }
    if (room.notch) {
      if (notchWallId(room.id, "a") === wallId) {
        return { roomId: room.id, notch: "a" };
      }
      if (notchWallId(room.id, "b") === wallId) {
        return { roomId: room.id, notch: "b" };
      }
    }
  }
  return null;
}

export function partitionWallId(roomId: RoomId, index: number): WallId {
  return `${roomId}-partition-${index}`;
}

/** Returns the room's partition walls in stable, deterministic order. */
export function partitionWalls(house: House, roomId: RoomId): Wall[] {
  return Object.values(house.walls)
    .filter((wall) => wall.partition && wall.roomId === roomId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The full-span span a partition occupies; run "x" runs along Z at Z = coord. */
export function partitionWallSpan(
  room: Room,
  run: "x" | "z",
  coord: number,
): EdgeSpan {
  const x0 = room.position.x;
  const z0 = room.position.z;
  const x1 = x0 + room.width;
  const z1 = z0 + room.depth;
  return run === "x"
    ? { run: "x", coord, from: x0, to: x1 }
    : { run: "z", coord, from: z0, to: z1 };
}

export function buildPartitionWall(
  id: WallId,
  room: Room,
  run: "x" | "z",
  coord: number,
): Wall {
  const span = partitionWallSpan(room, run, coord);
  return {
    ...buildWallFromSpan(id, span, 1, room.height, room.wallThickness),
    partition: true,
    roomId: room.id,
  };
}

/**
 * A partition at an explicit coordinate: clamped to the footprint, the span is
 * forced to the full room width/depth and the wall inherits the room's height
 * and thickness.
 */
export function movePartitionWall(
  room: Room,
  wall: Wall,
  coord: number,
): Wall {
  const span = wallSpan(wall);
  const run = span?.run === "x" ? "x" : "z";
  const min = run === "x" ? room.position.z : room.position.x;
  const max =
    run === "x" ? room.position.z + room.depth : room.position.x + room.width;
  return buildPartitionWall(wall.id, room, run, clamp(coord, min, max));
}

/**
 * Rebuild a partition against the room it belongs to: clamp its current
 * coordinate to the footprint and force the full span.
 */
export function rebuildPartition(room: Room, wall: Wall): Wall {
  const span = wallSpan(wall);
  return movePartitionWall(
    room,
    wall,
    span?.run === "x" || span?.run === "z" ? span.coord : wall.start.x,
  );
}

/**
 * Carry per-wall styling from an old rebuild onto a new one, so colour and
 * baseboard edits survive room changes. Returns the new wall untouched when
 * there is nothing to carry.
 */
export function carryOverrides(prev: Wall | undefined, next: Wall): Wall {
  if (!prev || (prev.color === undefined && prev.baseboard === undefined)) {
    return next;
  }
  const carried: Wall = { ...next };
  if (prev.color !== undefined) carried.color = prev.color;
  if (prev.baseboard !== undefined) carried.baseboard = prev.baseboard;
  return carried;
}

function buildWallFromSpan(
  id: WallId,
  span: EdgeSpan,
  sign: number,
  height: number,
  thickness: number,
): Wall {
  const startCoord = sign > 0 ? span.from : span.to;
  const endCoord = sign > 0 ? span.to : span.from;
  const start =
    span.run === "x"
      ? { x: startCoord, z: span.coord }
      : { x: span.coord, z: startCoord };
  const end =
    span.run === "x"
      ? { x: endCoord, z: span.coord }
      : { x: span.coord, z: endCoord };
  return { id, start, end, height, thickness };
}

function buildWall(room: Room, edge: RoomEdge, span: EdgeSpan): Wall {
  const sign = edge === "south" || edge === "east" ? 1 : -1;
  return buildWallFromSpan(
    roomWallId(room.id, edge),
    span,
    sign,
    room.height,
    room.wallThickness,
  );
}

export function notchWalls(room: Room): Wall[] {
  const frame = notchFrame(room);
  if (!frame) return [];
  return [
    buildWallFromSpan(
      notchWallId(room.id, "a"),
      frame.a,
      1,
      room.height,
      room.wallThickness,
    ),
    buildWallFromSpan(
      notchWallId(room.id, "b"),
      frame.b,
      1,
      room.height,
      room.wallThickness,
    ),
  ];
}

function openingCenter(
  wall: Wall,
  opening: Opening,
  run: "x" | "z",
): number | null {
  const start = wall.start[run];
  const end = wall.end[run];
  if (Math.abs(end - start) <= LINE_EPS) return null;
  const dir = end > start ? 1 : -1;
  return start + dir * (opening.offset + opening.width / 2);
}

function migrateOpening(
  opening: Opening,
  oldWall: Wall | undefined,
  target: Wall,
): Opening | null {
  const targetSpan = wallSpan(target);
  if (!targetSpan) return null;
  const length = targetSpan.to - targetSpan.from;
  if (opening.width > length + LINE_EPS) return null;

  const targetStart = target.start[targetSpan.run];
  const targetEnd = target.end[targetSpan.run];
  const targetDir = targetEnd > targetStart ? 1 : -1;

  let center: number | null = null;
  if (oldWall) {
    const oldSpan = wallSpan(oldWall);
    if (oldSpan && oldSpan.run === targetSpan.run) {
      center = openingCenter(oldWall, opening, oldSpan.run);
    }
  }
  if (center === null) {
    center = targetStart + targetDir * (opening.offset + opening.width / 2);
  }
  if (center < targetSpan.from - LINE_EPS || center > targetSpan.to + LINE_EPS) {
    return null;
  }

  const offset = clamp(
    (center - targetStart) * targetDir - opening.width / 2,
    0,
    Math.max(0, length - opening.width),
  );

  const fields = normalizeOpening(target, opening.kind, {
    offset,
    width: opening.width,
    height: opening.height,
    sillHeight: opening.sillHeight,
  });
  if (!fields) return null;
  if (
    fields.offset === opening.offset &&
    fields.width === opening.width &&
    fields.height === opening.height &&
    fields.sillHeight === opening.sillHeight
  ) {
    return opening;
  }
  return { ...opening, ...fields };
}

/**
 * Rebuild the walls for every room from its footprint. With a single room this
 * is a direct regeneration: four outer edges plus the notch faces, keeping each
 * wall id stable so openings migrate in place. Orphans are dropped.
 */
export function reconcile(input: House): House {
  const walls: Record<WallId, Wall> = {};
  const roomsOut: Record<RoomId, Room> = {};

  for (const room of Object.values(input.rooms)) {
    const base = normalizeRoom(room);
    for (const edge of ROOM_EDGES) {
      const id = base.edges[edge];
      const next = buildWall(base, edge, edgeSpan(base, edge));
      const prev = input.walls[id];
      walls[id] =
        prev && sameWall(prev, next)
          ? prev
          : carryOverrides(prev, next);
    }
    for (const wall of notchWalls(base)) {
      const prev = input.walls[wall.id];
      walls[wall.id] =
        prev && sameWall(prev, wall)
          ? prev
          : carryOverrides(prev, wall);
    }
    for (const wall of Object.values(input.walls)) {
      if (!wall.partition || wall.roomId !== room.id) continue;
      if (base.notch) continue;
      const rebuilt = rebuildPartition(base, wall);
      const prev = input.walls[wall.id];
      walls[wall.id] =
        prev && sameWall(prev, rebuilt)
          ? prev
          : carryOverrides(prev, rebuilt);
    }
    roomsOut[room.id] = base;
  }

  const openings: Record<string, Opening> = {};
  for (const opening of Object.values(input.openings)) {
    const target = walls[opening.wallId];
    if (!target) continue;
    const migrated = migrateOpening(
      opening,
      input.walls[opening.wallId],
      target,
    );
    if (migrated) openings[migrated.id] = migrated;
  }

  return {
    version: input.version,
    rooms: roomsOut,
    walls,
    openings,
    objects: input.objects,
  };
}

function sameVec(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.z === b.z;
}

function sameWall(a: Wall, b: Wall): boolean {
  return (
    sameVec(a.start, b.start) &&
    sameVec(a.end, b.end) &&
    a.height === b.height &&
    a.thickness === b.thickness
  );
}

export function moveRoomEdgeRect(
  room: Room,
  edge: RoomEdge,
  worldPosition: number,
): Room | null {
  if (!Number.isFinite(worldPosition)) return null;

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

  if (
    width === room.width &&
    depth === room.depth &&
    positionX === x0 &&
    positionZ === z0
  ) {
    return room;
  }

  return {
    ...room,
    width,
    depth,
    position: { x: positionX, z: positionZ },
  };
}

export function createRoom(spec: RoomSpec): { room: Room; walls: Wall[] } {
  const room: Room = {
    id: spec.id,
    name: spec.name,
    position: spec.position,
    width: spec.width,
    depth: spec.depth,
    height: spec.height ?? DEFAULT_WALL_HEIGHT,
    wallThickness: spec.wallThickness ?? DEFAULT_WALL_THICKNESS,
    edges: {
      south: roomWallId(spec.id, "south"),
      east: roomWallId(spec.id, "east"),
      north: roomWallId(spec.id, "north"),
      west: roomWallId(spec.id, "west"),
    },
    notch: spec.notch ?? null,
    surfaces: { ...DEFAULT_SURFACES, ...spec.surfaces },
  };

  const normalized = normalizeRoom(room);
  const walls = ROOM_EDGES.map((edge) =>
    buildWall(normalized, edge, edgeSpan(normalized, edge)),
  ).concat(notchWalls(normalized));
  return { room: normalized, walls };
}
