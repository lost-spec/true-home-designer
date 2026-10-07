import type { Room } from "../types/house";
import { CEILING_THICKNESS } from "../types/house";
import type { BoxSpec } from "./wallGeometry";

export function getCeilingBox(room: Room): BoxSpec {
  return {
    position: [
      room.position.x + room.width / 2,
      room.height + CEILING_THICKNESS / 2,
      room.position.z + room.depth / 2,
    ],
    size: [room.width, CEILING_THICKNESS, room.depth],
  };
}
