import type { Room } from "../types/house";
import { CEILING_THICKNESS } from "../types/house";
import type { BoxSpec } from "./wallGeometry";

export function getCeilingBox(room: Room): BoxSpec {
  return {
    position: [
      room.origin.x + room.width / 2,
      room.wallHeight + CEILING_THICKNESS / 2,
      room.origin.z + room.depth / 2,
    ],
    size: [room.width, CEILING_THICKNESS, room.depth],
  };
}
