import { Suspense, useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { HouseScene } from "./HouseScene";
import { Lighting } from "./Lighting";
import { TransformGizmo } from "./TransformGizmo";
import { PlacementController } from "./PlacementController";
import { PlacementPreview } from "./PlacementPreview";
import { CameraZoomBridge } from "./CameraZoomBridge";
import { WalkController } from "./WalkController";
import { useEditorStore } from "../store/editorStore";
import { useHouseStore } from "../store/houseStore";
import { SINGLE_ROOM_ID } from "../types/house";
import { DevBridge } from "../devBridge";

/** Fallback framing when there is no room to look at. */
const FALLBACK_TARGET: [number, number, number] = [0, 1.4, 0];
const FALLBACK_MAX_DISTANCE = 14;

export function Scene() {
  const walking = useEditorStore((s) => s.navigationMode === "walk");
  const rooms = useHouseStore((s) => s.house.rooms);

  // The designer lives inside a single room, so the orbit rig is framed on that
  // room and clamped so the camera never drifts out into an empty void.
  const framing = useMemo(() => {
    const room = rooms[SINGLE_ROOM_ID] ?? Object.values(rooms)[0];
    if (!room) {
      return { target: FALLBACK_TARGET, maxDistance: FALLBACK_MAX_DISTANCE };
    }
    const centerX = room.position.x + room.width / 2;
    const centerZ = room.position.z + room.depth / 2;
    const target: [number, number, number] = [
      centerX,
      room.height * 0.42,
      centerZ,
    ];
    const span = Math.max(room.width, room.depth);
    return {
      target,
      maxDistance: Math.max(FALLBACK_MAX_DISTANCE, span * 1.7),
    };
  }, [rooms]);

  return (
    <>
      <color attach="background" args={["#12161f"]} />
      <Lighting />
      <HouseScene />
      <TransformGizmo />
      <PlacementController />
      <Suspense fallback={null}>
        <PlacementPreview />
      </Suspense>
      {import.meta.env.DEV ? <DevBridge /> : null}
      <OrbitControls
        makeDefault
        enabled={!walking}
        target={framing.target}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={0.8}
        maxDistance={framing.maxDistance}
      />
      <WalkController />
      <CameraZoomBridge />
    </>
  );
}
