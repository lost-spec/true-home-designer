import type { Opening, Wall } from "../types/house";

export interface BoxSpec {
  position: [number, number, number];
  size: [number, number, number];
}

export interface WallPlacement {
  position: [number, number, number];
  rotationY: number;
  length: number;
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

export function getWallBoxes(
  wall: Wall,
  openings: Opening[],
): BoxSpec[] {
  const { length } = getWallPlacement(wall);
  if (length <= 1e-4) return [];

  const t = wall.thickness;
  const h = wall.height;
  const boxes: BoxSpec[] = [];

  const add = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 <= 1e-4 || y1 - y0 <= 1e-4) return;
    boxes.push({
      position: [(x0 + x1) / 2, (y0 + y1) / 2, 0],
      size: [x1 - x0, y1 - y0, t],
    });
  };

  const valid = openings
    .filter(
      (o) =>
        o.offset >= 0 &&
        o.offset + o.width <= length &&
        o.sillHeight >= 0 &&
        o.sillHeight + o.height <= h,
    )
    .sort((a, b) => a.offset - b.offset);

  let cursor = 0;
  for (const opening of valid) {
    add(cursor, opening.offset, 0, h);
    add(opening.offset, opening.offset + opening.width, 0, opening.sillHeight);
    add(
      opening.offset,
      opening.offset + opening.width,
      opening.sillHeight + opening.height,
      h,
    );
    cursor = opening.offset + opening.width;
  }
  add(cursor, length, 0, h);

  return boxes;
}

export function getOpeningFillBox(
  wall: Wall,
  opening: Opening,
): BoxSpec {
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
