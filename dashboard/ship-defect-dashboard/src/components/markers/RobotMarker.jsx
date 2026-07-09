import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

export function RobotMarker({ robot, selected }) {
  const scenePosition = [robot.x, robot.z, -robot.y];
  const trailPoints = useMemo(
    () => robot.trail.map((point) => new THREE.Vector3(point.x, point.z + 0.03, -point.y)),
    [robot.trail],
  );

  return (
    <>
      {trailPoints.length > 1 && (
        <Line points={trailPoints} color={robot.color} lineWidth={2} transparent opacity={0.8} />
      )}
      <group position={scenePosition} rotation={[robot.roll, robot.theta, robot.pitch]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.24, 0.29, 0.2, 32]} />
          <meshStandardMaterial color={robot.color} roughness={0.4} metalness={0.16} />
        </mesh>
        <mesh castShadow position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.16, 0.18, 0.16, 32]} />
          <meshStandardMaterial color="#e9f3f0" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.25, -0.27]} rotation={[Math.PI / 2, 0, Math.PI]}>
          <coneGeometry args={[0.09, 0.24, 3]} />
          <meshBasicMaterial color="#0d1113" />
        </mesh>
        {selected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
            <ringGeometry args={[0.36, 0.43, 36]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.78} />
          </mesh>
        )}
        <Html distanceFactor={12} position={[0, 0.58, 0]}>
          <div className={`scene-label robot ${selected ? "selected" : ""}`}>
            {robot.id}
            <span>{robot.status}</span>
          </div>
        </Html>
      </group>
    </>
  );
}
