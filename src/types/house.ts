export type Vec2 = { x: number; z: number };

export const DEFAULT_WALL_HEIGHT = 2.7;
export const DEFAULT_WALL_THICKNESS = 0.2;
export const FLOOR_THICKNESS = 0.15;
export const CEILING_THICKNESS = 0.12;

export interface Wall {
  id: string;
  start: Vec2;
  end: Vec2;
  height: number;
  thickness: number;
}

export type OpeningKind = "door" | "window";

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

export interface Room {
  id: string;
  name: string;
  origin: Vec2;
  width: number;
  depth: number;
  wallHeight: number;
  wallThickness: number;
  wallIds: string[];
}

export interface PlacedObject {
  id: string;
  assetId: string;
  position: Vec2;
  rotationY: number;
}

export interface House {
  version: 1;
  rooms: Record<string, Room>;
  walls: Record<string, Wall>;
  openings: Record<string, Opening>;
  objects: Record<string, PlacedObject>;
}

export function wallLength(wall: Wall): number {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  return Math.hypot(dx, dz);
}
