import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { assetRegistry } from "../assets/registry";
import { useObjectDrag } from "../interaction/useObjectDrag";
import { AssetModel } from "./AssetModel";

export function PlacedObject({ objectId }: { objectId: string }) {
  const object = useHouseStore((s) => s.house.objects[objectId]);
  const select = useEditorStore((s) => s.select);
  const isSelected = useEditorStore(
    (s) => s.selection?.kind === "object" && s.selection.id === objectId,
  );

  const asset = assetRegistry.get(object.assetId);
  const allowRotation = asset?.allowRotation ?? true;
  const allowScaling = asset?.allowScaling ?? true;

  const { onPointerDown, onPointerOver, onPointerOut } =
    useObjectDrag(objectId);

  const ringRadius =
    Math.max(asset?.dimensions.width ?? 1, asset?.dimensions.depth ?? 1) * 0.5 +
    0.12;

  return (
    <group
      name={`object-${objectId}`}
      position={[object.position.x, 0, object.position.z]}
      rotation={[0, allowRotation ? object.rotationY : 0, 0]}
      scale={allowScaling ? object.scale : 1}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={(event) => {
        event.stopPropagation();
        const state = useEditorStore.getState();
        if (state.draggingObjectId || state.draggingWallId) return;
        if (state.placingAssetId) return;
        select({ kind: "object", id: objectId });
      }}
    >
      <AssetModel assetId={object.assetId} />
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ringRadius, ringRadius + 0.15, 48]} />
          <meshBasicMaterial color="#5b9cff" transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}
