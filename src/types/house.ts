export type Vec2 = { x: number; z: number };
export type Vec3 = { x: number; y: number; z: number };

export type RoomId = string;
export type WallId = string;
export type OpeningId = string;
export type ObjectId = string;

export const DEFAULT_WALL_HEIGHT = 2.7;
export const DEFAULT_WALL_THICKNESS = 0.2;
export const FLOOR_THICKNESS = 0.15;
export const CEILING_THICKNESS = 0.12;

export type RoomEdge = "south" | "east" | "north" | "west";

export interface Room {
  id: RoomId;
  name: string;
  position: Vec2;
  width: number;
  depth: number;
  height: number;
  wallThickness: number;
  edges: Record<RoomEdge, WallId>;
}

export interface Wall {
  id: WallId;
  start: Vec2;
  end: Vec2;
  height: number;
  thickness: number;
}

export type OpeningKind = "door" | "window";

export interface Opening {
  id: OpeningId;
  wallId: WallId;
  kind: OpeningKind;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

export interface PlacedObject {
  id: ObjectId;
  assetId: string;
  position: Vec3;
  rotationY: number;
  scale: number;
}

export interface House {
  version: 1;
  rooms: Record<RoomId, Room>;
  walls: Record<WallId, Wall>;
  openings: Record<OpeningId, Opening>;
  objects: Record<ObjectId, PlacedObject>;
}

export function wallLength(wall: Wall): number {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  return Math.hypot(dx, dz);
}
