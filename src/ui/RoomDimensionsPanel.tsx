import { useHouseStore, type RoomDimensionsPatch } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";

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

export function RoomDimensionsPanel() {
  const selection = useEditorStore((s) => s.selection);
  const house = useHouseStore((s) => s.house);
  const setRoomDimensions = useHouseStore((s) => s.setRoomDimensions);

  const roomId =
    selection?.kind === "room" && house.rooms[selection.id]
      ? selection.id
      : Object.keys(house.rooms)[0];
  const room = roomId ? house.rooms[roomId] : undefined;

  if (!room) return null;

  const change = (key: keyof RoomDimensionsPatch, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setRoomDimensions(room.id, { [key]: value });
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
            onChange={(event) => change(field.key, event.target.value)}
          />
        </label>
      ))}
    </section>
  );
}
