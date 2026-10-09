import { Canvas } from "@react-three/fiber";
import { Scene } from "./scene/Scene";
import { FloorPlan2D } from "./plan2d/FloorPlan2D";
import { Toolbar } from "./ui/Toolbar";
import { Inspector } from "./ui/Inspector";
import { AssetPanel } from "./ui/AssetPanel";
import { RoomDimensionsPanel } from "./ui/RoomDimensionsPanel";
import { Icon } from "./ui/Icon";
import { useEditorStore } from "./store/editorStore";
import { useHouseStore } from "./store/houseStore";
import { useEditorHotkeys } from "./interaction/useEditorHotkeys";
import { assetRegistry } from "./assets/registry";

function panelTitle(): string {
  const selection = useEditorStore.getState().selection;
  if (!selection) return "Inspector";
  if (selection.kind === "room") return "Room";
  if (selection.kind === "wall") return "Wall";
  if (selection.kind === "object") return "Object";
  const opening = useHouseStore.getState().house.openings[selection.id];
  if (opening?.kind === "window") return "Window";
  if (opening?.kind === "door") return "Door";
  return "Opening";
}

export default function App() {
  const select = useEditorStore((s) => s.select);
  const placingAssetId = useEditorStore((s) => s.placingAssetId);
  const viewMode = useEditorStore((s) => s.viewMode);
  const navigationMode = useEditorStore((s) => s.navigationMode);
  const toggleNavigationMode = useEditorStore((s) => s.toggleNavigationMode);
  const selection = useEditorStore((s) => s.selection);
  const rightPanelOpen = useEditorStore((s) => s.rightPanelOpen);
  // Re-evaluate the contextual title whenever the selection changes.
  const title = panelTitle();

  const walking = navigationMode === "walk";

  useEditorHotkeys();

  const toggleWalk = () => {
    const entering = !walking;
    toggleNavigationMode();
    if (!entering) return;
    // The click is a user gesture, so grab the pointer straight away.
    try {
      const canvas =
        document.querySelector<HTMLCanvasElement>(".viewport canvas");
      const result = canvas?.requestPointerLock?.() as unknown as
        | Promise<void>
        | undefined;
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {
      // Pointer lock is optional; WASD still works without it.
    }
  };

  const handlePointerMissed = () => {
    if (useEditorStore.getState().draggingWallId) return;
    if (useEditorStore.getState().draggingObjectId) return;
    if (useEditorStore.getState().draggingOpeningId) return;
    if (useEditorStore.getState().placingAssetId) return;
    select(null);
  };

  const placingAsset = placingAssetId
    ? assetRegistry.get(placingAssetId)
    : undefined;

  const isObject = selection?.kind === "object";
  const roomSection = <RoomDimensionsPanel />;
  const inspector = <Inspector />;

  // The contextual inspector always leads; room dimensions follow underneath.
  // Object editing hides the room block entirely.
  const panelBody = isObject ? (
    inspector
  ) : (
    <>
      {inspector}
      {roomSection}
    </>
  );

  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <AssetPanel />
        <div className="viewport">
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            camera={{ position: [9, 7, 9], fov: 50 }}
            onPointerMissed={handlePointerMissed}
            style={{ display: viewMode === "3d" ? undefined : "none" }}
          >
            <Scene />
          </Canvas>
          {viewMode === "3d" ? (
            <button
              type="button"
              className={walking ? "walk-toggle active" : "walk-toggle"}
              title={
                walking
                  ? "Leave walk mode (Esc)"
                  : "Walk through the design — WASD to move, mouse to look (F)"
              }
              onClick={toggleWalk}
            >
              <Icon name={walking ? "close" : "walk"} size={15} />
              {walking ? "Exit walk" : "Walk through"}
            </button>
          ) : null}
          {walking ? (
            <>
              <div className="walk-reticle" aria-hidden="true" />
              <div className="walk-hud" role="status">
                <span className="walk-hud-title">
                  <Icon name="walk" size={14} />
                  Walk mode
                </span>
                <span>
                  Move <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> · look
                  with the mouse
                </span>
                <span>
                  Run <kbd>Shift</kbd> · rise <kbd>E</kbd> · descend <kbd>Q</kbd>
                </span>
                <span>
                  Exit <kbd>Esc</kbd>
                </span>
              </div>
            </>
          ) : null}
          {viewMode === "2d" ? <FloorPlan2D /> : null}
          {placingAsset ? (
            <div className="placement-hint">
              {viewMode === "2d" ? "Click the plan" : "Click the floor"} to
              place the {placingAsset.name} · R to rotate · Esc to cancel
            </div>
          ) : null}
        </div>
        <aside
          className={rightPanelOpen ? "side-panel right" : "side-panel right collapsed"}
        >
          <div className="panel-header">
            <h2 className="panel-title">{title}</h2>
            <button
              type="button"
              className="panel-toggle"
              title={rightPanelOpen ? "Hide the inspector" : "Show the inspector"}
              aria-label={
                rightPanelOpen ? "Hide the inspector" : "Show the inspector"
              }
              onClick={() => useEditorStore.getState().toggleRightPanel()}
            >
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
          <div className="panel-body">{panelBody}</div>
        </aside>
      </div>
    </div>
  );
}
