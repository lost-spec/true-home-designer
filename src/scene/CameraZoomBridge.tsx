import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { registerCameraZoom, type CameraZoomControls } from "../interaction/cameraZoom";

export function CameraZoomBridge() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as
    | CameraZoomControls
    | null;

  useEffect(() => {
    registerCameraZoom(camera, controls ?? null);
    return () => registerCameraZoom(camera, null);
  }, [camera, controls]);

  return null;
}