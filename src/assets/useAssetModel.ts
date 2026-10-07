import { useGLTF } from "@react-three/drei";

export function preloadAsset(modelPath: string): void {
  useGLTF.preload(modelPath);
}

export function useAssetModel(modelPath: string) {
  const { scene } = useGLTF(modelPath);
  return scene;
}
