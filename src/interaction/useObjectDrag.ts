import { useCallback, useEffect } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { resolveObjectMove } from "./objectInteraction";
import { GROUND_PLANE, groundHitFromClient } from "./pointerProjection";

const GUARD_FALLBACK_MS = 400;
const rayPoint = new THREE.Vector3();

interface ObjectDragSession {
  objectId: string;
  finish: (clearGuard: boolean) => void;
}

let session: ObjectDragSession | null = null;

export function cancelActiveObjectDrag(): void {
  if (session) session.finish(true);
}

export function useObjectDrag(objectId: string) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as {
    enabled: boolean;
  } | null;

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      const editor = useEditorStore.getState();
      if (editor.tool !== "select") return;
      if (editor.placingAssetId) return;
      if (session) session.finish(true);

      const object = useHouseStore.getState().house.objects[objectId];
      if (!object) return;

      const hit = event.ray.intersectPlane(GROUND_PLANE, rayPoint);
      if (!hit) return;

      event.stopPropagation();

      const grabOffset = {
        x: hit.x - object.position.x,
        z: hit.z - object.position.z,
      };
      const dom = gl.domElement;
      editor.select({ kind: "object", id: objectId });
      editor.setDraggingObjectId(objectId);

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
        const ground = groundHitFromClient(
          camera,
          dom,
          moveEvent.clientX,
          moveEvent.clientY,
        );
        if (!ground) return;
        const snapSize = useEditorStore.getState().snapSize;
        const position = resolveObjectMove(ground, grabOffset, snapSize);
        useHouseStore.getState().updatePlacedObject(objectId, {
          position: { x: position.x, y: object.position.y, z: position.z },
        });
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
      window.addEventListener("blur", handleBlur);
      window.addEventListener("click", handleClick);

      session = { objectId, finish };
    },
    [objectId, camera, gl, controls],
  );

  const onPointerOver = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.draggingObjectId || state.draggingWallId) return;
    if (state.tool !== "select" || state.placingAssetId) return;
    document.body.style.cursor = "grab";
  }, []);

  const onPointerOut = useCallback(() => {
    if (!useEditorStore.getState().draggingObjectId) {
      document.body.style.cursor = "";
    }
  }, []);

  useEffect(
    () => () => {
      if (session && session.objectId === objectId) session.finish(true);
    },
    [objectId],
  );

  return { onPointerDown, onPointerOver, onPointerOut };
}
