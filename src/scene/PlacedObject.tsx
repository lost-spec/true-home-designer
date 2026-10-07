import { Clone, useGLTF } from "@react-three/drei";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { ASSET_BY_ID } from "../assets/catalog";

export function PlacedObject({ objectId }: { objectId: string }) {
  const object = useHouseStore((s) => s.house.objects[objectId]);
  const select = useEditorStore((s) => s.select);
  const isSelected = useEditorStore(
    (s) => s.selection?.kind === "object" && s.selection.id === objectId,
  );

  const asset = ASSET_BY_ID[object.assetId];
  const { scene } = useGLTF(asset.path);

  return (
    <group
      position={[object.position.x, 0, object.position.z]}
      rotation={[0, object.rotationY, 0]}
      scale={object.scale}
      onClick={(event) => {
        event.stopPropagation();
        select({ kind: "object", id: objectId });
      }}
    >
      <Clone object={scene} castShadow receiveShadow />
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.75, 0.9, 48]} />
          <meshBasicMaterial color="#5b9cff" transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}
