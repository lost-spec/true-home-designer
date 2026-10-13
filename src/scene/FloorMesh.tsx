import { useMemo } from "react";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { getFloorBoxes } from "../geometry/floorGeometry";
import { towardSelection } from "./selectionColor";

export function FloorMesh({ roomId }: { roomId: string }) {
  const room = useHouseStore((s) => s.house.rooms[roomId]);
  const select = useEditorStore((s) => s.select);
  const isSelected = useEditorStore(
    (s) => s.selection?.kind === "room" && s.selection.id === roomId,
  );

  const boxes = useMemo(() => getFloorBoxes(room), [room]);
  const base = room.surfaces.floor;
  const color = isSelected ? towardSelection(base, 0.22) : base;

  return (
    <group
      name="room-floor"
      onClick={(event) => {
        event.stopPropagation();
        const state = useEditorStore.getState();
        if (state.draggingWallId || state.draggingObjectId) return;
        if (state.draggingOpeningId) return;
        if (state.placingAssetId) return;
        select({ kind: "room", id: roomId });
      }}
    >
      {boxes.map((box, index) => (
        <mesh key={index} position={box.position} receiveShadow>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
