import { Suspense, useMemo } from "react";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { WallMesh } from "./WallMesh";
import { FloorMesh } from "./FloorMesh";
import { CeilingMesh } from "./CeilingMesh";
import { PlacedObject } from "./PlacedObject";

export function HouseScene() {
  const rooms = useHouseStore((s) => s.house.rooms);
  const walls = useHouseStore((s) => s.house.walls);
  const objects = useHouseStore((s) => s.house.objects);
  const ceilingVisible = useEditorStore((s) => s.ceilingVisible);

  const roomList = useMemo(() => Object.values(rooms), [rooms]);
  const wallList = useMemo(() => Object.values(walls), [walls]);
  const objectList = useMemo(() => Object.values(objects), [objects]);

  return (
    <group>
      {roomList.map((room) => (
        <FloorMesh key={room.id} roomId={room.id} />
      ))}
      {ceilingVisible &&
        roomList.map((room) => (
          <CeilingMesh key={room.id} roomId={room.id} />
        ))}
      {wallList.map((wall) => (
        <WallMesh key={wall.id} wallId={wall.id} />
      ))}
      <Suspense fallback={null}>
        {objectList.map((object) => (
          <PlacedObject key={object.id} objectId={object.id} />
        ))}
      </Suspense>
    </group>
  );
}
