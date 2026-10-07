import type { House, Room } from "../types/house";
import { roomWallId, type RoomEdge } from "../geometry/roomGeometry";

export type EdgeAxis = "x" | "z";

export interface RoomEdgeTarget {
  roomId: string;
  edge: RoomEdge;
}

export interface GroundPoint {
  x: number;
  z: number;
}

export interface WallDragAnchor {
  roomId: string;
  edge: RoomEdge;
  axis: EdgeAxis;
  edgeCoord: number;
  grabOffset: number;
}

const ALL_EDGES: RoomEdge[] = ["south", "east", "north", "west"];

export function edgeAxis(edge: RoomEdge): EdgeAxis {
  return edge === "east" || edge === "west" ? "x" : "z";
}

export function edgeCoordinate(room: Room, edge: RoomEdge): number {
  if (edge === "east") return room.origin.x + room.width;
  if (edge === "west") return room.origin.x;
  if (edge === "north") return room.origin.z + room.depth;
  return room.origin.z;
}

export function findRoomEdgeForWall(
  house: House,
  wallId: string,
): RoomEdgeTarget | null {
  for (const room of Object.values(house.rooms)) {
    for (const edge of ALL_EDGES) {
      if (roomWallId(room.id, edge) === wallId) {
        return { roomId: room.id, edge };
      }
    }
  }
  return null;
}

export function createWallDragAnchor(
  target: RoomEdgeTarget,
  room: Room,
  groundHit: GroundPoint,
): WallDragAnchor {
  const axis = edgeAxis(target.edge);
  const edgeCoord = edgeCoordinate(room, target.edge);
  const hit = axis === "x" ? groundHit.x : groundHit.z;
  return {
    roomId: target.roomId,
    edge: target.edge,
    axis,
    edgeCoord,
    grabOffset: edgeCoord - hit,
  };
}

export function snapToGrid(value: number, snapSize: number): number {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(snapSize) || snapSize <= 0) return value;
  return Math.round(value / snapSize) * snapSize;
}

export function resolveWallDrag(
  anchor: WallDragAnchor,
  groundHit: GroundPoint,
  snapSize: number,
): number {
  const hit = anchor.axis === "x" ? groundHit.x : groundHit.z;
  if (!Number.isFinite(hit)) return anchor.edgeCoord;
  return snapToGrid(hit + anchor.grabOffset, snapSize);
}
