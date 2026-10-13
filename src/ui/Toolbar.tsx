import { useSyncExternalStore } from "react";
import { SNAP_OPTIONS, useEditorStore, type Tool } from "../store/editorStore";
import {
  LIGHTING_PRESETS,
  LIGHTING_PRESET_SPECS,
} from "../scene/lightingPresets";
import { useHouseStore } from "../store/houseStore";
import { getHistoryFlags, subscribeHistory } from "../store/history";
import { zoomCamera } from "../interaction/cameraZoom";
import { DesignControls } from "./DesignControls";
import { Icon, type IconName } from "./Icon";

const TOOLS: { id: Tool; label: string; icon: IconName }[] = [
  { id: "select", label: "Select", icon: "cursor" },
  { id: "placeObject", label: "Place object", icon: "place" },
];

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const ceilingVisible = useEditorStore((s) => s.ceilingVisible);
  const toggleCeiling = useEditorStore((s) => s.toggleCeiling);
  const snapSize = useEditorStore((s) => s.snapSize);
  const setSnapSize = useEditorStore((s) => s.setSnapSize);
  const lightingPreset = useEditorStore((s) => s.lightingPreset);
  const setLightingPreset = useEditorStore((s) => s.setLightingPreset);
  const placingAssetId = useEditorStore((s) => s.placingAssetId);
  const selection = useEditorStore((s) => s.selection);
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
          onClick={() => useEditorStore.getState().openStartScreen()}
          title="Pick a different room template"
        >
          <Icon name="home" size={13} />
          Templates
        </button>
      </div>
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
                : !placingAssetId && tool !== "placeObject"
            }
            title={
              entry.id === "select"
                ? "Click geometry to select it"
                : placingAssetId
                  ? tool === "placeObject"
                    ? "Placing an asset — click to cancel"
                    : `Resume placing ${placingAssetId}`
                  : "Select an asset in the sidebar to place"
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
            {entry.label}
          </button>
        ))}
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
        <label className="toolbar-snap" title="Lighting look for the interior">
          <Icon name="sun" size={13} />
          Light
          <select
            value={lightingPreset}
            onChange={(event) =>
              setLightingPreset(event.target.value as typeof lightingPreset)
            }
          >
            {LIGHTING_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {LIGHTING_PRESET_SPECS[preset].label}
              </option>
            ))}
          </select>
        </label>
        <span className="toolbar-sep" />
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
          title="Toggle ceiling visibility"
        >
          <Icon name="layers" size={13} />
          {ceilingVisible ? "Hide ceiling" : "Show ceiling"}
        </button>
        <button onClick={() => zoomCamera(1)} title="Zoom the view in ( + )">
          <Icon name="zoomIn" size={13} />
          Zoom in
        </button>
        <button onClick={() => zoomCamera(-1)} title="Zoom the view out ( − )">
          <Icon name="zoomOut" size={13} />
          Zoom out
        </button>
      </div>
    </header>
  );
}
