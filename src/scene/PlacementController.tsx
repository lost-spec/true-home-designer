import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useEditorStore } from "../store/editorStore";
import { useHouseStore } from "../store/houseStore";
import { assetRegistry } from "../assets/registry";
import {
  CLICK_DRIFT_PX,
  normalizeAngle,
  snapObjectPosition,
} from "../interaction/objectInteraction";
import { groundHitFromClient } from "../interaction/pointerProjection";

export function PlacementController() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const active = useEditorStore(
    (s) => s.tool === "placeObject" && s.placingAssetId !== null,
  );
  const assetId = useEditorStore((s) => s.placingAssetId);

  useEffect(() => {
    if (!active || !assetId) return;

    const dom = gl.domElement;
    let downPoint: { x: number; y: number } | null = null;
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    const insideDom = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      // Hidden canvas (2D view): a zero-size rect would wrongly classify the
      // synthetic (0, 0) coordinates of element.click() as inside.
      if (rect.width <= 0 || rect.height <= 0) return false;
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    };

    const updateGhost = (clientX: number, clientY: number) => {
      if (!insideDom(clientX, clientY)) return;
      const hit = groundHitFromClient(camera, dom, clientX, clientY);
      if (!hit) return;
      const { snapSize, setGhostPosition } = useEditorStore.getState();
      setGhostPosition(snapObjectPosition(hit.x, hit.z, snapSize));
    };

    const seedGhost = () => {
      const rect = dom.getBoundingClientRect();
      updateGhost(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    };

    const handleMove = (event: PointerEvent) => {
      updateGhost(event.clientX, event.clientY);
    };

    const handleDown = (event: PointerEvent) => {
      if (event.button !== 0 || !insideDom(event.clientX, event.clientY)) {
        return;
      }
      downPoint = { x: event.clientX, y: event.clientY };
    };

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || !insideDom(event.clientX, event.clientY)) {
        return;
      }
      const drift = downPoint
        ? Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y)
        : 0;
      downPoint = null;
      if (drift > CLICK_DRIFT_PX) return;

      const editor = useEditorStore.getState();
      const assetId = editor.placingAssetId;
      if (editor.tool !== "placeObject" || !assetId) return;

      const hit = groundHitFromClient(camera, dom, event.clientX, event.clientY);
      if (!hit) return;

      const asset = assetRegistry.get(assetId);
      const position = snapObjectPosition(hit.x, hit.z, editor.snapSize);
      const rotationY = asset?.allowRotation
        ? normalizeAngle(editor.placingRotationY)
        : 0;

      const id = useHouseStore
        .getState()
        .createPlacedObject(assetId, position, rotationY);
      editor.setGhostPosition(position);
      editor.select({ kind: "object", id });

      // Swallow the click so the canvas never sees it: placement clicks must
      // not change selection, hit the UI layer, or fall through as pointer misses.
      event.stopPropagation();
    };

    seedGhost();
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerdown", handleDown);
    window.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("click", handleClick, true);
      document.body.style.cursor = previousCursor;
      const editor = useEditorStore.getState();
      editor.setGhostPosition(null);
      editor.setDraggingObjectId(null);
    };
  }, [active, assetId, camera, gl]);

  return null;
}
