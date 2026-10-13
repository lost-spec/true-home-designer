import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { wallLength, type OpeningKind } from "../types/house";
import {
  DEFAULT_BASEBOARD_COLOR,
  DEFAULT_BASEBOARD_HEIGHT,
  DEFAULT_SURFACES,
  MAX_BASEBOARD_HEIGHT,
  MIN_BASEBOARD_HEIGHT,
} from "../types/house";
import { roomForWall, wallSpan } from "../geometry/roomGeometry";
import {
  MIN_OPENING_HEIGHT,
  MIN_OPENING_WIDTH,
} from "../geometry/openingGeometry";
import { assetRegistry } from "../assets/registry";
import { MaterialCustomizer } from "./MaterialCustomizer";
import { NumberField } from "./NumberField";
import { Icon } from "./Icon";
import { rotateObjectY, stepObjectElevation, zoomObjectScale, MAX_OBJECT_ELEVATION, MIN_OBJECT_ELEVATION, MAX_OBJECT_SCALE, MIN_OBJECT_SCALE } from "../interaction/objectInteraction";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="inspector-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const metres = (value: number) => `${value.toFixed(2)} m`;

function addOpeningToWall(wallId: string, kind: OpeningKind) {
  const id = useHouseStore.getState().createOpening(wallId, kind);
  if (id) useEditorStore.getState().select({ kind: "opening", id });
}

