import type { Room } from "../types/house";
import { FLOOR_THICKNESS } from "../types/house";
import type { BoxSpec } from "./wallGeometry";
import { roomBaseRects } from "./roomGeometry";

/** One floor slab per footprint rectangle (1 for a box room, 2 for an L). */
export function getFloorBoxes(room: Room): BoxSpec[] {
  return roomBaseRects(room).map((rect) => ({
    position: [
      rect.x + rect.width / 2,
      -FLOOR_THICKNESS / 2,
      rect.z + rect.depth / 2,
    ],
    size: [rect.width, FLOOR_THICKNESS, rect.depth],
  }));
}

/** Single bounding slab covering the whole footprint. */
export function getFloorBox(room: Room): BoxSpec {
  return {
    position: [
      room.position.x + room.width / 2,
      -FLOOR_THICKNESS / 2,
      room.position.z + room.depth / 2,
    ],
    size: [room.width, FLOOR_THICKNESS, room.depth],
  };
}
