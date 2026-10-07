import { useMemo } from "react";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { getOpeningFillBox, getWallBoxes, getWallPlacement } from "../geometry/wallGeometry";

const WALL_COLOR = "#e9e4dc";
const WALL_SELECTED = "#5b9cff";
const DOOR_COLOR = "#8a5a2b";
const WINDOW_COLOR = "#a8dcff";

export function WallMesh({ wallId }: { wallId: string }) {
  const wall = useHouseStore((s) => s.house.walls[wallId]);
  const openingMap = useHouseStore((s) => s.house.openings);
  const select = useEditorStore((s) => s.select);
  const isSelected = useEditorStore(
    (s) => s.selection?.kind === "wall" && s.selection.id === wallId,
  );

  const openings = useMemo(
    () =>
      Object.values(openingMap).filter(
        (opening) => opening.wallId === wallId,
      ),
    [openingMap, wallId],
  );

  const placement = useMemo(() => getWallPlacement(wall), [wall]);
  const boxes = useMemo(
    () => getWallBoxes(wall, openings),
    [wall, openings],
  );
  const fills = useMemo(
    () =>
      openings.map((opening) => ({
        opening,
        box: getOpeningFillBox(wall, opening),
      })),
    [wall, openings],
  );

  const selectWall = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    select({ kind: "wall", id: wallId });
  };

  return (
    <group
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
      onClick={selectWall}
    >
      {boxes.map((box, index) => (
        <mesh key={index} position={box.position} castShadow receiveShadow>
          <boxGeometry args={box.size} />
          <meshStandardMaterial
            color={isSelected ? WALL_SELECTED : WALL_COLOR}
            roughness={0.85}
          />
        </mesh>
      ))}
      {fills.map(({ opening, box }) => (
        <mesh
          key={opening.id}
          position={box.position}
          castShadow
          onClick={(event) => {
            event.stopPropagation();
            select({ kind: "opening", id: opening.id });
          }}
        >
          <boxGeometry args={box.size} />
          <meshStandardMaterial
            color={opening.kind === "door" ? DOOR_COLOR : WINDOW_COLOR}
            roughness={opening.kind === "door" ? 0.7 : 0.1}
            metalness={opening.kind === "door" ? 0 : 0.2}
            transparent={opening.kind === "window"}
            opacity={opening.kind === "window" ? 0.45 : 1}
          />
        </mesh>
      ))}
    </group>
  );
}
