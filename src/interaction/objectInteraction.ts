import type { Vec2 } from "../types/house";
import { snapToGrid, type GroundPoint } from "./wallInteraction";

export const ROTATE_STEP = Math.PI / 4;
export const CLICK_DRIFT_PX = 5;
export const ELEVATION_STEP = 0.1;
export const MIN_OBJECT_ELEVATION = 0;
export const MAX_OBJECT_ELEVATION = 5;
export const ZOOM_STEP = 1.1;
export const MIN_OBJECT_SCALE = 0.25;
export const MAX_OBJECT_SCALE = 4;

export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const full = Math.PI * 2;
  const wrapped = angle % full;
  return wrapped < 0 ? wrapped + full : wrapped;
}

function roundTo(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function roundStep(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(4));
}

export function stepObjectElevation(
  currentY: number,
  direction: 1 | -1,
  step = ELEVATION_STEP,
): number {
  if (!Number.isFinite(currentY) || !Number.isFinite(step) || step <= 0) {
    return MIN_OBJECT_ELEVATION;
  }
  const next = roundStep(currentY + direction * step, step);
  return Math.min(MAX_OBJECT_ELEVATION, Math.max(MIN_OBJECT_ELEVATION, next));
}

export function zoomObjectScale(
  currentScale: number,
  direction: 1 | -1,
  factor = ZOOM_STEP,
): number {
  if (!Number.isFinite(currentScale) || currentScale <= 0) return 1;
  if (!Number.isFinite(factor) || factor <= 1) return currentScale;
  const next = direction >= 0 ? currentScale * factor : currentScale / factor;
  return roundTo(Math.min(MAX_OBJECT_SCALE, Math.max(MIN_OBJECT_SCALE, next)));
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
