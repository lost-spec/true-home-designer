import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { assetRegistry } from "../assets/registry";
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

  return (
    <group
      name={`object-${objectId}`}
      position={[object.position.x, 0, object.position.z]}
      rotation={[0, allowRotation ? object.rotationY : 0, 0]}
      scale={allowScaling ? object.scale : 1}
      onClick={(event) => {
        event.stopPropagation();
        select({ kind: "object", id: objectId });
      }}
    >
      <AssetModel assetId={object.assetId} />
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.75, 0.9, 48]} />
          <meshBasicMaterial color="#5b9cff" transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}
