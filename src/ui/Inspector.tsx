import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { wallLength } from "../types/house";
import { wallUsers } from "../geometry/roomGeometry";
import { assetRegistry } from "../assets/registry";
import { rotateObjectY } from "../interaction/objectInteraction";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="inspector-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const metres = (value: number) => `${value.toFixed(2)} m`;

export function Inspector() {
  const selection = useEditorStore((s) => s.selection);
  const house = useHouseStore((s) => s.house);

  if (!selection) {
    return (
      <div className="inspector-empty">
        Nothing selected.
        <br />
        Click a wall, door, window, floor or object in the viewport.
      </div>
    );
  }

  if (selection.kind === "wall") {
    const wall = house.walls[selection.id];
    if (!wall) return null;
    const openingCount = Object.values(house.openings).filter(
      (o) => o.wallId === wall.id,
    ).length;
    const users = wallUsers(house, wall.id);
    const roomNames = users
      .map((user) => house.rooms[user.roomId]?.name ?? user.roomId)
      .join(", ");
    return (
      <>
        <h2>Wall</h2>
        <Row label="Length" value={metres(wallLength(wall))} />
        <Row label="Height" value={metres(wall.height)} />
        <Row label="Thickness" value={metres(wall.thickness)} />
        <Row label="Rooms" value={roomNames || "None"} />
        <Row label="Openings" value={String(openingCount)} />
        <Row
          label="Start"
          value={`(${wall.start.x.toFixed(1)}, ${wall.start.z.toFixed(1)})`}
        />
        <Row
          label="End"
          value={`(${wall.end.x.toFixed(1)}, ${wall.end.z.toFixed(1)})`}
        />
      </>
    );
  }

  if (selection.kind === "opening") {
    const opening = house.openings[selection.id];
    if (!opening) return null;
    return (
      <>
        <h2>{opening.kind === "door" ? "Door" : "Window"}</h2>
        <Row label="Width" value={metres(opening.width)} />
        <Row label="Height" value={metres(opening.height)} />
        <Row label="Sill height" value={metres(opening.sillHeight)} />
        <Row
          label="Offset along wall"
          value={metres(opening.offset)}
        />
      </>
    );
  }

  if (selection.kind === "room") {
    const room = house.rooms[selection.id];
    if (!room) return null;
    const sharedCount = Object.values(room.edges).filter(
      (wallId) => wallUsers(house, wallId).length > 1,
    ).length;
    return (
      <>
        <h2>Room</h2>
        <Row label="Name" value={room.name} />
        <Row label="Width" value={metres(room.width)} />
        <Row label="Depth" value={metres(room.depth)} />
        <Row
          label="Area"
          value={`${(room.width * room.depth).toFixed(1)} m²`}
        />
        <Row label="Walls" value={String(Object.keys(room.edges).length)} />
        <Row label="Shared walls" value={String(sharedCount)} />
      </>
    );
  }

  const object = house.objects[selection.id];
  if (!object) return null;
  const asset = assetRegistry.get(object.assetId);
  const allowRotation = asset?.allowRotation ?? true;
  const allowScaling = asset?.allowScaling ?? true;
  const rotate = (direction: 1 | -1) => {
    useHouseStore.getState().updatePlacedObject(object.id, {
      rotationY: rotateObjectY(object.rotationY, direction, allowRotation),
    });
  };
  const remove = () => {
    useHouseStore.getState().removePlacedObject(object.id);
    useEditorStore.getState().select(null);
  };
  return (
    <>
      <h2>Object</h2>
      <Row label="Asset" value={asset?.name ?? object.assetId} />
      <Row
        label="Position"
        value={`(${object.position.x.toFixed(1)}, ${object.position.z.toFixed(1)})`}
      />
      <Row
        label="Rotation Y"
        value={`${((object.rotationY * 180) / Math.PI).toFixed(0)}°`}
      />
      <Row label="Scale" value={`${object.scale.toFixed(2)}×`} />
      <Row label="Can rotate" value={allowRotation ? "Yes" : "No"} />
      <Row label="Can scale" value={allowScaling ? "Yes" : "No"} />
      <div className="inspector-actions">
        <button
          disabled={!allowRotation}
          title={
            allowRotation ? "Rotate 45° counter-clockwise" : "This asset cannot rotate"
          }
          onClick={() => rotate(-1)}
        >
          Rotate −45°
        </button>
        <button
          disabled={!allowRotation}
          title={allowRotation ? "Rotate 45° clockwise" : "This asset cannot rotate"}
          onClick={() => rotate(1)}
        >
          Rotate +45°
        </button>
        <button className="danger" title="Delete this object" onClick={remove}>
          Remove
        </button>
      </div>
    </>
  );
}
