import { useSyncExternalStore } from "react";
import { SNAP_OPTIONS, useEditorStore, type Tool } from "../store/editorStore";
import { useHouseStore } from "../store/houseStore";
import { getHistoryFlags, subscribeHistory } from "../store/history";
import { firstWallUser } from "../geometry/roomGeometry";
import { zoomCamera } from "../interaction/cameraZoom";
import { DesignControls } from "./DesignControls";
import { Icon, type IconName } from "./Icon";
import type { RoomId } from "../types/house";

const TOOLS: { id: Tool; label: string; icon: IconName; compact?: boolean }[] = [
  { id: "select", label: "Select", icon: "cursor" },
  { id: "drawRoom", label: "Draw room", icon: "room", compact: true },
  { id: "drawWall", label: "Draw wall", icon: "wall", compact: true },
  { id: "placeObject", label: "Place object", icon: "place" },
];

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
  const history = useSyncExternalStore(
    subscribeHistory,
    getHistoryFlags,
    getHistoryFlags,
  );

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
      <span className="toolbar-title">
        <Icon name="home" size={15} />
        <span className="toolbar-title-text">True Home Designer</span>
      </span>
      <span className="toolbar-sep" />
      <DesignControls />
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <button
          disabled={!history.canUndo}
          onClick={() => useHouseStore.getState().undo()}
          title="Undo the last edit (Ctrl+Z)"
        >
          <Icon name="undo" size={13} />
          Undo
        </button>
        <button
          disabled={!history.canRedo}
          onClick={() => useHouseStore.getState().redo()}
          title="Redo the last undone edit (Ctrl+Shift+Z)"
        >
          <Icon name="redo" size={13} />
          Redo
        </button>
      </div>
      <span className="toolbar-sep" />
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
            <Icon name={entry.icon} size={13} />
            {entry.compact ? null : entry.label}
          </button>
        ))}
        <button onClick={createRoom} title="Add a new room beside the selection">
          <Icon name="roomAdd" size={13} />
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
          <Icon name="door" size={13} />
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
          <Icon name="window" size={13} />
          Add window
        </button>
      </div>
      <span className="toolbar-spacer" />
      <div className="toolbar-group">
        <label className="toolbar-snap" title="Grid snapping for wall drags">
          <Icon name="magnet" size={13} />
          Snap
          <select
            value={snapSize}
            onChange={(event) => setSnapSize(Number(event.target.value))}
          >
            {SNAP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} m
              </option>
            ))}
          </select>
        </label>
        <span className="toolbar-sep" />
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
          <Icon name="layers" size={13} />
          {ceilingVisible ? "Hide ceiling" : "Show ceiling"}
        </button>
        <button
          onClick={() => zoomCamera(1)}
          disabled={viewMode !== "3d"}
          title={
            viewMode === "3d"
              ? "Zoom the view in ( + )"
              : "Zoom is available in the 3D view"
          }
        >
          <Icon name="zoomIn" size={13} />
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
          <Icon name="zoomOut" size={13} />
          Zoom out
        </button>
        <div className="seg" role="group" aria-label="View mode">
          <button
            className={viewMode === "3d" ? "active" : ""}
            title="Switch to the 3D view"
            onClick={() => setViewMode("3d")}
          >
            <Icon name="cube" size={13} />
            3D view
          </button>
          <button
            className={viewMode === "2d" ? "active" : ""}
            title="Switch to the 2D floor plan"
            onClick={() => setViewMode("2d")}
          >
            <Icon name="plan" size={13} />
            2D plan
          </button>
        </div>
      </div>
    </header>
  );
}
