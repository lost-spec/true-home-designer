import { useCallback, useEffect, useMemo } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { assetRegistry } from "../assets/registry";
import { beginHistoryBatch, endHistoryBatch } from "../store/history";
import {
  ELEVATION_STEP,
  MAX_OBJECT_ELEVATION,
  MAX_OBJECT_SCALE,
  MIN_OBJECT_ELEVATION,
  MIN_OBJECT_SCALE,
  normalizeAngle,
  ROTATE_STEP,
} from "../interaction/objectInteraction";
import { snapToGrid } from "../interaction/wallInteraction";
import { groundHitFromClient, hitFromClient } from "../interaction/pointerProjection";
import type { PlacedObject } from "../types/house";

const GUARD_FALLBACK_MS = 400;

const AXIS_LENGTH = 0.55;
const AXIS_BASE = 0.16;
const CONE_LENGTH = 0.16;
const CONE_RADIUS = 0.05;
const SHAFT_RADIUS = 0.02;
const HIT_RADIUS = 0.09;
const RING_WIDTH = 0.07;
const GIZMO_Y = 0.02;
const SCALE_BOX = 0.1;

const COLOR_X = "#ff5f56";
const COLOR_Z = "#4d9eff";
const COLOR_Y = "#4bd24f";
const COLOR_ROTATE = "#ffd24d";
const COLOR_ROTATE_DISABLED = "#7a7f89";
const COLOR_SCALE = "#ffffff";
const COLOR_PIVOT = "#e8ebff";

type GizmoPatch = Partial<Omit<PlacedObject, "id">>;
type GizmoKind = "rotate" | "scale" | "x" | "y" | "z";

interface GizmoDragSession {
  objectId: string;
  finish: (clearGuard: boolean) => void;
}

let session: GizmoDragSession | null = null;

export function cancelActiveGizmoDrag(): void {
  if (session) session.finish(true);
}

interface AxisArrowProps {
  dir: [number, number, number];
  color: string;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (event: ThreeEvent<PointerEvent>) => void;
}

function AxisArrow({
  dir,
  color,
  onPointerDown,
  onPointerOver,
  onPointerOut,
}: AxisArrowProps) {
  const quaternion = useMemo(() => {
    const axis = new THREE.Vector3(...dir).normalize();
    if (axis.lengthSq() < 1e-8) return new THREE.Quaternion();
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      axis,
    );
  }, [dir]);

  const shaftLen = AXIS_LENGTH - CONE_LENGTH - AXIS_BASE;
  const shaftY = AXIS_BASE + shaftLen / 2;
  const coneY = AXIS_LENGTH - CONE_LENGTH / 2;
  const bodyLen = AXIS_LENGTH - AXIS_BASE;

  return (
    <group quaternion={quaternion}>
      <mesh
        position={[0, AXIS_BASE + bodyLen / 2, 0]}
        onPointerDown={onPointerDown}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        <cylinderGeometry args={[HIT_RADIUS, HIT_RADIUS, bodyLen, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, shaftY, 0]} renderOrder={10}>
        <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, shaftLen, 16]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <mesh position={[0, coneY, 0]} renderOrder={10}>
        <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 16]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  );
}

