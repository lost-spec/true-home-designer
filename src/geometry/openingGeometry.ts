import type { Opening, OpeningKind, Wall } from "../types/house";
import { wallLength } from "../types/house";

export const MIN_OPENING_WIDTH = 0.3;
export const MIN_OPENING_HEIGHT = 0.4;

const OVERLAP_EPS = 1e-6;

export interface OpeningFields {
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

export interface OpeningSize {
  width: number;
  height: number;
  sillHeight: number;
}

export interface OpeningRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const DEFAULT_DOOR_SIZE: OpeningSize = {
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
};

export const DEFAULT_WINDOW_SIZE: OpeningSize = {
  width: 1.2,
  height: 1.2,
  sillHeight: 0.9,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function defaultOpeningSize(kind: OpeningKind): OpeningSize {
  return kind === "door" ? DEFAULT_DOOR_SIZE : DEFAULT_WINDOW_SIZE;
}

export function openingRect(
  opening: Pick<Opening, "offset" | "width" | "height" | "sillHeight">,
): OpeningRect {
  return {
    x0: opening.offset,
    x1: opening.offset + opening.width,
    y0: opening.sillHeight,
    y1: opening.sillHeight + opening.height,
  };
}

export function rectsOverlap(a: OpeningRect, b: OpeningRect): boolean {
  return (
    Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > OVERLAP_EPS &&
    Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > OVERLAP_EPS
  );
}

export function rectsOverlapY(a: OpeningRect, b: OpeningRect): boolean {
  return Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > OVERLAP_EPS;
}

/**
 * Clamp requested opening values into what the wall can legally hold.
 * Doors always sit on the floor; windows get a sill. Returns null when the
 * request is non-finite or the wall itself is degenerate.
 */
export function normalizeOpening(
  wall: Wall,
  kind: OpeningKind,
  fields: OpeningFields,
): OpeningFields | null {
  if (
    ![fields.offset, fields.width, fields.height, fields.sillHeight].every(
      Number.isFinite,
    )
  ) {
    return null;
  }
  if (![wall.height, wall.start.x, wall.start.z, wall.end.x, wall.end.z].every(Number.isFinite)) {
    return null;
  }
  const length = wallLength(wall);
  if (length <= 1e-4 || wall.height <= 0) return null;

  const sillHeight =
    kind === "door"
      ? 0
      : clamp(fields.sillHeight, 0, Math.max(0, wall.height - MIN_OPENING_HEIGHT));
  const width = clamp(fields.width, Math.min(MIN_OPENING_WIDTH, length), length);
  const offset = clamp(fields.offset, 0, Math.max(0, length - width));
  const height = clamp(
    fields.height,
    Math.min(MIN_OPENING_HEIGHT, Math.max(0, wall.height - sillHeight)),
    Math.max(0, wall.height - sillHeight),
  );

  return { offset, width, height, sillHeight };
}

/**
 * True when the candidate rectangle intersects any other opening on the same
 * wall. Openings that only touch edges, or that stack vertically (window over
 * door), do not conflict.
 */
export function openingsConflict(
  candidate: OpeningFields,
  others: Opening[],
): boolean {
  const rect = openingRect(candidate);
  return others.some((other) => rectsOverlap(rect, openingRect(other)));
}

function subtractRange(
  ranges: [number, number][],
  cutStart: number,
  cutEnd: number,
): [number, number][] {
  const out: [number, number][] = [];
  for (const [start, end] of ranges) {
    if (cutEnd <= start || cutStart >= end) {
      out.push([start, end]);
      continue;
    }
    if (cutStart > start) out.push([start, cutStart]);
    if (cutEnd < end) out.push([cutEnd, end]);
  }
  return out;
}

function offsetRanges(
  length: number,
  width: number,
  blockers: OpeningRect[],
): [number, number][] {
  let ranges: [number, number][] = [[0, Math.max(0, length - width)]];
  for (const blocker of blockers) {
    ranges = subtractRange(ranges, blocker.x0 - width, blocker.x1);
  }
  return ranges.filter(([start, end]) => end - start > OVERLAP_EPS);
}

/**
 * Nearest legal offset for an opening of `width` on a wall of `length`, where
 * `blockers` are the rectangles it must not intersect. Used while dragging so
 * an opening slides up to its neighbour instead of passing through it.
 */
export function clampOpeningOffset(
  length: number,
  width: number,
  blockers: OpeningRect[],
  candidate: number,
): number {
  const upper = Math.max(0, length - width);
  if (!Number.isFinite(candidate)) return 0;
  const ranges = offsetRanges(length, width, blockers);
  if (ranges.length === 0) return clamp(candidate, 0, upper);

  let best: [number, number] = ranges[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const range of ranges) {
    if (candidate >= range[0] && candidate <= range[1]) return candidate;
    const distance =
      candidate < range[0] ? range[0] - candidate : candidate - range[1];
    if (distance < bestDistance) {
      bestDistance = distance;
      best = range;
    }
  }
  return clamp(candidate, best[0], best[1]);
}

/**
 * Pick an offset that leaves the requested opening clear of everything already
 * on the wall: centred in the largest free stretch that can hold it. Returns
 * null when the wall has no room left.
 */
export function findOpeningOffset(
  wall: Wall,
  size: OpeningSize,
  others: Opening[],
): number | null {
  const length = wallLength(wall);
  if (length <= 1e-4) return null;
  const width = clamp(
    size.width,
    Math.min(MIN_OPENING_WIDTH, length),
    length,
  );
  const rect: OpeningRect = {
    x0: 0,
    x1: width,
    y0: size.sillHeight,
    y1: size.sillHeight + size.height,
  };
  const blockers = others
    .filter((other) => rectsOverlapY(rect, openingRect(other)))
    .map((other) => openingRect(other));
  const ranges = offsetRanges(length, width, blockers);
  if (ranges.length === 0) return null;

  let best = ranges[0];
  for (const range of ranges) {
    if (range[1] - range[0] > best[1] - best[0]) best = range;
  }
  return best[0] + (best[1] - best[0]) / 2;
}
