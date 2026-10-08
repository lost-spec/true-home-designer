import { useMemo } from "react";
import { useHouseStore } from "../store/houseStore";
import { getCeilingBox } from "../geometry/ceilingGeometry";

const CEILING_COLOR = "#f2efe9";

export function CeilingMesh({ roomId }: { roomId: string }) {
  const room = useHouseStore((s) => s.house.rooms[roomId]);

  const box = useMemo(() => getCeilingBox(room), [room]);

  return (
    <mesh name="room-ceiling" position={box.position} receiveShadow>
      <boxGeometry args={box.size} />
      <meshStandardMaterial color={CEILING_COLOR} roughness={0.95} />
    </mesh>
  );
}