export function TransformGizmo() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as {
    enabled: boolean;
  } | null;

  const selection = useEditorStore((s) => s.selection);
  const tool = useEditorStore((s) => s.tool);
  const placingAssetId = useEditorStore((s) => s.placingAssetId);
  const navigationMode = useEditorStore((s) => s.navigationMode);

  const objectId = selection?.kind === "object" ? selection.id : null;
  const object = useHouseStore((s) =>
    objectId ? s.house.objects[objectId] : undefined,
  );

  const setCursor = useCallback(
    (cursor: string) => (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const state = useEditorStore.getState();
      if (
        state.draggingObjectId ||
        state.tool !== "select" ||
        state.placingAssetId ||
        state.navigationMode === "walk"
      ) {
        return;
      }
      document.body.style.cursor = cursor;
    },
    [],
  );

  const clearCursor = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (useEditorStore.getState().draggingObjectId) return;
    document.body.style.cursor = "";
  }, []);

  const startDrag = useCallback(
    (kind: GizmoKind) => (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      const editor = useEditorStore.getState();
      if (editor.tool !== "select" || editor.placingAssetId) return;
      if (editor.navigationMode === "walk") return;

      const store = useHouseStore.getState();
      const current = objectId ? store.house.objects[objectId] : undefined;
      if (!current) return;

      const asset = assetRegistry.get(current.assetId);
      const allowRotation = asset?.allowRotation ?? true;
      if (kind === "rotate" && !allowRotation) return;
      if (session) session.finish(true);

      event.stopPropagation();
      const dom = gl.domElement;
      const cx = current.position.x;
      const cz = current.position.z;

      const down = groundHitFromClient(camera, dom, event.clientX, event.clientY);

      let ok = true;
      let grabOffsetX = 0;
      let grabOffsetZ = 0;
      let verticalPlane: THREE.Plane | null = null;
      let startHitY = 0;
      let startAngle = 0;
      let startDist = 0;

      if (kind === "x") {
        if (!down) ok = false;
        else grabOffsetX = down.x - cx;
      } else if (kind === "z") {
        if (!down) ok = false;
        else grabOffsetZ = down.z - cz;
      } else if (kind === "y") {
        const dirX = cx - camera.position.x;
        const dirZ = cz - camera.position.z;
        const len = Math.hypot(dirX, dirZ);
        if (len < 1e-4) {
          ok = false;
        } else {
          const normal = new THREE.Vector3(dirX / len, 0, dirZ / len);
          verticalPlane = new THREE.Plane(normal, -normal.x * cx - normal.z * cz);
          const hit = hitFromClient(
            camera,
            dom,
            event.clientX,
            event.clientY,
            verticalPlane,
          );
          if (!hit) ok = false;
          else startHitY = hit.y;
        }
      } else if (kind === "rotate") {
        if (!down) ok = false;
        else startAngle = Math.atan2(down.x - cx, down.z - cz);
      } else {
        if (!down) ok = false;
        else startDist = Math.max(0.15, Math.hypot(down.x - cx, down.z - cz));
      }
      if (!ok) return;

      const startX = current.position.x;
      const startZ = current.position.z;
      const startY = current.position.y;
      const startRot = normalizeAngle(current.rotationY);
      const startScale = current.scale;
      const snapSize = useEditorStore.getState().snapSize;

      let moveCommit: ((clientX: number, clientY: number) => GizmoPatch | null) | null =
        null;

      if (kind === "x") {
        moveCommit = (clientX, clientY) => {
          const g = groundHitFromClient(camera, dom, clientX, clientY);
          if (!g) return null;
          return {
            position: {
              x: snapToGrid(g.x - grabOffsetX, snapSize),
              y: startY,
              z: startZ,
            },
          };
        };
      } else if (kind === "z") {
        moveCommit = (clientX, clientY) => {
          const g = groundHitFromClient(camera, dom, clientX, clientY);
          if (!g) return null;
          return {
            position: {
              x: startX,
              y: startY,
              z: snapToGrid(g.z - grabOffsetZ, snapSize),
            },
          };
        };
      } else if (kind === "y") {
        moveCommit = (clientX, clientY) => {
          if (!verticalPlane) return null;
          const hit = hitFromClient(camera, dom, clientX, clientY, verticalPlane);
          if (!hit) return null;
          const deltaY = hit.y - startHitY;
          let y = Math.round((startY + deltaY) / ELEVATION_STEP) * ELEVATION_STEP;
          if (!Number.isFinite(y)) return null;
          y = Math.min(MAX_OBJECT_ELEVATION, Math.max(MIN_OBJECT_ELEVATION, y));
          return { position: { x: startX, y, z: startZ } };
        };
      } else if (kind === "rotate") {
        moveCommit = (clientX, clientY) => {
          const g = groundHitFromClient(camera, dom, clientX, clientY);
          if (!g) return null;
          const angle = Math.atan2(g.x - cx, g.z - cz);
          let delta = angle - startAngle;
          if (delta > Math.PI) delta -= Math.PI * 2;
          else if (delta < -Math.PI) delta += Math.PI * 2;
          return {
            rotationY: normalizeAngle(
              startRot + Math.round(delta / ROTATE_STEP) * ROTATE_STEP,
            ),
          };
        };
      } else {
        moveCommit = (clientX, clientY) => {
          const g = groundHitFromClient(camera, dom, clientX, clientY);
          if (!g) return null;
          const dist = Math.max(0.15, Math.hypot(g.x - cx, g.z - cz));
          const raw = startScale * (dist / startDist);
          const stepped = Math.round(raw * 20) / 20;
          return {
            scale: Math.min(MAX_OBJECT_SCALE, Math.max(MIN_OBJECT_SCALE, stepped)),
          };
        };
      }

      beginHistoryBatch();
      editor.select({ kind: "object", id: current.id });
      editor.setDraggingObjectId(current.id);
      if (controls) controls.enabled = false;
      const previousCursor = document.body.style.cursor;
      document.body.style.cursor = "grabbing";

      let listenersActive = true;
      let guardTimer: number | null = null;

      const clearGuard = () => {
        if (guardTimer !== null) {
          window.clearTimeout(guardTimer);
          guardTimer = null;
        }
        window.removeEventListener("click", handleClick);
        useEditorStore.getState().setDraggingObjectId(null);
      };

      const finish = (clearGuardNow: boolean) => {
        if (listenersActive) {
          listenersActive = false;
          endHistoryBatch();
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", handleUp);
          window.removeEventListener("pointercancel", handleCancel);
          window.removeEventListener("blur", handleBlur);
          if (controls) controls.enabled = true;
          document.body.style.cursor = previousCursor;
          if (clearGuardNow) {
            clearGuard();
            return;
          }
          guardTimer = window.setTimeout(clearGuard, GUARD_FALLBACK_MS);
          return;
        }
        if (clearGuardNow) clearGuard();
      };

      const handleClick = () => clearGuard();
      const handleUp = () => finish(false);
      const handleCancel = () => finish(true);
      const handleBlur = () => finish(true);

      const handleMove = (moveEvent: PointerEvent) => {
        const patch = moveCommit?.(moveEvent.clientX, moveEvent.clientY);
        if (patch) {
          useHouseStore.getState().updatePlacedObject(current.id, patch);
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
      window.addEventListener("blur", handleBlur);
      window.addEventListener("click", handleClick);

      session = { objectId: current.id, finish };
    },
    [objectId, camera, gl, controls],
  );

  useEffect(
    () => () => {
      if (session && session.objectId === objectId) session.finish(true);
    },
    [objectId],
  );

  if (
    tool !== "select" ||
    placingAssetId ||
    navigationMode === "walk" ||
    selection?.kind !== "object"
  ) {
    return null;
  }
  if (!object) return null;

  const asset = assetRegistry.get(object.assetId);
  const allowRotation = asset?.allowRotation ?? true;
  const maxDim = Math.max(
    asset?.dimensions.width ?? 1,
    asset?.dimensions.depth ?? 1,
  );
  const half = maxDim * object.scale * 0.5;
  const ringRadius = half + 0.12 * object.scale + 0.16;

  return (
    <group
      name="transform-gizmo"
      position={[object.position.x, GIZMO_Y, object.position.z]}
    >
      <AxisArrow
        dir={[1, 0, 0]}
        color={COLOR_X}
        onPointerDown={startDrag("x")}
        onPointerOver={setCursor("ew-resize")}
        onPointerOut={clearCursor}
      />
      <AxisArrow
        dir={[0, 0, 1]}
        color={COLOR_Z}
        onPointerDown={startDrag("z")}
        onPointerOver={setCursor("ns-resize")}
        onPointerOut={clearCursor}
      />
      <AxisArrow
        dir={[0, 1, 0]}
        color={COLOR_Y}
        onPointerDown={startDrag("y")}
        onPointerOver={setCursor("ns-resize")}
        onPointerOut={clearCursor}
      />
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={9}
        onPointerDown={allowRotation ? startDrag("rotate") : undefined}
        onPointerOver={allowRotation ? setCursor("grab") : undefined}
        onPointerOut={clearCursor}
      >
        <ringGeometry args={[ringRadius, ringRadius + RING_WIDTH, 64]} />
        <meshBasicMaterial
          color={allowRotation ? COLOR_ROTATE : COLOR_ROTATE_DISABLED}
          transparent
          opacity={0.9}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        position={[ringRadius + RING_WIDTH + 0.04, 0.08, 0]}
        renderOrder={10}
        onPointerDown={startDrag("scale")}
        onPointerOver={setCursor("nwse-resize")}
        onPointerOut={clearCursor}
      >
        <boxGeometry args={[SCALE_BOX, SCALE_BOX, SCALE_BOX]} />
        <meshBasicMaterial color={COLOR_SCALE} depthTest={false} />
      </mesh>
      <mesh position={[0, 0.04, 0]} renderOrder={10}>
        <sphereGeometry args={[0.05, 16, 12]} />
        <meshBasicMaterial
          color={COLOR_PIVOT}
          transparent
          opacity={0.5}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}