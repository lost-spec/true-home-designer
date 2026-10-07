import { Grid, OrbitControls } from "@react-three/drei";
import { HouseScene } from "./HouseScene";

const TARGET: [number, number, number] = [0, 1, 0];

export function Scene() {
  return (
    <>
      <color attach="background" args={["#11151c"]} />
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[14, 20, 10]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-far={60}
      />
      <Grid
        cellSize={0.5}
        sectionSize={2.5}
        fadeDistance={45}
        position={[0, -0.01, 0]}
        infiniteGrid
      />
      <HouseScene />
      <OrbitControls
        makeDefault
        target={TARGET}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={2}
        maxDistance={60}
      />
    </>
  );
}
