import { useHouseStore, type RoomDimensionsPatch } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { beginHistoryBatch, endHistoryBatch } from "../store/history";
import { firstWallUser } from "../geometry/roomGeometry";
import type { RoomId } from "../types/house";

interface DimensionField {
  key: keyof RoomDimensionsPatch;
  label: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: DimensionField[] = [
  { key: "width", label: "Width (m)", min: 1, max: 60, step: 0.1 },
  { key: "depth", label: "Depth (m)", min: 1, max: 60, step: 0.1 },
  { key: "height", label: "Wall height (m)", min: 1.5, max: 6, step: 0.05 },
  {
    key: "wallThickness",
    label: "Wall thickness (m)",
    min: 0.05,
    max: 0.5,
    step: 0.01,
  },
];

// Editing one field from focus to blur is a single undo step, no matter how
// many keystrokes it takes.
const historyBatchProps = {
  onFocus: () => beginHistoryBatch(),
  onBlur: () => endHistoryBatch(),
};

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
    <section className="panel-section">
      <h2>Room dimensions</h2>
      <p className="panel-hint">{room.name}</p>
      {FIELDS.map((field) => (
        <label key={field.key} className="dimension-row">
          <span>{field.label}</span>
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={room[field.key] ?? ""}
            {...historyBatchProps}
            onChange={(event) => change(field.key, event.target.value)}
          />
        </label>
      ))}
      <label className="position-row">
        <span>Position X (m)</span>
        <input
          type="number"
          step={0.1}
          value={room.position.x}
          {...historyBatchProps}
          onChange={(event) => changePosition("x", event.target.value)}
        />
      </label>
      <label className="position-row">
        <span>Position Z (m)</span>
        <input
          type="number"
          step={0.1}
          value={room.position.z}
          {...historyBatchProps}
          onChange={(event) => changePosition("z", event.target.value)}
        />
      </label>
    </section>
  );
}
