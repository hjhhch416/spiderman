import { Html } from "@react-three/drei";

export function DefectMarker({ defect }) {
  const color = defect.severity === "high" ? "#ff5f67" : defect.severity === "medium" ? "#f0b35a" : "#7aa7ff";

  return (
    <group position={[defect.x, defect.z, -defect.y]}>
      <mesh>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.22, 0.31, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} />
      </mesh>
      <Html distanceFactor={12} position={[0, 0.35, 0]}>
        <div className={`scene-label defect ${defect.severity}`}>
          {defect.type}
          <span>{Math.round(defect.confidence * 100)}%</span>
        </div>
      </Html>
    </group>
  );
}
