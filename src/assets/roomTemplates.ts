import type { PlacedObject, Room, RoomNotch, RoomSurfaces } from "../types/house";
import { createRoom } from "../geometry/roomGeometry";
import { normalizeAngle } from "../interaction/objectInteraction";

/** Furniture placement for a template, offset from the room centre in metres. */
export interface TemplateObject {
  assetId: string;
  dx: number;
  dz: number;
  rotationY?: number;
}

export interface RoomTemplate {
  id: string;
  name: string;
  /** One-line summary shown on the start screen. */
  description: string;
  width: number;
  depth: number;
  notch: RoomNotch | null;
  surfaces: RoomSurfaces;
  objects: TemplateObject[];
}

export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  {
    id: "empty",
    name: "Empty room",
    description: "A blank 5 × 4 m room to furnish from scratch.",
    width: 5,
    depth: 4,
    notch: null,
    surfaces: { wall: "#e9e4dc", floor: "#c9a074", ceiling: "#f2efe9" },
    objects: [],
  },
  {
    id: "bedroom",
    name: "Bedroom",
    description: "Bed, closet and cabinets in a cosy 4.5 × 4 m room.",
    width: 4.5,
    depth: 4,
    notch: null,
    surfaces: { wall: "#e6e0d4", floor: "#bb8f66", ceiling: "#f4f1ea" },
    objects: [
      { assetId: "bed", dx: 0, dz: -0.4, rotationY: 0 },
      { assetId: "modern_closet", dx: -1.9, dz: 1.1, rotationY: -Math.PI / 2 },
      { assetId: "cabinet", dx: 1.6, dz: 1.4, rotationY: 0 },
      { assetId: "round_clock", dx: 2.1, dz: -1.6, rotationY: -Math.PI / 2 },
    ],
  },
  {
    id: "living",
    name: "Living room",
    description: "Sofa, TV and bookshelf across a spacious 6 × 5 m room.",
    width: 6,
    depth: 5,
    notch: null,
    surfaces: { wall: "#e5e1d8", floor: "#c2a075", ceiling: "#f2efe9" },
    objects: [
      { assetId: "sofa", dx: -0.2, dz: 1.4, rotationY: 0 },
      { assetId: "modern_tv", dx: -0.2, dz: -1.9, rotationY: 0 },
      { assetId: "modern_bookshelf", dx: 2.3, dz: -0.4, rotationY: -Math.PI / 2 },
      { assetId: "modern_table", dx: -0.2, dz: -0.2, rotationY: 0 },
      { assetId: "round_clock", dx: -2.4, dz: -1.8, rotationY: Math.PI / 2 },
    ],
  },
  {
    id: "kitchen",
    name: "Kitchen",
    description: "Fridge, cabinets and a table in a compact 4.5 × 3.5 m room.",
    width: 4.5,
    depth: 3.5,
    notch: null,
    surfaces: { wall: "#ecebe6", floor: "#9e948a", ceiling: "#f6f5f2" },
    objects: [
      { assetId: "fridge", dx: 1.6, dz: -1.2, rotationY: 0 },
      { assetId: "cabinet", dx: -1.4, dz: -1.2, rotationY: 0 },
      { assetId: "modern_table", dx: 0, dz: 0.7, rotationY: 0 },
    ],
  },
  {
    id: "office",
    name: "Office",
    description: "Desk, gaming chair and shelves in a 4 × 3.5 m workspace.",
    width: 4,
    depth: 3.5,
    notch: null,
    surfaces: { wall: "#e2e4e0", floor: "#b7a184", ceiling: "#f1f2ef" },
    objects: [
      { assetId: "modern_table", dx: 0, dz: -0.3, rotationY: 0 },
      { assetId: "racing_gaming_chair", dx: 0, dz: 0.9, rotationY: 0 },
      { assetId: "modern_bookshelf", dx: -1.5, dz: 0.6, rotationY: Math.PI / 2 },
      { assetId: "round_clock", dx: 1.6, dz: -1.4, rotationY: -Math.PI / 2 },
    ],
  },
];

export function findRoomTemplate(id: string): RoomTemplate | null {
  return ROOM_TEMPLATES.find((template) => template.id === id) ?? null;
}

/**
 * Rebuild a room from a template, keeping the given room's id, height and
 * thickness but re-centring it and adopting the template's shape and surfaces.
 */
export function roomFromTemplate(template: RoomTemplate, base: Room): Room {
  const centerX = base.position.x + base.width / 2;
  const centerZ = base.position.z + base.depth / 2;
  const { room } = createRoom({
    id: base.id,
    name: template.name,
    position: {
      x: centerX - template.width / 2,
      z: centerZ - template.depth / 2,
    },
    width: template.width,
    depth: template.depth,
    height: base.height,
    wallThickness: base.wallThickness,
    notch: template.notch,
    surfaces: template.surfaces,
  });
  return room;
}

/** Furniture for a template, positioned around the (possibly moved) room. */
export function templateObjects(
  template: RoomTemplate,
  room: Room,
): PlacedObject[] {
  const centerX = room.position.x + room.width / 2;
  const centerZ = room.position.z + room.depth / 2;
  return template.objects.map((entry, index) => ({
    id: `obj-${index + 1}`,
    assetId: entry.assetId,
    position: { x: centerX + entry.dx, y: 0, z: centerZ + entry.dz },
    rotationY: normalizeAngle(entry.rotationY ?? 0),
    scale: 1,
  }));
}
