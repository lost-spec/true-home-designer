import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useAssetModel } from "../assets/useAssetModel";
import { assetRegistry } from "../assets/registry";
import { useEditorStore } from "../store/editorStore";

function GhostModel({ modelPath }: { modelPath: string }) {
  const scene = useAssetModel(modelPath);

  const ghost = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const source = Array.isArray(node.material)
        ? node.material
        : [node.material];
      const materials = source.map((material) => {
        const copy = material.clone();
        copy.transparent = true;
        copy.opacity = 0.45;
        copy.depthWrite = false;
        return copy;
      });
      node.material = Array.isArray(node.material) ? materials : materials[0];
      node.castShadow = false;
      node.receiveShadow = false;
    });
    return clone;
  }, [scene]);

  useEffect(
    () => () => {
      ghost.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = Array.isArray(node.material)
          ? node.material
          : [node.material];
        for (const material of materials) material.dispose();
      });
    },
    [ghost],
  );

  return <primitive object={ghost} />;
}

export function PlacementPreview() {
  const assetId = useEditorStore((s) => s.placingAssetId);
  const position = useEditorStore((s) => s.ghostPosition);
  const rotationY = useEditorStore((s) => s.placingRotationY);

  const asset = assetId ? assetRegistry.get(assetId) : undefined;
  if (!assetId || !asset || !position) return null;

  const rotation = asset.allowRotation ? rotationY : 0;
  const radius =
    Math.max(asset.dimensions.width, asset.dimensions.depth) * 0.5 + 0.12;

  return (
    <group
      name="placement-preview"
      position={[position.x, 0, position.z]}
      rotation={[0, rotation, 0]}
    >
      <GhostModel modelPath={asset.modelPath} />
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius, radius + 0.06, 48]} />
        <meshBasicMaterial color="#5b9cff" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}