export function Inspector() {
  const selection = useEditorStore((s) => s.selection);
  const house = useHouseStore((s) => s.house);

  if (!selection) {
    return (
      <div className="inspector-empty empty-state">
        <div className="empty-state-icon">
          <Icon name="cursor" size={18} />
        </div>
        <p className="empty-state-title">Nothing selected</p>
        <p className="empty-state-hint">
          Click a wall, door, window, floor or object in the viewport.
        </p>
      </div>
    );
  }

  if (selection.kind === "wall") {
    const wall = house.walls[selection.id];
    if (!wall) return null;
    const openingCount = Object.values(house.openings).filter(
      (o) => o.wallId === wall.id,
    ).length;
    const owner = roomForWall(house, wall.id);
    const roomName = owner
      ? house.rooms[owner.roomId]?.name ?? owner.roomId
      : "None";
    const isPartition = wall.partition === true;
    const partitionOrientation = isPartition
      ? wallSpan(wall)?.run === "x"
        ? "Across depth"
        : "Across width"
      : null;
    const roomWall = owner
      ? house.rooms[owner.roomId]?.surfaces.wall ?? DEFAULT_SURFACES.wall
      : DEFAULT_SURFACES.wall;
    return (
      <>
        <Row label="Length" value={metres(wallLength(wall))} />
        <Row label="Height" value={metres(wall.height)} />
        <Row label="Thickness" value={metres(wall.thickness)} />
        <Row label="Room" value={roomName} />
        <Row label="Openings" value={String(openingCount)} />
        <Row
          label="Start"
          value={`(${wall.start.x.toFixed(1)}, ${wall.start.z.toFixed(1)})`}
        />
        <Row
          label="End"
          value={`(${wall.end.x.toFixed(1)}, ${wall.end.z.toFixed(1)})`}
        />
        {isPartition ? (
          <>
            <Row label="Type" value="Partition" />
            <Row label="Orientation" value={partitionOrientation ?? "—"} />
          </>
        ) : null}
        <div className="field-row colour-row">
          <span>Colour</span>
          <input
            type="color"
            title="Override this wall's colour"
            value={wall.color ?? roomWall}
            onChange={(event) =>
              useHouseStore.getState().setWallColor(wall.id, event.target.value)
            }
          />
          {wall.color !== undefined ? (
            <button
              className="text-reset"
              title="Use the room's wall colour again"
              onClick={() =>
                useHouseStore.getState().setWallColor(wall.id, null)
              }
            >
              Reset colour
            </button>
          ) : null}
        </div>
        <label className="field-row baseboard-row">
          <span>Skirting board</span>
          <input
            type="checkbox"
            checked={wall.baseboard !== null}
            title="Show a skirting board along this wall"
            onChange={(event) =>
              useHouseStore
                .getState()
                .setWallBaseboard(
                  wall.id,
                  event.target.checked
                    ? { height: DEFAULT_BASEBOARD_HEIGHT, color: DEFAULT_BASEBOARD_COLOR }
                    : null,
                )
            }
          />
        </label>
        {wall.baseboard !== null ? (
          <>
            <NumberField
              className="field-row"
              label="Skirting height"
              unit="m"
              value={wall.baseboard?.height ?? DEFAULT_BASEBOARD_HEIGHT}
              min={MIN_BASEBOARD_HEIGHT}
              max={Math.min(MAX_BASEBOARD_HEIGHT, wall.height)}
              step={0.01}
              onChange={(raw) => {
                const value = Number(raw);
                if (!Number.isFinite(value)) return;
                useHouseStore.getState().setWallBaseboard(wall.id, {
                  height: value,
                  color: wall.baseboard?.color ?? DEFAULT_BASEBOARD_COLOR,
                });
              }}
            />
            <div className="field-row colour-row">
              <span>Skirting colour</span>
              <input
                type="color"
                title="Colour of the skirting board"
                value={wall.baseboard?.color ?? DEFAULT_BASEBOARD_COLOR}
                onChange={(event) =>
                  useHouseStore.getState().setWallBaseboard(wall.id, {
                    height: wall.baseboard?.height ?? DEFAULT_BASEBOARD_HEIGHT,
                    color: event.target.value,
                  })
                }
              />
            </div>
          </>
        ) : null}
        {isPartition ? (
          <>
            <p className="panel-hint">
              Drag the partition in the viewport to slide it across the room.
              Hold Shift to move it freely without snapping.
            </p>
            <div className="inspector-actions">
              <button
                className="danger"
                title="Delete this partition wall"
                onClick={() => {
                  useHouseStore.getState().removePartition(wall.id);
                  useEditorStore
                    .getState()
                    .select({ kind: "room", id: wall.roomId ?? wall.id });
                }}
              >
                <Icon name="trash" size={13} />
                Remove partition
              </button>
            </div>
          </>
        ) : null}
        <div className="inspector-actions">
          <button
            title="Cut a door opening into this wall"
            onClick={() => addOpeningToWall(wall.id, "door")}
          >
            <Icon name="door" size={13} />
            Add door
          </button>
          <button
            title="Cut a window opening into this wall"
            onClick={() => addOpeningToWall(wall.id, "window")}
          >
            <Icon name="window" size={13} />
            Add window
          </button>
        </div>
      </>
    );
  }

  if (selection.kind === "opening") {
    const opening = house.openings[selection.id];
    if (!opening) return null;
    const wall = house.walls[opening.wallId];
    const runLength = wall ? wallLength(wall) : 0;
    const wallHeight = wall ? wall.height : 0;
    const isDoor = opening.kind === "door";

    const update = (
      key: "offset" | "width" | "height" | "sillHeight",
      raw: string,
    ) => {
      if (raw.trim() === "") return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      useHouseStore.getState().updateOpening(opening.id, { [key]: value });
    };

    const remove = () => {
      useHouseStore.getState().removeOpening(opening.id);
      useEditorStore.getState().select(null);
    };

    return (
      <>
        <Row label="Wall length" value={metres(runLength)} />
        <NumberField
          className="field-row"
          label="Offset along wall"
          unit="m"
          value={opening.offset}
          min={0}
          max={Math.max(0, runLength - opening.width)}
          step={0.05}
          onChange={(raw) => update("offset", raw)}
        />
        <NumberField
          className="field-row"
          label="Width"
          unit="m"
          value={opening.width}
          min={MIN_OPENING_WIDTH}
          max={Math.max(MIN_OPENING_WIDTH, runLength)}
          step={0.05}
          onChange={(raw) => update("width", raw)}
        />
        <NumberField
          className="field-row"
          label="Height"
          unit="m"
          value={opening.height}
          min={MIN_OPENING_HEIGHT}
          max={Math.max(MIN_OPENING_HEIGHT, wallHeight - opening.sillHeight)}
          step={0.05}
          onChange={(raw) => update("height", raw)}
        />
        {isDoor ? null : (
          <NumberField
            className="field-row"
            label="Sill height"
            unit="m"
            value={opening.sillHeight}
            min={0}
            max={Math.max(0, wallHeight - MIN_OPENING_HEIGHT)}
            step={0.05}
            onChange={(raw) => update("sillHeight", raw)}
          />
        )}
        <p className="panel-hint">
          Drag the {isDoor ? "door" : "window"} in the viewport to slide it
          along the wall. Values are limited so the opening stays inside the
          wall and clear of other openings.
        </p>
        <div className="inspector-actions">
          <button
            className="danger"
            title={`Delete this ${isDoor ? "door" : "window"} (Delete)`}
            onClick={remove}
          >
            <Icon name="trash" size={13} />
            Remove
          </button>
        </div>
      </>
    );
  }

  if (selection.kind === "room") {
    const room = house.rooms[selection.id];
    if (!room) return null;
    const notchArea = room.notch
      ? room.notch.width * room.notch.depth
      : 0;
    const area = room.width * room.depth - notchArea;
    return (
      <>
        <Row label="Name" value={room.name} />
        <Row label="Width" value={metres(room.width)} />
        <Row label="Depth" value={metres(room.depth)} />
        <Row label="Shape" value={room.notch ? "L-shape" : "Rectangle"} />
        <Row label="Area" value={`${area.toFixed(1)} m²`} />
        <Row
          label="Walls"
          value={String(Object.keys(room.edges).length + (room.notch ? 2 : 0))}
        />
      </>
    );
  }

  const object = house.objects[selection.id];
  if (!object) return null;
  const asset = assetRegistry.get(object.assetId);
  const allowRotation = asset?.allowRotation ?? true;
  const rotate = (direction: 1 | -1) => {
    useHouseStore.getState().updatePlacedObject(object.id, {
      rotationY: rotateObjectY(object.rotationY, direction, allowRotation),
    });
  };
  const elevate = (direction: 1 | -1) => {
    useHouseStore.getState().updatePlacedObject(object.id, {
      position: {
        ...object.position,
        y: stepObjectElevation(object.position.y, direction),
      },
    });
  };
  const zoom = (direction: 1 | -1) => {
    useHouseStore.getState().updatePlacedObject(object.id, {
      scale: zoomObjectScale(object.scale, direction),
    });
  };
  const remove = () => {
    useHouseStore.getState().removePlacedObject(object.id);
    useEditorStore.getState().select(null);
  };
  return (
    <>
      <Row label="Asset" value={asset?.name ?? object.assetId} />
      <Row
        label="Position"
        value={`(${object.position.x.toFixed(1)}, ${object.position.z.toFixed(1)})`}
      />
      <Row label="Height" value={metres(object.position.y)} />
      <Row
        label="Rotation Y"
        value={`${((object.rotationY * 180) / Math.PI).toFixed(0)}°`}
      />
      <Row label="Scale" value={`${object.scale.toFixed(2)}×`} />
      <Row label="Can rotate" value={allowRotation ? "Yes" : "No"} />
      <MaterialCustomizer objectId={object.id} assetId={object.assetId} />
      <div className="inspector-actions">
        <button
          disabled={object.position.y >= MAX_OBJECT_ELEVATION}
          title="Raise the object (PageUp)"
          onClick={() => elevate(1)}
        >
          <Icon name="up" size={13} />
          Raise
        </button>
        <button
          disabled={object.position.y <= MIN_OBJECT_ELEVATION}
          title="Lower the object (PageDown)"
          onClick={() => elevate(-1)}
        >
          <Icon name="down" size={13} />
          Lower
        </button>
        <button
          disabled={object.scale >= MAX_OBJECT_SCALE}
          title="Zoom the object in"
          onClick={() => zoom(1)}
        >
          <Icon name="plus" size={13} />
          Zoom +
        </button>
        <button
          disabled={object.scale <= MIN_OBJECT_SCALE}
          title="Zoom the object out"
          onClick={() => zoom(-1)}
        >
          <Icon name="minus" size={13} />
          Zoom −
        </button>
        <button
          disabled={!allowRotation}
          title={
            allowRotation ? "Rotate 45° counter-clockwise" : "This asset cannot rotate"
          }
          onClick={() => rotate(-1)}
        >
          <Icon name="rotate" size={13} />
          Rotate −45°
        </button>
        <button
          disabled={!allowRotation}
          title={allowRotation ? "Rotate 45° clockwise" : "This asset cannot rotate"}
          onClick={() => rotate(1)}
        >
          <Icon name="rotate" size={13} />
          Rotate +45°
        </button>
        <button
          title="Duplicate this object (Ctrl+D)"
          onClick={() => {
            const id = useHouseStore.getState().duplicatePlacedObject(object.id);
            if (id) useEditorStore.getState().select({ kind: "object", id });
          }}
        >
          <Icon name="copy" size={13} />
          Duplicate
        </button>
        <button
          title="Mirror this object across the room"
          onClick={() => useHouseStore.getState().mirrorPlacedObject(object.id)}
        >
          <Icon name="flip" size={13} />
          Mirror
        </button>
        <button className="danger" title="Delete this object" onClick={remove}>
          <Icon name="trash" size={13} />
          Remove
        </button>
      </div>
    </>
  );
}
