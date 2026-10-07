import type { Room } from "../types/house";
import { FLOOR_THICKNESS } from "../types/house";
import type { BoxSpec } from "./wallGeometry";

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
