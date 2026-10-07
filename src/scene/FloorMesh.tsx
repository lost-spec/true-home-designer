import { useMemo } from "react";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { getFloorBox } from "../geometry/floorGeometry";

const FLOOR_COLOR = "#cfc7ba";
const FLOOR_SELECTED = "#5b9cff";

export function FloorMesh({ roomId }: { roomId: string }) {
  const room = useHouseStore((s) => s.house.rooms[roomId]);
  const select = useEditorStore((s) => s.select);
  const isSelected = useEditorStore(
    (s) => s.selection?.kind === "room" && s.selection.id === roomId,
  );

  const box = useMemo(() => getFloorBox(room), [room]);

  return (
    <mesh
      name="room-floor"
      position={box.position}
      receiveShadow
      onClick={(event) => {
        event.stopPropagation();
        const state = useEditorStore.getState();
        if (state.draggingWallId || state.draggingObjectId) return;
        if (state.placingAssetId) return;
        select({ kind: "room", id: roomId });
      }}
    >
      <boxGeometry args={box.size} />
      <meshStandardMaterial
        color={isSelected ? FLOOR_SELECTED : FLOOR_COLOR}
        roughness={0.9}
      />
    </mesh>
  );
}
