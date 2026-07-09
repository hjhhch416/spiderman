import { Html, Line, OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { useFleetStore } from "../store/useFleetStore";
import { DefectMarker } from "./markers/DefectMarker.jsx";
import { RobotMarker } from "./markers/RobotMarker.jsx";
import { ShipExterior } from "./ship/ShipExterior.jsx";

export function Scene3D() {
  return (
    <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
      <PerspectiveCamera makeDefault position={[9, 7, 11]} fov={48} />
      <color attach="background" args={["#0e1315"]} />
      <fog attach="fog" args={["#0e1315", 18, 42]} />
      <ambientLight intensity={1.2} />
      <directionalLight castShadow position={[8, 9, 5]} intensity={2.2} />
      <SceneContents />
      <OrbitControls
        enableDamping
        maxPolarAngle={Math.PI * 0.48}
        minDistance={5}
        maxDistance={28}
        target={[0, 0.8, 0]}
      />
    </Canvas>
  );
}

function SceneContents() {
  const robots = useFleetStore((state) => state.robots);
  const defects = useFleetStore((state) => state.defects);
  const sceneTransform = useFleetStore((state) => state.sceneTransform);
  const selectedRobotId = useFleetStore((state) => state.selectedRobotId);
  const selectedGoal = useFleetStore((state) => state.selectedGoal);
  const setSelectedGoal = useFleetStore((state) => state.setSelectedGoal);
  const robotList = useMemo(() => Object.values(robots), [robots]);

  return (
    <>
      <ShipExterior />
      <InspectionGrid onPick={setSelectedGoal} />
      {robotList.map((robot) => (
        <RobotMarker
          key={robot.id}
          robot={transformPose(robot, sceneTransform)}
          selected={robot.id === selectedRobotId}
        />
      ))}
      {defects.map((defect) => (
        <DefectMarker defect={transformPose(defect, sceneTransform)} key={defect.id} />
      ))}
      <GoalMarker goal={selectedGoal} />
      <Text position={[0, 3.2, -3.4]} fontSize={0.26} color="#b9c8c5" anchorX="center">
        click floor to select a navigation goal
      </Text>
    </>
  );
}

function transformPose(pose, transform) {
  const scale = Number(transform.scale) || 1;
  const yawOffset = ((Number(transform.yawOffsetDeg) || 0) * Math.PI) / 180;
  if (transform.surfaceMode === "leftWall") {
    const project = (point) => projectToLeftWall(point, transform, scale);
    return {
      ...pose,
      ...project(pose),
      theta: pose.theta + yawOffset,
      roll: Math.PI / 2,
      pitch: pose.pitch ?? 0,
      trail: pose.trail?.map((point) => ({
        ...point,
        ...project(point),
      })),
    };
  }

  return {
    ...pose,
    x: pose.x * scale + Number(transform.offsetX || 0),
    y: (transform.flipY ? -pose.y : pose.y) * scale + Number(transform.offsetY || 0),
    z: pose.z * scale + Number(transform.offsetZ || 0),
    theta: pose.theta + yawOffset,
    trail: pose.trail?.map((point) => ({
      ...point,
      x: point.x * scale + Number(transform.offsetX || 0),
      y: (transform.flipY ? -point.y : point.y) * scale + Number(transform.offsetY || 0),
      z: point.z * scale + Number(transform.offsetZ || 0),
    })),
  };
}

function projectToLeftWall(pose, transform, scale) {
  const wallScaleY = Number(transform.wallScaleY ?? scale) || scale;
  const sourceHorizontal = transform.wallSwapAxes ? pose.y : pose.x;
  const verticalPose = transform.wallSwapAxes ? pose.x : pose.y;
  const sourceVertical = transform.flipY ? -verticalPose : verticalPose;
  const wallSceneZ = Math.abs(Number(transform.offsetY || 2.12));
  const wallX = transform.wallSwapAxes
    ? (sourceHorizontal - Number(transform.rawOriginY || 0)) * scale + Number(transform.wallOriginX || 0)
    : sourceHorizontal * scale + Number(transform.offsetX || 0);
  const wallH = transform.wallSwapAxes
    ? (sourceVertical - Number(transform.rawOriginX || 0)) * Math.abs(wallScaleY) + Number(transform.wallOriginH || 1.6)
    : sourceVertical * wallScaleY + Number(transform.offsetZ || 0);
  return {
    x: clamp(wallX, transform.wallMinX, transform.wallMaxX),
    y: -wallSceneZ,
    z: clamp(wallH, transform.wallMinH, transform.wallMaxH),
  };
}

function clamp(value, min, max) {
  const numericMin = Number(min);
  const numericMax = Number(max);
  if (Number.isFinite(numericMin) && value < numericMin) return numericMin;
  if (Number.isFinite(numericMax) && value > numericMax) return numericMax;
  return value;
}

function InspectionGrid({ onPick }) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);

  const handlePointerDown = (event) => {
    const rect = gl.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(plane, intersection);
    onPick({
      x: Number(intersection.x.toFixed(2)),
      y: Number((-intersection.z).toFixed(2)),
      z: 0,
      theta: 0,
    });
  };

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onPointerDown={handlePointerDown}>
        <planeGeometry args={[22, 12]} />
        <meshStandardMaterial color="#1b2427" roughness={0.8} />
      </mesh>
      <gridHelper args={[22, 44, "#5a6c69", "#2f3b3f"]} position={[0, 0.012, 0]} />
      <Line
        points={[
          [-10.5, 0.03, -5.5],
          [10.5, 0.03, -5.5],
          [10.5, 0.03, 5.5],
          [-10.5, 0.03, 5.5],
          [-10.5, 0.03, -5.5],
        ]}
        color="#6e8580"
        lineWidth={1}
      />
    </group>
  );
}

function GoalMarker({ goal }) {
  return (
    <group position={[goal.x, 0.04, -goal.y]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.28, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>
      <Html distanceFactor={12} position={[0, 0.36, 0]}>
        <div className="scene-label">goal</div>
      </Html>
    </group>
  );
}
