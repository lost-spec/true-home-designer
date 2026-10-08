import { useCallback, useEffect } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { resolveOpeningOffset } from "./openingInteraction";
import { GROUND_PLANE, groundHitFromClient } from "./pointerProjection";
import { beginHistoryBatch, endHistoryBatch } from "../store/history";

const GUARD_FALLBACK_MS = 400;
const rayPoint = new THREE.Vector3();

interface DragSession {
  openingId: string;
  finish: (clearGuard: boolean) => void;
}

let session: DragSession | null = null;

/**
 * Slide an opening along its wall by dragging it in the viewport. The pointer
 * is projected onto the ground plane, resolved to a wall-local offset by the
 * pure helpers in openingInteraction, and committed through updateOpening —
 * which owns all validation, so a drag can never create an invalid opening.
 */
export function useOpeningDrag(openingId: string) {
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
      if (editor.draggingWallId || editor.draggingObjectId) return;
      if (session) session.finish(true);

      const house = useHouseStore.getState().house;
      const opening = house.openings[openingId];
      const wall = opening ? house.walls[opening.wallId] : undefined;
      if (!opening || !wall) return;

      const hit = event.ray.intersectPlane(GROUND_PLANE, rayPoint);
      if (!hit) return;

      event.stopPropagation();
      // One continuous drag (many pointermove commits) becomes one undo step.
      beginHistoryBatch();

      editor.select({ kind: "opening", id: openingId });
      editor.setDraggingOpeningId(openingId);

      const dom = gl.domElement;
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
        useEditorStore.getState().setDraggingOpeningId(null);
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
        const ground = groundHitFromClient(
          camera,
          dom,
          moveEvent.clientX,
          moveEvent.clientY,
        );
        if (!ground) return;
        const state = useHouseStore.getState();
        const current = state.house.openings[openingId];
        if (!current) {
          finish(true);
          return;
        }
        const currentWall = state.house.walls[current.wallId];
        if (!currentWall) {
          finish(true);
          return;
        }
        const others = Object.values(state.house.openings).filter(
          (other) => other.wallId === current.wallId && other.id !== openingId,
        );
        const offset = resolveOpeningOffset(
          currentWall,
          current,
          ground,
          useEditorStore.getState().snapSize,
          others,
        );
        state.updateOpening(openingId, { offset });
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
      window.addEventListener("blur", handleBlur);
      window.addEventListener("click", handleClick);

      session = { openingId, finish };
    },
    [openingId, camera, gl, controls],
  );

  useEffect(
    () => () => {
      if (session && session.openingId === openingId) session.finish(true);
    },
    [openingId],
  );

  return { onPointerDown };
}
