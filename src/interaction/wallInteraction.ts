import type { House, Room, RoomEdge } from "../types/house";
import { firstWallUser } from "../geometry/roomGeometry";

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

export function edgeAxis(edge: RoomEdge): EdgeAxis {
  return edge === "east" || edge === "west" ? "x" : "z";
}

export function edgeCoordinate(room: Room, edge: RoomEdge): number {
  if (edge === "east") return room.position.x + room.width;
  if (edge === "west") return room.position.x;
  if (edge === "north") return room.position.z + room.depth;
  return room.position.z;
}

export function findRoomEdgeForWall(
  house: House,
  wallId: string,
): RoomEdgeTarget | null {
  const user = firstWallUser(house, wallId);
  if (!user) return null;
  return { roomId: user.roomId, edge: user.edge };
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
