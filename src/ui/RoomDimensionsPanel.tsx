import { useState } from "react";
import { useHouseStore, type RoomDimensionsPatch } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import {
  roomForWall,
  NOTCH_MIN,
  MIN_ROOM_SIZE,
  partitionWalls,
  wallSpan,
} from "../geometry/roomGeometry";
import { ROOM_TEMPLATES } from "../assets/roomTemplates";
import { NumberField } from "./NumberField";
import { Section } from "./Section";
import { Icon } from "./Icon";
import type { NotchCorner, RoomId, RoomSurfaces } from "../types/house";

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

const CORNERS: { id: NotchCorner; label: string }[] = [
  { id: "ne", label: "North-east" },
  { id: "nw", label: "North-west" },
  { id: "se", label: "South-east" },
  { id: "sw", label: "South-west" },
];

const SURFACES: { key: keyof RoomSurfaces; label: string }[] = [
  { key: "wall", label: "Walls" },
  { key: "floor", label: "Floor" },
  { key: "ceiling", label: "Ceiling" },
];

const HEIGHT_PRESETS = [2.7, 3.0, 3.4];
const THICKNESS_PRESETS = [0.1, 0.2, 0.3];

export function RoomDimensionsPanel() {
  const selection = useEditorStore((s) => s.selection);
  const house = useHouseStore((s) => s.house);
  const setRoomDimensions = useHouseStore((s) => s.setRoomDimensions);
  const setRoomNotch = useHouseStore((s) => s.setRoomNotch);
  const setRoomSurface = useHouseStore((s) => s.setRoomSurface);
  const applyRoomTemplate = useHouseStore((s) => s.applyRoomTemplate);
  const addPartition = useHouseStore((s) => s.addPartition);
  const removePartition = useHouseStore((s) => s.removePartition);
  const [templateId, setTemplateId] = useState(ROOM_TEMPLATES[0]?.id ?? "");

  let roomId: RoomId | undefined;
  if (selection?.kind === "room" && house.rooms[selection.id]) {
    roomId = selection.id;
  } else if (selection?.kind === "wall") {
    roomId = roomForWall(house, selection.id)?.roomId;
  } else if (selection?.kind === "opening") {
    const opening = house.openings[selection.id];
    if (opening) roomId = roomForWall(house, opening.wallId)?.roomId;
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

  const toggleNotch = () => {
    if (room.notch) {
      setRoomNotch(room.id, null);
      return;
    }
    setRoomNotch(room.id, {
      corner: "se",
      width: Math.max(NOTCH_MIN, room.width * 0.4),
      depth: Math.max(NOTCH_MIN, room.depth * 0.4),
    });
  };

  const notch = room.notch;
  const maxNotchWidth = Math.max(NOTCH_MIN, room.width - MIN_ROOM_SIZE);
  const maxNotchDepth = Math.max(NOTCH_MIN, room.depth - MIN_ROOM_SIZE);
  const partitions = roomId ? partitionWalls(house, roomId) : [];

  return (
    <>
      <Section title="Room size" hint={room.name}>
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
        <p className="panel-hint">Quick sizes</p>
        <div className="preset-row" role="group" aria-label="Ceiling height presets">
          {HEIGHT_PRESETS.map((height) => (
            <button
              key={height}
              type="button"
              className={room.height === height ? "active" : ""}
              title={`Set the wall height to ${height} m`}
              onClick={() => setRoomDimensions(room.id, { height })}
            >
              {height} m
            </button>
          ))}
        </div>
        <div className="preset-row" role="group" aria-label="Wall thickness presets">
          {THICKNESS_PRESETS.map((thickness) => (
            <button
              key={thickness}
              type="button"
              className={room.wallThickness === thickness ? "active" : ""}
              title={`Set the wall thickness to ${thickness} m`}
              onClick={() => setRoomDimensions(room.id, { wallThickness: thickness })}
            >
              {thickness} m
            </button>
          ))}
        </div>
      </Section>

      <Section title="Room shape" hint={notch ? "L-shaped" : "Rectangle"}>
        <button
          type="button"
          className={notch ? "active" : ""}
          title={notch ? "Return the room to a rectangle" : "Cut a corner out to make an L-shape"}
          onClick={toggleNotch}
        >
          {notch ? "Remove notch" : "Make L-shaped"}
        </button>
        {notch ? (
          <>
            <label className="field-row">
              <span>Notched corner</span>
              <select
                value={notch.corner}
                onChange={(event) =>
                  setRoomNotch(room.id, {
                    ...notch,
                    corner: event.target.value as NotchCorner,
                  })
                }
              >
                {CORNERS.map((corner) => (
                  <option key={corner.id} value={corner.id}>
                    {corner.label}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              className="dimension-row"
              label="Notch width"
              unit="m"
              value={notch.width}
              min={NOTCH_MIN}
              max={maxNotchWidth}
              step={0.1}
              onChange={(raw) => {
                const value = Number(raw);
                if (!Number.isFinite(value)) return;
                setRoomNotch(room.id, { ...notch, width: value });
              }}
            />
            <NumberField
              className="dimension-row"
              label="Notch depth"
              unit="m"
              value={notch.depth}
              min={NOTCH_MIN}
              max={maxNotchDepth}
              step={0.1}
              onChange={(raw) => {
                const value = Number(raw);
                if (!Number.isFinite(value)) return;
                setRoomNotch(room.id, { ...notch, depth: value });
              }}
            />
          </>
        ) : null}
      </Section>

      <Section title="Partitions">
        {room.notch ? (
          <p className="panel-hint">
            Partitions need a rectangular room — remove the notch first.
          </p>
        ) : (
          <>
            <p className="panel-hint">
              Add a partition to divide the room. Drag it in the viewport to
              slide it across; hold Shift to move freely without snapping.
            </p>
            <div
              className="preset-row"
              role="group"
              aria-label="Add partition"
            >
              <button
                type="button"
                title="Add a partition running across the room's width"
                onClick={() => {
                  const id = addPartition(room.id, "x");
                  if (id) {
                    useEditorStore.getState().select({ kind: "wall", id });
                  }
                }}
              >
                Across width
              </button>
              <button
                type="button"
                title="Add a partition running across the room's depth"
                onClick={() => {
                  const id = addPartition(room.id, "z");
                  if (id) {
                    useEditorStore.getState().select({ kind: "wall", id });
                  }
                }}
              >
                Across depth
              </button>
            </div>
            {partitions.length > 0 ? (
              <ul className="partition-list">
                {partitions.map((wall) => {
                  const orientation =
                    wallSpan(wall)?.run === "x"
                      ? "Across depth"
                      : "Across width";
                  return (
                    <li key={wall.id}>
                      <span>{orientation}</span>
                      <button
                        type="button"
                        className="danger"
                        title="Delete this partition"
                        onClick={() => {
                          removePartition(wall.id);
                          useEditorStore
                            .getState()
                            .select({ kind: "room", id: room.id });
                        }}
                      >
                        <Icon name="trash" size={13} />
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Finish">
        {SURFACES.map((surface) => (
          <label key={surface.key} className="field-row colour-row">
            <span>{surface.label}</span>
            <input
              type="color"
              value={room.surfaces[surface.key]}
              onChange={(event) =>
                setRoomSurface(room.id, surface.key, event.target.value)
              }
            />
          </label>
        ))}
      </Section>

      <Section title="Furniture template">
        <label className="field-row">
          <span>Template</span>
          <select
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {ROOM_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <p className="panel-hint">
          Applying a template resizes the room and replaces its furniture with a
          starter set for that room type.
        </p>
        <div className="inspector-actions">
          <button
            type="button"
            disabled={!templateId}
            title="Resize the room and fill it with this template's furniture"
            onClick={() => {
              applyRoomTemplate(templateId);
              useEditorStore.getState().select({ kind: "room", id: room.id });
            }}
          >
            Apply template
          </button>
        </div>
      </Section>
    </>
  );
}
