import type { Opening, PlacedObject, Room, Wall } from "../types/house";
import { wallLength } from "../types/house";
import type { AssetMetadata } from "../assets/types";
import { getWallHoleRects } from "./wallGeometry";

/**
 * Pure 2D floor-plan projection. World space is XZ (y up, z south); plan space
 * is SVG space: x right, y down, so world -z (north) points up the screen.
 * One plan unit is one metre — the SVG viewBox works in metres directly.
 */

export interface PlanPoint {
  x: number;
  y: number;
}

export interface PlanRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlanFootprint {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotationDeg: number;
}

export interface PlanDoor {
  hinge: PlanPoint;
  jamb: PlanPoint;
  tip: PlanPoint;
  sweep: 0 | 1;
}

const PLAN_EPS = 1e-4;

export function worldToPlan(x: number, z: number): PlanPoint {
  return { x, y: -z };
}

export function planToWorld(x: number, y: number): { x: number; z: number } {
  return { x, z: -y };
}

/** Plan rectangle of a room's floor (and wall band). */
export function roomPlanRect(room: Room): PlanRect {
  return {
    x: room.position.x,
    y: -(room.position.z + room.depth),
    width: room.width,
    height: room.depth,
  };
}

/** Plan centreline of a wall, from start to end. */
export function wallPlanLine(wall: Wall): PlanSegment {
  const a = worldToPlan(wall.start.x, wall.start.z);
  const b = worldToPlan(wall.end.x, wall.end.z);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * Wall centreline split around every opening hole, so the drawn plan wall has
 * a gap exactly where the 3D wall is carved (merged if holes overlap).
 */
export function wallPlanSegments(
  wall: Wall,
  openings: Opening[],
): PlanSegment[] {
  const length = wallLength(wall);
  if (length <= PLAN_EPS) return [];

  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const ux = dx / length;
  const uz = dz / length;

  const ranges = getWallHoleRects(wall, openings)
    .map((hole): [number, number] => [hole.x0, hole.x1])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1] + PLAN_EPS) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }

  const free: [number, number][] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start - cursor > PLAN_EPS) free.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (length - cursor > PLAN_EPS) free.push([cursor, length]);

  return free.map(([s, e]) => {
    const a = worldToPlan(wall.start.x + ux * s, wall.start.z + uz * s);
    const b = worldToPlan(wall.start.x + ux * e, wall.start.z + uz * e);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}

/**
 * Four plan corners of the opening cut through the wall: clipped along-wall
 * span × full wall thickness. Wound so the polygon fills correctly.
 */
export function openingPlanQuad(wall: Wall, opening: Opening): PlanPoint[] {
  const length = wallLength(wall);
  if (length <= PLAN_EPS) return [];
  const dx = (wall.end.x - wall.start.x) / length;
  const dz = (wall.end.z - wall.start.z) / length;
  const px = -dz;
  const pz = dx;
  const half = wall.thickness / 2;

  const from = Math.max(0, Math.min(length, opening.offset));
  const to = Math.max(0, Math.min(length, opening.offset + opening.width));
  if (to - from <= PLAN_EPS) return [];

  const corner = (along: number, side: 1 | -1): PlanPoint =>
    worldToPlan(
      wall.start.x + dx * along + px * side * half,
      wall.start.z + dz * along + pz * side * half,
    );

  return [corner(from, 1), corner(to, 1), corner(to, -1), corner(from, -1)];
}

/**
 * Door swing in plan: hinge at the opening's start jamb, leaf from hinge to
 * tip, quarter-circle arc from the far jamb to the tip. The tip sits on the
 * fixed right-hand perpendicular of the hinge→jamb direction (screen coords),
 * which makes the arc a constant -90° sweep (flag 0).
 */
export function doorPlanGeometry(
  wall: Wall,
  opening: Opening,
): PlanDoor | null {
  const length = wallLength(wall);
  if (length <= PLAN_EPS) return null;
  const dx = (wall.end.x - wall.start.x) / length;
  const dz = (wall.end.z - wall.start.z) / length;

  const from = Math.max(0, Math.min(length, opening.offset));
  const to = Math.max(0, Math.min(length, opening.offset + opening.width));
  const span = to - from;
  if (span <= PLAN_EPS) return null;

  const hinge = worldToPlan(
    wall.start.x + dx * from,
    wall.start.z + dz * from,
  );
  const jamb = worldToPlan(
    wall.start.x + dx * to,
    wall.start.z + dz * to,
  );

  const dirX = (jamb.x - hinge.x) / span;
  const dirY = (jamb.y - hinge.y) / span;
  const tip = {
    x: hinge.x + dirY * span,
    y: hinge.y - dirX * span,
  };

  const cross =
    (jamb.x - hinge.x) * (tip.y - hinge.y) -
    (jamb.y - hinge.y) * (tip.x - hinge.x);
  return { hinge, jamb, tip, sweep: cross > 0 ? 1 : 0 };
}

/**
 * Plan rectangle of a placed object's footprint: centre, size (scaled) and
 * rotation in degrees for an SVG rotate() transform. The footprint offset is
 * rotated with the object, exactly as AssetModel does in 3D.
 */
export function objectPlanRect(
  object: Pick<PlacedObject, "position" | "rotationY" | "scale">,
  asset?: AssetMetadata,
): PlanFootprint {
  const scale =
    Number.isFinite(object.scale) && object.scale > 0 ? object.scale : 1;
  const rotationY = Number.isFinite(object.rotationY) ? object.rotationY : 0;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const ox = asset?.footprintOffset.x ?? 0;
  const oz = asset?.footprintOffset.z ?? 0;

  const centre = worldToPlan(
    object.position.x + ox * cos + oz * sin,
    object.position.z + (-ox * sin + oz * cos),
  );

  return {
    cx: centre.x,
    cy: centre.y,
    width: (asset?.dimensions.width ?? 1) * scale,
    height: (asset?.dimensions.depth ?? 1) * scale,
    rotationDeg: (rotationY * 180) / Math.PI,
  };
}

/** View box that frames every room plus padding metres of margin. */
export function planViewBox(rooms: Room[], padding = 4): PlanViewBox {
  const fallback: PlanViewBox = { x: -10, y: -10, width: 20, height: 20 };
  if (rooms.length === 0) return fallback;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const room of rooms) {
    const rect = roomPlanRect(room);
    if (
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      continue;
    }
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return fallback;

  const margin = Number.isFinite(padding) && padding > 0 ? padding : 0;
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  };
}
