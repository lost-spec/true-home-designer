import { useEditorStore, type Tool } from "../store/editorStore";
import { useHouseStore } from "../store/houseStore";
import { firstWallUser } from "../geometry/roomGeometry";
import type { RoomId } from "../types/house";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "drawRoom", label: "Draw room" },
  { id: "drawWall", label: "Draw wall" },
  { id: "placeObject", label: "Place object" },
];

const SNAP_OPTIONS = [0.05, 0.1, 0.25, 0.5];

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const ceilingVisible = useEditorStore((s) => s.ceilingVisible);
  const toggleCeiling = useEditorStore((s) => s.toggleCeiling);
  const snapSize = useEditorStore((s) => s.snapSize);
  const setSnapSize = useEditorStore((s) => s.setSnapSize);
  const placingAssetId = useEditorStore((s) => s.placingAssetId);

  const createRoom = () => {
    const house = useHouseStore.getState().house;
    const selection = useEditorStore.getState().selection;
    let relativeTo: RoomId | undefined;
    if (selection?.kind === "room" && house.rooms[selection.id]) {
      relativeTo = selection.id;
    } else if (selection?.kind === "wall") {
      relativeTo = firstWallUser(house, selection.id)?.roomId;
    } else if (selection?.kind === "opening") {
      const opening = house.openings[selection.id];
      if (opening) relativeTo = firstWallUser(house, opening.wallId)?.roomId;
    }
    const id = useHouseStore.getState().addRoom({ relativeTo });
    useEditorStore.getState().select({ kind: "room", id });
  };

  return (
    <header className="toolbar">
      <span className="toolbar-title">True Home Designer</span>
      <div className="toolbar-group">
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            className={tool === entry.id ? "active" : ""}
            disabled={
              entry.id === "select"
                ? false
                : entry.id === "placeObject"
                  ? !placingAssetId && tool !== "placeObject"
                  : true
            }
            title={
              entry.id === "select"
                ? "Click geometry to select it"
                : entry.id === "placeObject"
                  ? placingAssetId
                    ? tool === "placeObject"
                      ? "Placing an asset — click to cancel"
                      : `Resume placing ${placingAssetId}`
                    : "Select an asset in the sidebar to place"
                  : "Coming in a later milestone"
            }
            onClick={() => {
              if (entry.id === "placeObject") {
                setTool(tool === "placeObject" ? "select" : "placeObject");
                return;
              }
              setTool(entry.id);
            }}
          >
            {entry.label}
          </button>
        ))}
        <button onClick={createRoom} title="Add a new room beside the selection">
          Create room
        </button>
      </div>
      <div className="toolbar-group">
        <label className="toolbar-snap">
          Snap
          <select
            value={snapSize}
            onChange={(event) => setSnapSize(Number(event.target.value))}
            title="Grid snapping for wall drags"
          >
            {SNAP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} m
              </option>
            ))}
          </select>
        </label>
        <button
          className={ceilingVisible ? "active" : ""}
          onClick={toggleCeiling}
          title="Toggle ceiling visibility"
        >
          {ceilingVisible ? "Hide ceiling" : "Show ceiling"}
        </button>
      </div>
    </header>
  );
}
