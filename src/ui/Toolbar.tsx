import { useEditorStore, type Tool } from "../store/editorStore";
import { useHouseStore } from "../store/houseStore";
import { firstWallUser } from "../geometry/roomGeometry";
import { zoomCamera } from "../interaction/cameraZoom";
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
  const selection = useEditorStore((s) => s.selection);
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);

  const selectedWallId =
    selection?.kind === "wall"
      ? selection.id
      : selection?.kind === "opening"
        ? useHouseStore.getState().house.openings[selection.id]?.wallId
        : undefined;

  const addOpening = (kind: "door" | "window") => {
    if (!selectedWallId) return;
    const id = useHouseStore.getState().createOpening(selectedWallId, kind);
    if (id) useEditorStore.getState().select({ kind: "opening", id });
  };

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
        <button
          disabled={!selectedWallId}
          title={
            selectedWallId
              ? "Cut a door opening into the selected wall"
              : "Select a wall first"
          }
          onClick={() => addOpening("door")}
        >
          Add door
        </button>
        <button
          disabled={!selectedWallId}
          title={
            selectedWallId
              ? "Cut a window opening into the selected wall"
              : "Select a wall first"
          }
          onClick={() => addOpening("window")}
        >
          Add window
        </button>
        <button
          onClick={() => setViewMode(viewMode === "3d" ? "2d" : "3d")}
          title={
            viewMode === "3d"
              ? "Switch to the 2D floor plan"
              : "Switch back to the 3D view"
          }
        >
          {viewMode === "3d" ? "2D plan" : "3D view"}
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
          disabled={viewMode !== "3d"}
          title={
            viewMode === "3d"
              ? "Toggle ceiling visibility"
              : "Ceiling control is available in the 3D view"
          }
        >
          {ceilingVisible ? "Hide ceiling" : "Show ceiling"}
        </button>
      </div>
      <div className="toolbar-group">
        <button
          onClick={() => zoomCamera(1)}
          disabled={viewMode !== "3d"}
          title={
            viewMode === "3d"
              ? "Zoom the view in ( + )"
              : "Zoom is available in the 3D view"
          }
        >
          Zoom in
        </button>
        <button
          onClick={() => zoomCamera(-1)}
          disabled={viewMode !== "3d"}
          title={
            viewMode === "3d"
              ? "Zoom the view out ( − )"
              : "Zoom is available in the 3D view"
          }
        >
          Zoom out
        </button>
      </div>
    </header>
  );
}
