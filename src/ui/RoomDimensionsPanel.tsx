import { useHouseStore, type RoomDimensionsPatch } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { firstWallUser } from "../geometry/roomGeometry";
import { NumberField } from "./NumberField";
import { Section } from "./Section";
import type { RoomId } from "../types/house";

interface DimensionField {
  key: keyof RoomDimensionsPatch;
  label: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: DimensionField[] = [
  { key: "width", label: "Width", min: 1, max: 60, step: 0.1 },
  { key: "depth", label: "Depth", min: 1, max: 60, step: 0.1 },
  { key: "height", label: "Wall height", min: 1.5, max: 6, step: 0.05 },
  {
    key: "wallThickness",
    label: "Wall thickness",
    min: 0.05,
    max: 0.5,
    step: 0.01,
  },
];

export function RoomDimensionsPanel() {
  const selection = useEditorStore((s) => s.selection);
  const house = useHouseStore((s) => s.house);
  const setRoomDimensions = useHouseStore((s) => s.setRoomDimensions);
  const setRoomPosition = useHouseStore((s) => s.setRoomPosition);

  let roomId: RoomId | undefined;
  if (selection?.kind === "room" && house.rooms[selection.id]) {
    roomId = selection.id;
  } else if (selection?.kind === "wall") {
    roomId = firstWallUser(house, selection.id)?.roomId;
  } else if (selection?.kind === "opening") {
    const opening = house.openings[selection.id];
    if (opening) roomId = firstWallUser(house, opening.wallId)?.roomId;
  }
  if (!roomId || !house.rooms[roomId]) {
    roomId = Object.keys(house.rooms)[0];
  }
  const room = roomId ? house.rooms[roomId] : undefined;

  if (!room) return null;

  const change = (key: keyof RoomDimensionsPatch, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setRoomDimensions(room.id, { [key]: value });
  };

  const changePosition = (axis: "x" | "z", raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setRoomPosition(
      room.id,
      axis === "x" ? value : room.position.x,
      axis === "z" ? value : room.position.z,
    );
  };

  return (
    <Section title="Room dimensions" hint={room.name}>
      {FIELDS.map((field) => (
        <NumberField
          key={field.key}
          className="dimension-row"
          label={field.label}
          unit="m"
          value={room[field.key] ?? 0}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(raw) => change(field.key, raw)}
        />
      ))}
      <NumberField
        className="position-row"
        label="Position X"
        unit="m"
        value={room.position.x}
        min={-10000}
        max={10000}
        step={0.1}
        onChange={(raw) => changePosition("x", raw)}
      />
      <NumberField
        className="position-row"
        label="Position Z"
        unit="m"
        value={room.position.z}
        min={-10000}
        max={10000}
        step={0.1}
        onChange={(raw) => changePosition("z", raw)}
      />
    </Section>
  );
}
