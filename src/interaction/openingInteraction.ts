import type { Opening, Wall } from "../types/house";
import { wallLength } from "../types/house";
import {
  clampOpeningOffset,
  openingRect,
  rectsOverlapY,
} from "../geometry/openingGeometry";
import { snapToGrid } from "./wallInteraction";

/**
 * Turn a ground-plane pointer position into the nearest legal offset for the
 * opening being dragged. The opening keeps its centre under the pointer,
 * snaps to the editor grid, then stops at the wall ends and at any opening it
 * would intersect (a window stacked above the opening does not block it).
 */
export function resolveOpeningOffset(
  wall: Wall,
  opening: Opening,
  point: { x: number; z: number },
  snap: number,
  others: Opening[],
): number {
  const length = wallLength(wall);
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const runLength = Math.hypot(dx, dz);
  if (runLength <= 1e-4 || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    return opening.offset;
  }

  const along =
    ((point.x - wall.start.x) * dx + (point.z - wall.start.z) * dz) / runLength;
  const candidate = along - opening.width / 2;

  const self = openingRect(opening);
  const blockers = others
    .filter((other) => rectsOverlapY(self, openingRect(other)))
    .map((other) => openingRect(other));

  const clamped = clampOpeningOffset(length, opening.width, blockers, candidate);
  const snapped = snapToGrid(clamped, snap);
  return clampOpeningOffset(length, opening.width, blockers, snapped);
}
