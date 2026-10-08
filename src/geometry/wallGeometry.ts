import type { Opening, Wall } from "../types/house";
import type { OpeningRect } from "./openingGeometry";

export interface BoxSpec {
  position: [number, number, number];
  size: [number, number, number];
}

export interface WallPlacement {
  position: [number, number, number];
  rotationY: number;
  length: number;
}

interface Hole {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const BOX_EPS = 1e-4;

/**
 * The openings clipped to the wall rectangle: anything outside the wall can
 * never carve into it, and degenerate or non-finite input simply produces no
 * hole.
 */
function wallHoles(wall: Wall, openings: Opening[]): Hole[] {
  const { length } = getWallPlacement(wall);
  if (length <= BOX_EPS) return [];
  const holes: Hole[] = [];
  for (const opening of openings) {
    if (
      ![opening.offset, opening.width, opening.height, opening.sillHeight].every(
        Number.isFinite,
      )
    ) {
      continue;
    }
    const x0 = Math.max(0, opening.offset);
    const x1 = Math.min(length, opening.offset + opening.width);
    const y0 = Math.max(0, opening.sillHeight);
    const y1 = Math.min(wall.height, opening.sillHeight + opening.height);
    if (x1 - x0 > BOX_EPS && y1 - y0 > BOX_EPS) holes.push({ x0, x1, y0, y1 });
  }
  return holes;
}

export function getWallPlacement(wall: Wall): WallPlacement {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  return {
    position: [wall.start.x, 0, wall.start.z],
    rotationY: Math.atan2(-dz, dx),
    length: Math.hypot(dx, dz),
  };
}

/**
 * Wall-local solid boxes. The wall "understands" its openings: every opening
 * is clipped to the wall rectangle, the wall is sliced into vertical strips at
 * each hole edge, and each strip contributes exactly the solid runs left over
 * once the holes are removed. This stays correct for any input — including
 * overlapping or out-of-bounds openings from hand-written data — because holes
 * are treated as a union instead of assuming a sorted, disjoint list.
 */
export function getWallBoxes(wall: Wall, openings: Opening[]): BoxSpec[] {
  const { length } = getWallPlacement(wall);
  if (length <= BOX_EPS) return [];

  const t = wall.thickness;
  const h = wall.height;
  const boxes: BoxSpec[] = [];

  const add = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 <= BOX_EPS || y1 - y0 <= BOX_EPS) return;
    boxes.push({
      position: [(x0 + x1) / 2, (y0 + y1) / 2, 0],
      size: [x1 - x0, y1 - y0, t],
    });
  };

  const holes = wallHoles(wall, openings);

  if (holes.length === 0) {
    add(0, length, 0, h);
    return boxes;
  }

  const boundaries = new Set<number>([0, length]);
  for (const hole of holes) {
    boundaries.add(hole.x0);
    boundaries.add(hole.x1);
  }
  const xs = [...boundaries].sort((a, b) => a - b);

  for (let i = 0; i < xs.length - 1; i += 1) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (x1 - x0 <= BOX_EPS) continue;

    const spans = holes
      .filter((hole) => hole.x0 <= x0 + 1e-9 && hole.x1 >= x1 - 1e-9)
      .map((hole) => ({ y0: hole.y0, y1: hole.y1 }))
      .sort((a, b) => a.y0 - b.y0);

    const merged: { y0: number; y1: number }[] = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last && span.y0 <= last.y1 + 1e-9) {
        last.y1 = Math.max(last.y1, span.y1);
      } else {
        merged.push({ ...span });
      }
    }

    let cursor = 0;
    for (const span of merged) {
      add(x0, x1, cursor, span.y0);
      cursor = Math.max(cursor, span.y1);
    }
    add(x0, x1, cursor, h);
  }

  return boxes;
}

/**
 * The leaf (door slab) or pane (glass) that occupies the opening. It is
 * thinner than the wall so the opening reads as recessed behind its frame.
 */
export function getOpeningFillBox(wall: Wall, opening: Opening): BoxSpec {
  const fillThickness =
    opening.kind === "door"
      ? Math.min(wall.thickness * 0.35, 0.07)
      : Math.min(wall.thickness * 0.15, 0.03);
  return {
    position: [
      opening.offset + opening.width / 2,
      opening.sillHeight + opening.height / 2,
      0,
    ],
    size: [opening.width, opening.height, fillThickness],
  };
}

/**
 * Full-thickness frame lining the opening: jambs, head and (for windows) a
 * sill. Frame pieces sit inside the hole, so the visible aperture is the
 * opening minus the frame, with the fill box behind it.
 */
export function getOpeningFrameBoxes(
  wall: Wall,
  opening: Opening,
): BoxSpec[] {
  const x0 = opening.offset;
  const x1 = opening.offset + opening.width;
  const y0 = opening.sillHeight;
  const y1 = opening.sillHeight + opening.height;
  if (
    ![x0, x1, y0, y1, wall.thickness].every(Number.isFinite) ||
    x1 - x0 <= BOX_EPS ||
    y1 - y0 <= BOX_EPS
  ) {
    return [];
  }

  const frame = Math.min(0.06, (x1 - x0) * 0.15, (y1 - y0) * 0.15);
  if (frame <= BOX_EPS) return [];

  const boxes: BoxSpec[] = [];
  const add = (ax0: number, ax1: number, ay0: number, ay1: number) => {
    if (ax1 - ax0 <= BOX_EPS || ay1 - ay0 <= BOX_EPS) return;
    boxes.push({
      position: [(ax0 + ax1) / 2, (ay0 + ay1) / 2, 0],
      size: [ax1 - ax0, ay1 - ay0, wall.thickness],
    });
  };

  add(x0, x0 + frame, y0, y1);
  add(x1 - frame, x1, y0, y1);
  add(x0 + frame, x1 - frame, y1 - frame, y1);
  if (opening.kind !== "door") {
    add(x0 + frame, x1 - frame, y0, y0 + frame);
  }

  return boxes;
}

/**
 * Hole rectangles the openings carve out of the wall, clipped to the wall
 * bounds. Same source as the holes inside getWallBoxes, exposed so tests and
 * tooling can reason about the voids directly.
 */
export function getWallHoleRects(
  wall: Wall,
  openings: Opening[],
): OpeningRect[] {
  return wallHoles(wall, openings);
}
