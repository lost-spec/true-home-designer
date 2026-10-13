import type { House, Room, RoomEdge } from "../types/house";
import { firstWallUser, wallSpan } from "../geometry/roomGeometry";

export type EdgeAxis = "x" | "z";

export interface RoomEdgeTarget {
  roomId: string;
  edge: RoomEdge;
}

export interface GroundPoint {
  x: number;
  z: number;
}

export interface EdgeDragAnchor {
  kind: "edge";
  roomId: string;
  edge: RoomEdge;
  axis: EdgeAxis;
  edgeCoord: number;
  grabOffset: number;
}

export interface PartitionDragAnchor {
  kind: "partition";
  roomId: string;
  wallId: string;
  axis: EdgeAxis;
  grabOffset: number;
  min: number;
  max: number;
}

export type WallDragAnchor = EdgeDragAnchor | PartitionDragAnchor;

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

export function snapToGrid(value: number, snapSize: number): number {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(snapSize) || snapSize <= 0) return value;
  return Math.round(value / snapSize) * snapSize;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createWallDragAnchor(
  house: House,
  wallId: string,
  groundHit: GroundPoint,
): WallDragAnchor | null {
  const wall = house.walls[wallId];
  if (!wall) return null;

  if (wall.partition && wall.roomId) {
    const room = house.rooms[wall.roomId];
    if (!room || room.notch) return null;
    const span = wallSpan(wall);
    if (!span) return null;
    if (span.run === "z") {
      // Wall runs along z: it slides along x.
      return {
        kind: "partition",
        roomId: wall.roomId,
        wallId: wall.id,
        axis: "x",
        grabOffset: span.coord - groundHit.x,
        min: room.position.x,
        max: room.position.x + room.width,
      };
    }
    // Wall runs along x: it slides along z.
    return {
      kind: "partition",
      roomId: wall.roomId,
      wallId: wall.id,
      axis: "z",
      grabOffset: span.coord - groundHit.z,
      min: room.position.z,
      max: room.position.z + room.depth,
    };
  }

  const target = findRoomEdgeForWall(house, wallId);
  if (!target) return null;
  const room = house.rooms[target.roomId];
  if (!room) return null;
  const axis = edgeAxis(target.edge);
  const edgeCoord = edgeCoordinate(room, target.edge);
  const hit = axis === "x" ? groundHit.x : groundHit.z;
  return {
    kind: "edge",
    roomId: target.roomId,
    edge: target.edge,
    axis,
    edgeCoord,
    grabOffset: edgeCoord - hit,
  };
}

export function resolveWallDrag(
  anchor: WallDragAnchor,
  groundHit: GroundPoint,
  snapSize: number,
): number {
  const hit = anchor.axis === "x" ? groundHit.x : groundHit.z;
  if (!Number.isFinite(hit)) {
    return anchor.kind === "edge"
      ? anchor.edgeCoord
      : (anchor.min + anchor.max) / 2;
  }
  const snapped = snapToGrid(hit + anchor.grabOffset, snapSize);
  return anchor.kind === "edge"
    ? snapped
    : clampValue(snapped, anchor.min, anchor.max);
}