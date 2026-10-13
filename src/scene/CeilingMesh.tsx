import { useMemo } from "react";
import { useHouseStore } from "../store/houseStore";
import { getCeilingBoxes } from "../geometry/ceilingGeometry";

export function CeilingMesh({ roomId }: { roomId: string }) {
  const room = useHouseStore((s) => s.house.rooms[roomId]);

  const boxes = useMemo(() => getCeilingBoxes(room), [room]);

  return (
    <group name="room-ceiling">
      {boxes.map((box, index) => (
        <mesh key={index} position={box.position} receiveShadow>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color={room.surfaces.ceiling} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}
