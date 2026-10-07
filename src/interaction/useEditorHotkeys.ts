import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";
import { useHouseStore } from "../store/houseStore";
import { assetRegistry } from "../assets/registry";
import { rotateObjectY } from "./objectInteraction";
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

      if (event.key === "Delete" || event.key === "Backspace") {
        const selection = editor.selection;
        if (selection?.kind === "object") {
          useHouseStore.getState().removePlacedObject(selection.id);
          editor.select(null);
          event.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
