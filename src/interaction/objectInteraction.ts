import type { Vec2 } from "../types/house";
import { snapToGrid, type GroundPoint } from "./wallInteraction";

export const ROTATE_STEP = Math.PI / 4;
export const CLICK_DRIFT_PX = 5;

export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const full = Math.PI * 2;
  const wrapped = angle % full;
  return wrapped < 0 ? wrapped + full : wrapped;
}

export function snapObjectPosition(
  x: number,
  z: number,
  snapSize: number,
): Vec2 {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  return { x: snapToGrid(x, snapSize), z: snapToGrid(z, snapSize) };
}

export function resolveObjectMove(
  ground: GroundPoint,
  grabOffset: Vec2,
  snapSize: number,
): Vec2 {
  return snapObjectPosition(
    ground.x - grabOffset.x,
    ground.z - grabOffset.z,
    snapSize,
  );
}

export function rotateObjectY(
  currentY: number,
  direction: 1 | -1,
  allowRotation = true,
): number {
  const base = normalizeAngle(currentY);
  if (!allowRotation) return base;
  return normalizeAngle(base + direction * ROTATE_STEP);
}

export function isPlacementActive(
  state: { tool: string; placingAssetId: string | null },
): boolean {
  return state.tool === "placeObject" && state.placingAssetId !== null;
}
