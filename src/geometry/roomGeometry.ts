import type { Room, RoomEdge, Vec2, Wall } from "../types/house";
import { DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS } from "../types/house";

export type { RoomEdge };

export interface RoomSpec {
  id: string;
  name: string;
  position: Vec2;
  width: number;
  depth: number;
  height?: number;
  wallThickness?: number;
}

export const ROOM_EDGES: RoomEdge[] = ["south", "east", "north", "west"];

export function roomWallId(roomId: string, edge: RoomEdge): string {
  return `${roomId}-wall-${edge}`;
}

export function roomWallIds(roomId: string): string[] {
  return ROOM_EDGES.map((edge) => roomWallId(roomId, edge));
}

export function generateRoomWalls(room: Room): Wall[] {
  const x0 = room.position.x;
  const z0 = room.position.z;
  const x1 = x0 + room.width;
  const z1 = z0 + room.depth;
  const shared = {
    roomId: room.id,
    height: room.height,
    thickness: room.wallThickness,
  };

  return [
    {
      id: roomWallId(room.id, "south"),
      edge: "south",
      start: { x: x0, z: z0 },
      end: { x: x1, z: z0 },
      ...shared,
    },
    {
      id: roomWallId(room.id, "east"),
      edge: "east",
      start: { x: x1, z: z0 },
      end: { x: x1, z: z1 },
      ...shared,
    },
    {
      id: roomWallId(room.id, "north"),
      edge: "north",
      start: { x: x1, z: z1 },
      end: { x: x0, z: z1 },
      ...shared,
    },
    {
      id: roomWallId(room.id, "west"),
      edge: "west",
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
    position: spec.position,
    width: spec.width,
    depth: spec.depth,
    height: spec.height ?? DEFAULT_WALL_HEIGHT,
    wallThickness: spec.wallThickness ?? DEFAULT_WALL_THICKNESS,
  };

  return { room, walls: generateRoomWalls(room) };
}
