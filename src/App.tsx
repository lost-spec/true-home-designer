import { Canvas } from "@react-three/fiber";
import { Scene } from "./scene/Scene";
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

  useEditorHotkeys();

  const handlePointerMissed = () => {
    if (useEditorStore.getState().draggingWallId) return;
    if (useEditorStore.getState().draggingObjectId) return;
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
            shadows
            dpr={[1, 2]}
            camera={{ position: [9, 7, 9], fov: 50 }}
            onPointerMissed={handlePointerMissed}
          >
            <Scene />
          </Canvas>
          {placingAsset ? (
            <div className="placement-hint">
              Click the floor to place the {placingAsset.name} · R to rotate ·
              Esc to cancel
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
