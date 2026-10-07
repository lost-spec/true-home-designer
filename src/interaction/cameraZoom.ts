import type * as THREE from "three";

export interface CameraZoomControls {
  target: THREE.Vector3;
  update: () => void;
  minDistance?: number;
  maxDistance?: number;
}

const ZOOM_FRACTION = 0.12;
const MIN_STEP = 0.2;

let camera: THREE.Camera | null = null;
let controls: CameraZoomControls | null = null;

export function registerCameraZoom(
  nextCamera: THREE.Camera,
  nextControls: CameraZoomControls | null,
): void {
  camera = nextCamera;
  controls = nextControls;
}

export function isCameraZoomAvailable(): boolean {
  return camera !== null && controls !== null;
}

export function zoomCamera(direction: 1 | -1): boolean {
  if (!camera || !controls) return false;
  const target = controls.target;
  const offset = camera.position.clone().sub(target);
  const distance = offset.length();
  if (!Number.isFinite(distance) || distance <= 1e-6) return false;
  const min = controls.minDistance ?? 0;
  const max = controls.maxDistance ?? Number.POSITIVE_INFINITY;
  const step = Math.max(distance * ZOOM_FRACTION, MIN_STEP);
  const next = Math.min(max, Math.max(min, distance - direction * step));
  offset.setLength(next);
  camera.position.copy(target).add(offset);
  controls.update();
  return true;
}