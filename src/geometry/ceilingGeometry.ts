import type { Room, Wall } from "../types/house";
import { CEILING_THICKNESS, DEFAULT_WALL_HEIGHT } from "../types/house";
import type { BoxSpec } from "./wallGeometry";

export function getCeilingBox(
  room: Room,
  walls: Record<string, Wall>,
): BoxSpec {
  const heights = room.wallIds
    .map((id) => walls[id]?.height)
    .filter((h): h is number => typeof h === "number");
  const height =
    heights.length > 0 ? Math.max(...heights) : DEFAULT_WALL_HEIGHT;

  return {
    position: [
      room.origin.x + room.width / 2,
      height + CEILING_THICKNESS / 2,
      room.origin.z + room.depth / 2,
    ],
    size: [room.width, CEILING_THICKNESS, room.depth],
  };
}
