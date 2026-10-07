import * as THREE from "three";

export const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const scratch = new THREE.Vector3();

export function clientToNdc(
  dom: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = dom.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
}

export function groundHitFromClient(
  camera: THREE.Camera,
  dom: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; z: number } | null {
  const point = clientToNdc(dom, clientX, clientY);
  ndc.set(point.x, point.y);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.ray.intersectPlane(GROUND_PLANE, scratch);
  if (!hit) return null;
  return { x: hit.x, z: hit.z };
}

export function projectToClient(
  camera: THREE.Camera,
  dom: HTMLElement,
  x: number,
  y: number,
  z: number,
): { x: number; y: number } | null {
  const rect = dom.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  scratch.set(x, y, z).project(camera);
  if (scratch.z > 1) return null;
  return {
    x: rect.left + ((scratch.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - scratch.y) / 2) * rect.height,
  };
}
