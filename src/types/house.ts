import type { MaterialOverrides } from "../assets/types";

export type Vec2 = { x: number; z: number };
export type Vec3 = { x: number; y: number; z: number };

export type RoomId = string;
export type WallId = string;
export type OpeningId = string;
export type ObjectId = string;

export const DEFAULT_WALL_HEIGHT = 3.4;
export const DEFAULT_WALL_THICKNESS = 0.2;
export const FLOOR_THICKNESS = 0.15;
export const CEILING_THICKNESS = 0.12;

export const DEFAULT_BASEBOARD_HEIGHT = 0.1;
export const DEFAULT_BASEBOARD_COLOR = "#ffffff";
export const MIN_BASEBOARD_HEIGHT = 0.03;
export const MAX_BASEBOARD_HEIGHT = 0.3;

/**
 * The designer works on a single room. Everything still lives inside a House
 * record so the scene, persistence and history layers keep one shape, but the
 * room always uses this id.
 */
export const SINGLE_ROOM_ID: RoomId = "room-1";

export type RoomEdge = "south" | "east" | "north" | "west";

/** Corner of the bounding rectangle an L-shaped room is notched out of. */
export type NotchCorner = "ne" | "nw" | "se" | "sw";

/** A rectangle cut out of one corner of the room, producing an L-shape. */
export interface RoomNotch {
  corner: NotchCorner;
  /** Extent of the notch along X, measured from the notched corner. */
  width: number;
  /** Extent of the notch along Z, measured from the notched corner. */
  depth: number;
}

/** Colours applied to the room's three surface groups. */
export interface RoomSurfaces {
  wall: string;
  floor: string;
  ceiling: string;
}

export const DEFAULT_SURFACES: RoomSurfaces = {
  wall: "#e9e4dc",
  floor: "#c9a074",
  ceiling: "#f2efe9",
};

export interface Room {
  id: RoomId;
  name: string;
  position: Vec2;
  width: number;
  depth: number;
  height: number;
  wallThickness: number;
  edges: Record<RoomEdge, WallId>;
  /** Corner notch turning the rectangle into an L-shape; null for a plain box. */
  notch: RoomNotch | null;
  surfaces: RoomSurfaces;
}

/** A skirting board running along the base of a wall. */
export interface WallBaseboard {
  height: number;
  color: string;
}

export interface Wall {
  id: WallId;
  start: Vec2;
  end: Vec2;
  height: number;
  thickness: number;
  /** Per-wall colour override; falls back to the room's wall surface. */
  color?: string;
  /** Skirting along the wall base; undefined = default, null = none. */
  baseboard?: WallBaseboard | null;
  /** True for a full-span partition wall; owned by its room. */
  partition?: true;
  /** The room this partition wall belongs to. */
  roomId?: RoomId;
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
  /** Per-object material customisation; absent when the asset shows its GLB materials. */
  materialOverrides?: MaterialOverrides;
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
