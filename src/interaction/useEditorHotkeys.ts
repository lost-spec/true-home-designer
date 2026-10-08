import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";
import { useHouseStore } from "../store/houseStore";
import { assetRegistry } from "../assets/registry";
import { rotateObjectY, stepObjectElevation } from "./objectInteraction";
import { zoomCamera } from "./cameraZoom";
import { cancelActiveObjectDrag } from "./useObjectDrag";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useEditorHotkeys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const editor = useEditorStore.getState();

      if (event.key === "Escape") {
        cancelActiveObjectDrag();
        if (editor.tool === "placeObject" || editor.placingAssetId) {
          editor.setTool("select");
        } else {
          editor.select(null);
        }
        return;
      }

      if (event.key === "r" || event.key === "R") {
        const direction = event.shiftKey ? -1 : 1;

        if (editor.tool === "placeObject" && editor.placingAssetId) {
          const asset = assetRegistry.get(editor.placingAssetId);
          editor.setPlacingRotationY(
            rotateObjectY(
              editor.placingRotationY,
              direction,
              asset?.allowRotation ?? true,
            ),
          );
          event.preventDefault();
          return;
        }

        const selection = editor.selection;
        if (selection?.kind === "object") {
          const store = useHouseStore.getState();
          const object = store.house.objects[selection.id];
          if (!object) return;
          const asset = assetRegistry.get(object.assetId);
          store.updatePlacedObject(object.id, {
            rotationY: rotateObjectY(
              object.rotationY,
              direction,
              asset?.allowRotation ?? true,
            ),
          });
          event.preventDefault();
        }
        return;
      }

      if (event.key === "PageUp" || event.key === "PageDown") {
        const selection = editor.selection;
        if (selection?.kind !== "object") return;
        const store = useHouseStore.getState();
        const object = store.house.objects[selection.id];
        if (!object) return;
        const direction = event.key === "PageUp" ? 1 : -1;
        store.updatePlacedObject(object.id, {
          position: {
            ...object.position,
            y: stepObjectElevation(object.position.y, direction),
          },
        });
        event.preventDefault();
        return;
      }

      if (
        event.key === "+" ||
        event.key === "=" ||
        event.code === "NumpadAdd"
      ) {
        if (zoomCamera(1)) event.preventDefault();
        return;
      }

      if (
        event.key === "-" ||
        event.key === "_" ||
        event.code === "NumpadSubtract"
      ) {
        if (zoomCamera(-1)) event.preventDefault();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        const selection = editor.selection;
        if (selection?.kind === "object") {
          useHouseStore.getState().removePlacedObject(selection.id);
          editor.select(null);
          event.preventDefault();
        } else if (selection?.kind === "opening") {
          useHouseStore.getState().removeOpening(selection.id);
          editor.select(null);
          event.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
