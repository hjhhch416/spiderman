import { RoundedBox } from "@react-three/drei";

export function ShipExterior() {
  return (
    <group position={[0, 0.55, 0]}>
      <Hull />
      <DeckLines />
      <InspectionRails />
      <mesh position={[0, 0.18, 0]} receiveShadow>
        <boxGeometry args={[18.6, 0.08, 5.5]} />
        <meshStandardMaterial color="#172023" roughness={0.8} transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

function Hull() {
  return (
    <group>
      <RoundedBox castShadow receiveShadow args={[19.6, 2.7, 5.4]} radius={0.28} smoothness={8} position={[0, 1.28, 0]}>
        <meshStandardMaterial color="#31444b" roughness={0.62} metalness={0.08} />
      </RoundedBox>
      <mesh castShadow receiveShadow position={[10.05, 1.28, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[2.7, 2.0, 4]} />
        <meshStandardMaterial color="#273840" roughness={0.68} metalness={0.08} />
      </mesh>
      <mesh castShadow receiveShadow position={[-10.05, 1.28, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[2.7, 2.0, 4]} />
        <meshStandardMaterial color="#273840" roughness={0.68} metalness={0.08} />
      </mesh>
      <RoundedBox castShadow receiveShadow args={[4.2, 1.35, 2.2]} radius={0.18} position={[-2.5, 2.95, 0]}>
        <meshStandardMaterial color="#d9e4e2" roughness={0.45} />
      </RoundedBox>
      <RoundedBox castShadow receiveShadow args={[1.3, 0.9, 1.15]} radius={0.12} position={[2.5, 2.72, 0]}>
        <meshStandardMaterial color="#bccbc8" roughness={0.42} />
      </RoundedBox>
    </group>
  );
}

function DeckLines() {
  const lines = [-6, -3, 0, 3, 6];
  return (
    <group>
      {lines.map((x) => (
        <mesh key={x} position={[x, 2.46, 0]}>
          <boxGeometry args={[0.035, 0.035, 4.15]} />
          <meshStandardMaterial color="#7d9091" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 2.48, -2.02]}>
        <boxGeometry args={[18.8, 0.035, 0.035]} />
        <meshStandardMaterial color="#7d9091" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.48, 2.02]}>
        <boxGeometry args={[18.8, 0.035, 0.035]} />
        <meshStandardMaterial color="#7d9091" roughness={0.7} />
      </mesh>
    </group>
  );
}

function InspectionRails() {
  return (
    <group>
      <mesh position={[0, 0.68, -3.18]}>
        <boxGeometry args={[20.2, 0.07, 0.08]} />
        <meshStandardMaterial color="#6a7e82" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.68, 3.18]}>
        <boxGeometry args={[20.2, 0.07, 0.08]} />
        <meshStandardMaterial color="#6a7e82" roughness={0.5} />
      </mesh>
    </group>
  );
}
