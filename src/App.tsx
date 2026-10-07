import { Canvas } from "@react-three/fiber";
import { Scene } from "./scene/Scene";
import { Toolbar } from "./ui/Toolbar";
import { Inspector } from "./ui/Inspector";
import { AssetPanel } from "./ui/AssetPanel";
import { RoomDimensionsPanel } from "./ui/RoomDimensionsPanel";
import { useEditorStore } from "./store/editorStore";

export default function App() {
  const select = useEditorStore((s) => s.select);

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
            onPointerMissed={() => select(null)}
          >
            <Scene />
          </Canvas>
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
