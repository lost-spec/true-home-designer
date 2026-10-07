import type {
  House,
  Opening,
  Room,
  RoomEdge,
  RoomId,
  Vec2,
  Wall,
  WallId,
} from "../types/house";
import { DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS } from "../types/house";

export type { RoomEdge };

export const MIN_ROOM_SIZE = 1;
export const MAX_ROOM_SIZE = 60;

const LINE_EPS = 1e-6;

export interface RoomSpec {
  id: string;
  name: string;
  position: Vec2;
  width: number;
  depth: number;
  height?: number;
  wallThickness?: number;
}

export interface WallUser {
  roomId: RoomId;
  edge: RoomEdge;
}

export interface EdgeSpan {
  run: "x" | "z";
  coord: number;
  from: number;
  to: number;
}

interface UserRef extends WallUser {
  span: EdgeSpan;
}

interface WallLine {
  run: "x" | "z";
  coord: number;
}

export const ROOM_EDGES: RoomEdge[] = ["south", "east", "north", "west"];

export function roomWallId(roomId: string, edge: RoomEdge): string {
  return `${roomId}-wall-${edge}`;
}

export function roomWallIds(roomId: string): string[] {
  return ROOM_EDGES.map((edge) => roomWallId(roomId, edge));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function edgeSpan(room: Room, edge: RoomEdge): EdgeSpan {
  const x0 = room.position.x;
  const z0 = room.position.z;
  const x1 = x0 + room.width;
  const z1 = z0 + room.depth;
  if (edge === "south") return { run: "x", coord: z0, from: x0, to: x1 };
  if (edge === "north") return { run: "x", coord: z1, from: x0, to: x1 };
  if (edge === "west") return { run: "z", coord: x0, from: z0, to: z1 };
  return { run: "z", coord: x1, from: z0, to: z1 };
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

function lineMatchesSpan(line: WallLine, span: EdgeSpan): boolean {
  return span.run === line.run && Math.abs(span.coord - line.coord) <= LINE_EPS;
}

function lineMatches(a: EdgeSpan, b: EdgeSpan): boolean {
  return a.run === b.run && Math.abs(a.coord - b.coord) <= LINE_EPS;
}

function overlapOf(a: EdgeSpan, b: EdgeSpan): number {
  return Math.min(a.to, b.to) - Math.max(a.from, b.from);
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

function resolveLine(
  stored: EdgeSpan | null,
  users: UserRef[],
): WallLine | null {
  if (stored && users.some((u) => lineMatches(u.span, stored))) {
    return { run: stored.run, coord: stored.coord };
  }
  if (users.length > 0) {
    return { run: users[0].span.run, coord: users[0].span.coord };
  }
  if (stored) return { run: stored.run, coord: stored.coord };
  return null;
}

function qualification(
  wall: Wall,
  line: WallLine | undefined,
  ourRoomId: RoomId,
  ourEdge: RoomEdge,
  ourSpan: EdgeSpan,
  refUsers: Map<WallId, UserRef[]>,
  wallId: WallId,
): number {
  if (!line || !lineMatchesSpan(line, ourSpan)) return -1;
  const users = refUsers.get(wallId) ?? [];
  const others = users.filter(
    (u) => !(u.roomId === ourRoomId && u.edge === ourEdge),
  );
  if (others.length === 0) return Number.POSITIVE_INFINITY;
  const collinear = others.filter((u) => lineMatchesSpan(line, u.span));
  if (collinear.length === 0) {
    const stored = wallSpan(wall);
    if (!stored) return -1;
    const overlap = overlapOf(stored, ourSpan);
    return overlap > LINE_EPS ? overlap : -1;
  }
  const from = Math.min(...collinear.map((u) => u.span.from));
  const to = Math.max(...collinear.map((u) => u.span.to));
  const overlap = overlapOf({ run: line.run, coord: line.coord, from, to }, ourSpan);
  return overlap > LINE_EPS ? overlap : -1;
}

function buildWall(room: Room, edge: RoomEdge, span: EdgeSpan): Wall {
  const sign = edge === "south" || edge === "east" ? 1 : -1;
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
  return {
    id: roomWallId(room.id, edge),
    start,
    end,
    height: room.height,
    thickness: room.wallThickness,
  };
}

function rebuildWall(
  previous: Wall,
  spans: EdgeSpan[],
  heights: number[],
  thicknesses: number[],
): Wall {
  const collinear = spans.every((s) => lineMatches(s, spans[0]));
  const stored = wallSpan(previous);
  const base = collinear ? spans[0] : (stored ?? spans[0]);
  const run = base.run;
  const coord = base.coord;
  const from = Math.min(...spans.map((s) => s.from));
  const to = Math.max(...spans.map((s) => s.to));

  const startRun = previous.start[run];
  const endRun = previous.end[run];
  const sign =
    Math.abs(endRun - startRun) > LINE_EPS ? Math.sign(endRun - startRun) : 1;
  const startCoord = sign > 0 ? from : to;
  const endCoord = sign > 0 ? to : from;

  const start =
    run === "x" ? { x: startCoord, z: coord } : { x: coord, z: startCoord };
  const end =
    run === "x" ? { x: endCoord, z: coord } : { x: coord, z: endCoord };

  return {
    id: previous.id,
    start,
    end,
    height: Math.max(...heights),
    thickness: Math.max(...thicknesses),
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
  if (Math.abs(offset - opening.offset) < 1e-9) return opening;
  return { ...opening, offset };
}

export function reconcile(input: House): House {
  const rooms = Object.values(input.rooms);

  const work: { room: Room; edge: RoomEdge; span: EdgeSpan }[] = [];
  const refUsers = new Map<WallId, UserRef[]>();
  for (const room of rooms) {
    for (const edge of ROOM_EDGES) {
      const span = edgeSpan(room, edge);
      work.push({ room, edge, span });
      const refId = room.edges[edge];
      const user: UserRef = { roomId: room.id, edge, span };
      const list = refUsers.get(refId);
      if (list) list.push(user);
      else refUsers.set(refId, [user]);
    }
  }

  const pool: Record<WallId, Wall> = {};
  for (const [id, wall] of Object.entries(input.walls)) {
    if ((refUsers.get(id)?.length ?? 0) > 0) pool[id] = wall;
  }

  const resolved = new Map<WallId, WallLine>();
  for (const [id, wall] of Object.entries(pool)) {
    const line = resolveLine(wallSpan(wall), refUsers.get(id) ?? []);
    if (line) resolved.set(id, line);
  }

  const assigned = new Map<WallId, EdgeSpan[]>();
  const assignedHeights = new Map<WallId, number[]>();
  const assignedThickness = new Map<WallId, number[]>();
  const edgePatches = new Map<RoomId, Partial<Record<RoomEdge, WallId>>>();

  for (const item of work) {
    const refId = item.room.edges[item.edge];
    const refWall = pool[refId];
    let chosen: WallId | null = null;

    if (refWall) {
      const score = qualification(
        refWall,
        resolved.get(refId),
        item.room.id,
        item.edge,
        item.span,
        refUsers,
        refId,
      );
      if (score > LINE_EPS) chosen = refId;
    }

    if (chosen === null) {
      let bestId: WallId | null = null;
      let bestScore = -1;
      for (const [id, wall] of Object.entries(pool)) {
        if (id === refId) continue;
        const score = qualification(
          wall,
          resolved.get(id),
          item.room.id,
          item.edge,
          item.span,
          refUsers,
          id,
        );
        if (score <= LINE_EPS) continue;
        if (
          score > bestScore + LINE_EPS ||
          (Math.abs(score - bestScore) <= LINE_EPS &&
            (bestId === null || id < bestId))
        ) {
          bestId = id;
          bestScore = score;
        }
      }
      chosen = bestId;
    }

    if (chosen === null) {
      let candidateId = roomWallId(item.room.id, item.edge);
      while (pool[candidateId]) candidateId = `${candidateId}-x`;
      chosen = candidateId;
      pool[chosen] = buildWall(item.room, item.edge, item.span);
    }

    if (chosen !== refId) {
      let patch = edgePatches.get(item.room.id);
      if (!patch) {
        patch = {};
        edgePatches.set(item.room.id, patch);
      }
      patch[item.edge] = chosen;
    }

    const spanList = assigned.get(chosen);
    if (spanList) spanList.push(item.span);
    else assigned.set(chosen, [item.span]);
    const heightList = assignedHeights.get(chosen);
    if (heightList) heightList.push(item.room.height);
    else assignedHeights.set(chosen, [item.room.height]);
    const thicknessList = assignedThickness.get(chosen);
    if (thicknessList) thicknessList.push(item.room.wallThickness);
    else assignedThickness.set(chosen, [item.room.wallThickness]);
  }

  const walls: Record<WallId, Wall> = {};
  for (const [id, wall] of Object.entries(pool)) {
    const spans = assigned.get(id);
    if (!spans || spans.length === 0) continue;
    const rebuilt = rebuildWall(
      wall,
      spans,
      assignedHeights.get(id) ?? [wall.height],
      assignedThickness.get(id) ?? [wall.thickness],
    );
    walls[id] = sameWall(wall, rebuilt) ? wall : rebuilt;
  }

  const roomsOut: Record<RoomId, Room> = {};
  for (const room of rooms) {
    const patch = edgePatches.get(room.id);
    roomsOut[room.id] = patch
      ? { ...room, edges: { ...room.edges, ...patch } }
      : room;
  }

  const openings: Record<string, Opening> = {};
  for (const opening of Object.values(input.openings)) {
    const oldWall = input.walls[opening.wallId];
    const target = walls[opening.wallId];
    if (target) {
      const migrated = migrateOpening(opening, oldWall, target);
      if (migrated) openings[migrated.id] = migrated;
      continue;
    }
    if (!oldWall) continue;
    const oldSpan = wallSpan(oldWall);
    if (!oldSpan) continue;
    let transfer: Wall | null = null;
    const center = openingCenter(oldWall, opening, oldSpan.run);
    if (center !== null) {
      for (const wall of Object.values(walls)) {
        const span = wallSpan(wall);
        if (!span || span.run !== oldSpan.run) continue;
        if (Math.abs(span.coord - oldSpan.coord) > LINE_EPS) continue;
        if (center >= span.from - LINE_EPS && center <= span.to + LINE_EPS) {
          transfer = wall;
          break;
        }
      }
    }
    if (!transfer) continue;
    const migrated = migrateOpening(opening, oldWall, transfer);
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
  };

  const walls = ROOM_EDGES.map((edge) =>
    buildWall(room, edge, edgeSpan(room, edge)),
  );
  return { room, walls };
}
