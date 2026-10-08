import { Suspense } from "react";
import { Grid, OrbitControls } from "@react-three/drei";
import { HouseScene } from "./HouseScene";
import { Lighting } from "./Lighting";
import { PlacementController } from "./PlacementController";
import { PlacementPreview } from "./PlacementPreview";
import { CameraZoomBridge } from "./CameraZoomBridge";
import { DevBridge } from "../devBridge";

const TARGET: [number, number, number] = [0, 1, 0];

export function Scene() {
  return (
    <>
      <color attach="background" args={["#11151c"]} />
      <Lighting />
      <mesh
        name="ground"
        position={[0, -0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        raycast={() => null}
      >
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#262b33" roughness={1} metalness={0} />
      </mesh>
      <Grid
        cellSize={0.5}
        sectionSize={2.5}
        fadeDistance={45}
        position={[0, -0.01, 0]}
        infiniteGrid
      />
      <HouseScene />
      <PlacementController />
      <Suspense fallback={null}>
        <PlacementPreview />
      </Suspense>
      {import.meta.env.DEV ? <DevBridge /> : null}
<OrbitControls
        makeDefault
        target={TARGET}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={2}
        maxDistance={60}
      />
      <CameraZoomBridge />
    </>
  );
}
