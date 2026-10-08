import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";
import { useHouseStore } from "../store/houseStore";
import {
  beginHistoryBatch,
  endHistoryBatch,
  forceEndHistoryBatches,
  undoRedoAction,
} from "../store/history";
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
    // Codes (not keys) that opened a history batch on their first keydown, so
    // OS key-repeat collapses into one history entry per held key.
    const heldBatchCodes = new Set<string>();

    const beginKeyBatch = (code: string) => {
      if (heldBatchCodes.has(code)) return;
      heldBatchCodes.add(code);
      beginHistoryBatch();
    };
    const endKeyBatch = (code: string) => {
      if (!heldBatchCodes.delete(code)) return;
      endHistoryBatch();
    };
    const releaseKeyBatches = () => {
      for (const code of [...heldBatchCodes]) endKeyBatch(code);
      forceEndHistoryBatches();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const undoRedo = undoRedoAction(event);
      if (undoRedo) {
        event.preventDefault();
        const store = useHouseStore.getState();
        if (undoRedo === "redo") store.redo();
        else store.undo();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

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
          beginKeyBatch(event.code);
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
        beginKeyBatch(event.code);
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

    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.code === "KeyR" ||
        event.code === "PageUp" ||
        event.code === "PageDown"
      ) {
        endKeyBatch(event.code);
      }
    };

    // A lost window means the matching keyup may never arrive; close every
    // open batch so undo can never be blocked by a leaked one.
    const onWindowBlur = () => releaseKeyBatches();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      releaseKeyBatches();
    };
  }, []);
}
