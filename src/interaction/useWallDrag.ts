import { useCallback, useEffect } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import {
  createWallDragAnchor,
  findRoomEdgeForWall,
  resolveWallDrag,
} from "./wallInteraction";
import { GROUND_PLANE, groundHitFromClient } from "./pointerProjection";

const GUARD_FALLBACK_MS = 400;
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
      if (session) session.finish(true);

      const house = useHouseStore.getState().house;
      const target = findRoomEdgeForWall(house, wallId);
      if (!target) return;
      const room = house.rooms[target.roomId];
      if (!room) return;

      const hit = event.ray.intersectPlane(GROUND_PLANE, rayPoint);
      if (!hit) return;

      event.stopPropagation();

      const anchor = createWallDragAnchor(target, room, {
        x: hit.x,
        z: hit.z,
      });
      const dom = gl.domElement;
      const editor = useEditorStore.getState();
      editor.select({ kind: "wall", id: wallId });
      editor.setDraggingWallId(wallId);

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
        useEditorStore.getState().setDraggingWallId(null);
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
        const position = resolveWallDrag(anchor, ground, useEditorStore.getState().snapSize);
        useHouseStore.getState().moveRoomEdge(anchor.roomId, anchor.edge, position);
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
    if (!useEditorStore.getState().draggingWallId) {
      document.body.style.cursor = "grab";
    }
  }, []);

  const onPointerOut = useCallback(() => {
    if (!useEditorStore.getState().draggingWallId) {
      document.body.style.cursor = "";
    }
  }, []);

  useEffect(
    () => () => {
      if (session && session.wallId === wallId) session.finish(true);
    },
    [wallId],
  );

  return { onPointerDown, onPointerOver, onPointerOut };
}
