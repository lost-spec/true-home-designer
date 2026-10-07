import type { Room, Vec2, Wall } from "../types/house";
import { DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS } from "../types/house";

export type RoomEdge = "south" | "east" | "north" | "west";

export interface RoomSpec {
  id: string;
  name: string;
  origin: Vec2;
  width: number;
  depth: number;
  wallHeight?: number;
  wallThickness?: number;
}

export function roomWallId(roomId: string, edge: RoomEdge): string {
  return `${roomId}-wall-${edge}`;
}

export function generateRoomWalls(room: Room): Wall[] {
  const x0 = room.origin.x;
  const z0 = room.origin.z;
  const x1 = x0 + room.width;
  const z1 = z0 + room.depth;
  const shared = { height: room.wallHeight, thickness: room.wallThickness };

  return [
    {
      id: roomWallId(room.id, "south"),
      start: { x: x0, z: z0 },
      end: { x: x1, z: z0 },
      ...shared,
    },
    {
      id: roomWallId(room.id, "east"),
      start: { x: x1, z: z0 },
      end: { x: x1, z: z1 },
      ...shared,
    },
    {
      id: roomWallId(room.id, "north"),
      start: { x: x1, z: z1 },
      end: { x: x0, z: z1 },
      ...shared,
    },
    {
      id: roomWallId(room.id, "west"),
      start: { x: x0, z: z1 },
      end: { x: x0, z: z0 },
      ...shared,
    },
  ];
}

export function createRoom(spec: RoomSpec): { room: Room; walls: Wall[] } {
  const room: Room = {
    id: spec.id,
    name: spec.name,
    origin: spec.origin,
    width: spec.width,
    depth: spec.depth,
    wallHeight: spec.wallHeight ?? DEFAULT_WALL_HEIGHT,
    wallThickness: spec.wallThickness ?? DEFAULT_WALL_THICKNESS,
    wallIds: [],
  };

  const walls = generateRoomWalls(room);
  room.wallIds = walls.map((wall) => wall.id);

  return { room, walls };
}
