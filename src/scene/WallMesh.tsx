import { useMemo } from "react";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import {
  getOpeningFillBox,
  getOpeningFrameBoxes,
  getWallBoxes,
  getWallPlacement,
  type BoxSpec,
} from "../geometry/wallGeometry";
import { useWallDrag } from "../interaction/useWallDrag";
import { useOpeningDrag } from "../interaction/useOpeningDrag";
import type { Opening } from "../types/house";

const WALL_COLOR = "#e9e4dc";
const WALL_SELECTED = "#5b9cff";
const DOOR_COLOR = "#8a5a2b";
const DOOR_FRAME_COLOR = "#5f3d1d";
const WINDOW_COLOR = "#a8dcff";
const WINDOW_FRAME_COLOR = "#d7e6f2";

interface OpeningMeshProps {
  opening: Opening;
  box: BoxSpec;
  frame: boolean;
  isSelected: boolean;
  onSelect: (event: { stopPropagation: () => void }) => void;
}

function OpeningMesh({
  opening,
  box,
  frame,
  isSelected,
  onSelect,
}: OpeningMeshProps) {
  const { onPointerDown } = useOpeningDrag(opening.id);
  const isDoor = opening.kind === "door";
  const isGlass = !isDoor && !frame;

  const color = isSelected
    ? WALL_SELECTED
    : frame
      ? isDoor
        ? DOOR_FRAME_COLOR
        : WINDOW_FRAME_COLOR
      : isDoor
        ? DOOR_COLOR
        : WINDOW_COLOR;

  return (
    <mesh
      name={`opening-${opening.id}`}
      position={box.position}
      castShadow={!isGlass}
      receiveShadow
      onPointerDown={onPointerDown}
      onClick={onSelect}
    >
      <boxGeometry args={box.size} />
      <meshStandardMaterial
        color={color}
        roughness={isDoor ? 0.7 : 0.2}
        metalness={isDoor ? 0 : 0.15}
        transparent={isGlass}
        opacity={isGlass ? 0.45 : 1}
      />
    </mesh>
  );
}

export function WallMesh({ wallId }: { wallId: string }) {
  const wall = useHouseStore((s) => s.house.walls[wallId]);
  const openingMap = useHouseStore((s) => s.house.openings);
  const select = useEditorStore((s) => s.select);
  const isSelected = useEditorStore(
    (s) => s.selection?.kind === "wall" && s.selection.id === wallId,
  );
  const selectedOpeningId = useEditorStore(
    (s) => (s.selection?.kind === "opening" ? s.selection.id : null),
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
  const frames = useMemo(
    () =>
      openings.flatMap((opening) =>
        getOpeningFrameBoxes(wall, opening).map((box) => ({ opening, box })),
      ),
    [wall, openings],
  );

  const { onPointerDown, onPointerOver, onPointerOut } = useWallDrag(wallId);

  const selectWall = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    const state = useEditorStore.getState();
    if (state.draggingWallId || state.draggingObjectId) return;
    if (state.draggingOpeningId) return;
    if (state.placingAssetId) return;
    select({ kind: "wall", id: wallId });
  };

  const selectOpening =
    (openingId: string) => (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      const state = useEditorStore.getState();
      if (state.draggingWallId || state.draggingObjectId) return;
      if (state.draggingOpeningId) return;
      if (state.placingAssetId) return;
      select({ kind: "opening", id: openingId });
    };

  return (
    <group
      name={wallId}
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
      onClick={selectWall}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
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
      {frames.map(({ opening, box }, index) => (
        <OpeningMesh
          key={`frame-${opening.id}-${index}`}
          opening={opening}
          box={box}
          frame
          isSelected={selectedOpeningId === opening.id}
          onSelect={selectOpening(opening.id)}
        />
      ))}
      {fills.map(({ opening, box }) => (
        <OpeningMesh
          key={`fill-${opening.id}`}
          opening={opening}
          box={box}
          frame={false}
          isSelected={selectedOpeningId === opening.id}
          onSelect={selectOpening(opening.id)}
        />
      ))}
    </group>
  );
}
