import { useCallback, useEffect } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { createWallDragAnchor, resolveWallDrag } from "./wallInteraction";
import { GROUND_PLANE, groundHitFromClient } from "./pointerProjection";
import { beginHistoryBatch, endHistoryBatch } from "../store/history";

const GUARD_FALLBACK_MS = 400;
const DRAG_THRESHOLD_PX = 4;
const rayPoint = new THREE.Vector3();

interface DragSession {
  wallId: string;
  finish: (clearGuard: boolean) => void;
}

let session: DragSession | null = null;

export function useWallDrag(wallId: string) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as {
    enabled: boolean;
  } | null;

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      if (useEditorStore.getState().tool !== "select") return;
      if (useEditorStore.getState().draggingOpeningId) return;
      if (session) session.finish(true);

      const house = useHouseStore.getState().house;
      const hit = event.ray.intersectPlane(GROUND_PLANE, rayPoint);
      if (!hit) return;

      const anchor = createWallDragAnchor(house, wallId, {
        x: hit.x,
        z: hit.z,
      });
      if (!anchor) return;

      event.stopPropagation();
      const down = {
        clientX: event.nativeEvent.clientX,
        clientY: event.nativeEvent.clientY,
      };
      const dom = gl.domElement;
      const previousCursor = document.body.style.cursor;

      let armed = false;
      let listenersActive = true;
      let guardTimer: number | null = null;

      const arm = () => {
        if (armed) return;
        armed = true;
        // One continuous drag (many pointermove commits) becomes one undo step.
        beginHistoryBatch();
        const editor = useEditorStore.getState();
        editor.select({ kind: "wall", id: wallId });
        editor.setDraggingWallId(wallId);
        if (controls) controls.enabled = false;
        document.body.style.cursor = "grabbing";
      };

      const clearGuard = () => {
        if (guardTimer !== null) {
          window.clearTimeout(guardTimer);
          guardTimer = null;
        }
        window.removeEventListener("click", handleClick);
        useEditorStore.getState().setDraggingWallId(null);
      };

      const finish = (clearGuardNow: boolean) => {
        if (listenersActive) {
          listenersActive = false;
          if (armed) {
            endHistoryBatch();
            if (controls) controls.enabled = true;
            document.body.style.cursor = previousCursor;
          }
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", handleUp);
          window.removeEventListener("pointercancel", handleCancel);
          window.removeEventListener("blur", handleBlur);
          if (clearGuardNow) {
            clearGuard();
            return;
          }
          if (armed) {
            guardTimer = window.setTimeout(clearGuard, GUARD_FALLBACK_MS);
          } else {
            clearGuard();
          }
          return;
        }
        if (clearGuardNow) clearGuard();
      };

      const handleClick = () => clearGuard();
      const handleUp = () => finish(false);
      const handleCancel = () => finish(true);
      const handleBlur = () => finish(true);

      const handleMove = (moveEvent: PointerEvent) => {
        if (!armed) {
          const dx = moveEvent.clientX - down.clientX;
          const dy = moveEvent.clientY - down.clientY;
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          arm();
        }
        const ground = groundHitFromClient(
          camera,
          dom,
          moveEvent.clientX,
          moveEvent.clientY,
        );
        if (!ground) return;
        const editor = useEditorStore.getState();
        // Holding Shift bypasses grid snapping.
        const snapSize = moveEvent.shiftKey ? 0 : editor.snapSize;
        const position = resolveWallDrag(anchor, ground, snapSize);
        if (anchor.kind === "partition") {
          useHouseStore.getState().movePartition(anchor.wallId, position);
        } else {
          useHouseStore.getState().moveRoomEdge(
            anchor.roomId,
            anchor.edge,
            position,
          );
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
      window.addEventListener("blur", handleBlur);
      window.addEventListener("click", handleClick);

      session = { wallId, finish };
    },
    [wallId, camera, gl, controls],
  );

  const onPointerOver = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.draggingWallId || state.draggingOpeningId) return;
    document.body.style.cursor = "grab";
  }, []);

  const onPointerOut = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.draggingWallId || state.draggingOpeningId) return;
    document.body.style.cursor = "";
  }, []);

  useEffect(
    () => () => {
      if (session && session.wallId === wallId) session.finish(true);
    },
    [wallId],
  );

  return { onPointerDown, onPointerOver, onPointerOut };
}