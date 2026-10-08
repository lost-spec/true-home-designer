import { Canvas } from "@react-three/fiber";
import { Scene } from "./scene/Scene";
import { FloorPlan2D } from "./plan2d/FloorPlan2D";
import { Toolbar } from "./ui/Toolbar";
import { Inspector } from "./ui/Inspector";
import { AssetPanel } from "./ui/AssetPanel";
import { RoomDimensionsPanel } from "./ui/RoomDimensionsPanel";
import { useEditorStore } from "./store/editorStore";
import { useEditorHotkeys } from "./interaction/useEditorHotkeys";
import { assetRegistry } from "./assets/registry";

export default function App() {
  const select = useEditorStore((s) => s.select);
  const placingAssetId = useEditorStore((s) => s.placingAssetId);
  const viewMode = useEditorStore((s) => s.viewMode);

  useEditorHotkeys();

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
          {viewMode === "2d" ? <FloorPlan2D /> : null}
          {placingAsset ? (
            <div className="placement-hint">
              {viewMode === "2d" ? "Click the plan" : "Click the floor"} to
              place the {placingAsset.name} · R to rotate · Esc to cancel
            </div>
          ) : null}
        </div>
        <aside className="side-panel right">
          <RoomDimensionsPanel />
          <h2>Inspector</h2>
          <Inspector />
        </aside>
      </div>
    </div>
  );
}
