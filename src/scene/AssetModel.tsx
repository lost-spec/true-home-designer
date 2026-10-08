import { useEffect, useMemo } from "react";
import { useAssetModel } from "../assets/useAssetModel";
import { assetRegistry } from "../assets/registry";
import {
  applyMaterialOverrides,
  buildAssetInstance,
  disposeAssetInstance,
} from "../assets/materialApply";
import type { AssetMetadata, MaterialOverrides } from "../assets/types";

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

function LoadedAsset({
  asset,
  overrides,
}: {
  asset: AssetMetadata;
  overrides: MaterialOverrides | undefined;
}) {
  const scene = useAssetModel(asset.modelPath);
  const instance = useMemo(() => buildAssetInstance(scene), [scene]);

  useEffect(() => {
    applyMaterialOverrides(instance, asset, overrides);
  }, [instance, asset, overrides]);

  useEffect(() => {
    const built = instance;
    return () => disposeAssetInstance(built);
  }, [instance]);

  return <primitive object={instance.root} />;
}

export function AssetModel({
  assetId,
  overrides,
}: {
  assetId: string;
  overrides?: MaterialOverrides;
}) {
  const asset = assetRegistry.get(assetId);
  if (!asset) return <UnknownAssetBox assetId={assetId} />;
  return (
    <group position={[asset.footprintOffset.x, 0, asset.footprintOffset.z]}>
      <LoadedAsset asset={asset} overrides={overrides} />
    </group>
  );
}
