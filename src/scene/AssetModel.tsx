import { Clone } from "@react-three/drei";
import { useAssetModel } from "../assets/useAssetModel";
import { assetRegistry } from "../assets/registry";

function UnknownAssetBox({ assetId }: { assetId: string }) {
  return (
    <group>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.6, 1, 0.6]} />
        <meshStandardMaterial
          color="#d946ef"
          wireframe
          emissive="#d946ef"
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#d946ef" emissive="#d946ef" emissiveIntensity={0.6} />
      </mesh>
      <group name={`unknown-asset-${assetId}`} />
    </group>
  );
}

function LoadedAsset({ modelPath }: { modelPath: string }) {
  const scene = useAssetModel(modelPath);
  return <Clone object={scene} castShadow receiveShadow />;
}

export function AssetModel({ assetId }: { assetId: string }) {
  const asset = assetRegistry.get(assetId);
  if (!asset) return <UnknownAssetBox assetId={assetId} />;
  return (
    <group position={[asset.footprintOffset.x, 0, asset.footprintOffset.z]}>
      <LoadedAsset modelPath={asset.modelPath} />
    </group>
  );
}
