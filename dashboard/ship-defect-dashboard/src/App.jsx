import { Activity, Boxes, Camera, Crosshair, Radio, RotateCcw, ShipWheel, Tv, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { GazeboView } from "./components/GazeboView.jsx";
import { Scene3D } from "./components/Scene3D.jsx";
import { YoloView } from "./components/YoloView.jsx";
import { useMqttConnection } from "./mqtt/useMqtt.js";
import { useFleetStore } from "./store/useFleetStore.js";

export default function App() {
  const [mainView, setMainView] = useState("gazebo");
  const connection = useFleetStore((state) => state.connection);
  const gazebo = useFleetStore((state) => state.gazebo);
  const yolo = useFleetStore((state) => state.yolo);
  const robots = useFleetStore((state) => state.robots);
  const defects = useFleetStore((state) => state.defects);
  const logs = useFleetStore((state) => state.logs);
  const selectedRobotId = useFleetStore((state) => state.selectedRobotId);
  const selectedGoal = useFleetStore((state) => state.selectedGoal);
  const sceneTransform = useFleetStore((state) => state.sceneTransform);
  const setBrokerUrl = useFleetStore((state) => state.setBrokerUrl);
  const setGazeboUrl = useFleetStore((state) => state.setGazeboUrl);
  const setYoloCameraUrl = useFleetStore((state) => state.setYoloCameraUrl);
  const setSelectedRobotId = useFleetStore((state) => state.setSelectedRobotId);
  const setSelectedGoal = useFleetStore((state) => state.setSelectedGoal);
  const setSceneTransform = useFleetStore((state) => state.setSceneTransform);
  const addLog = useFleetStore((state) => state.addLog);
  const robotList = useMemo(() => Object.values(robots), [robots]);

  const mqtt = useMqttConnection(true);

  const publishGoal = () => {
    const robotTopicMap = {
      bot17: "ship/crack_bot_01",
    };
    const baseTopic = robotTopicMap[selectedRobotId] ?? `turtlebot/${selectedRobotId}`;
    const payload = {
      robot_id: selectedRobotId,
      target: selectedGoal,
      timestamp: new Date().toISOString(),
    };
    const topic = `${baseTopic}/command/nav`;
    const sent = mqtt.publish(topic, payload, { qos: 1, retain: false });
    addLog(sent ? `published ${topic}` : `goal ready ${topic}`);
  };

  return (
    <main className="app-shell">
      <section className="viewer">
        {mainView === "gazebo" && <GazeboView />}
        {mainView === "model" && <Scene3D />}
        {mainView === "yolo" && <YoloView />}
        <div className="scene-badge">
          {mainView === "gazebo" && <Tv size={18} />}
          {mainView === "model" && <ShipWheel size={18} />}
          {mainView === "yolo" && <Camera size={18} />}
          <span>
            {mainView === "gazebo" && "Gazebo View"}
            {mainView === "model" && "Ship Exterior Inspection"}
            {mainView === "yolo" && "YOLO Camera"}
          </span>
        </div>
      </section>

      <aside className="side-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">MQTT / ROS2 / YOLO</p>
            <h1>Defect Dashboard</h1>
          </div>
          <span className={`status-pill ${connection.status}`}>
            <Wifi size={15} />
            {connection.status}
          </span>
        </header>

        <section className="card">
          <div className="card-title">
            <Tv size={17} />
            Main View
          </div>
          <div className="segmented three-way">
            <button
              className={mainView === "gazebo" ? "active" : ""}
              onClick={() => setMainView("gazebo")}
              type="button"
            >
              Gazebo
            </button>
            <button
              className={mainView === "model" ? "active" : ""}
              onClick={() => setMainView("model")}
              type="button"
            >
              3D Model
            </button>
            <button
              className={mainView === "yolo" ? "active" : ""}
              onClick={() => setMainView("yolo")}
              type="button"
            >
              YOLO
            </button>
          </div>
          <label className="field">
            Gazebo URL
            <input
              value={gazebo.url}
              onChange={(event) => setGazeboUrl(event.target.value)}
              spellCheck="false"
            />
          </label>
          <label className="field">
            YOLO camera URL
            <input
              value={yolo.cameraUrl}
              onChange={(event) => setYoloCameraUrl(event.target.value)}
              spellCheck="false"
            />
          </label>
        </section>

        <section className="card">
          <div className="card-title">
            <Radio size={17} />
            MQTT
          </div>
          <label className="field">
            WebSocket broker
            <input
              value={connection.brokerUrl}
              onChange={(event) => setBrokerUrl(event.target.value)}
              spellCheck="false"
            />
          </label>
        </section>

        <section className="card">
          <div className="card-title">
            <Activity size={17} />
            Robots
          </div>
          <div className="robot-stack">
            {robotList.map((robot) => (
              <button
                className={`robot-card ${robot.id === selectedRobotId ? "selected" : ""}`}
                key={robot.id}
                onClick={() => setSelectedRobotId(robot.id)}
                type="button"
              >
                <span className="robot-dot" style={{ background: robot.color }} />
                <span>
                  <strong>{robot.id}</strong>
                  <RobotPoseText robot={robot} transform={sceneTransform} />
                </span>
                <em>{robot.battery == null ? "--" : `${robot.battery}%`}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <Crosshair size={17} />
            Coordinate Fit
          </div>
          <div className="goal-grid">
            <label className="field wide-field">
              Surface
              <select
                value={sceneTransform.surfaceMode}
                onChange={(event) => setSceneTransform({ surfaceMode: event.target.value })}
              >
                <option value="leftWall">Left Wall</option>
                <option value="floor">Floor</option>
              </select>
            </label>
            <label className="field">
              Scale
              <input
                type="number"
                step="0.1"
                value={sceneTransform.scale}
                onChange={(event) => setSceneTransform({ scale: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              Wall H Scale
              <input
                type="number"
                step="0.05"
                value={sceneTransform.wallScaleY ?? sceneTransform.scale}
                onChange={(event) => setSceneTransform({ wallScaleY: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              Yaw Offset
              <input
                type="number"
                step="5"
                value={sceneTransform.yawOffsetDeg}
                onChange={(event) => setSceneTransform({ yawOffsetDeg: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              Offset X
              <input
                type="number"
                step="0.1"
                value={sceneTransform.offsetX}
                onChange={(event) => setSceneTransform({ offsetX: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              Wall Depth
              <input
                type="number"
                step="0.1"
                value={sceneTransform.offsetY}
                onChange={(event) => setSceneTransform({ offsetY: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              Wall Height
              <input
                type="number"
                step="0.1"
                value={sceneTransform.offsetZ}
                onChange={(event) => setSceneTransform({ offsetZ: Number(event.target.value) })}
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={sceneTransform.flipY}
                onChange={(event) => setSceneTransform({ flipY: event.target.checked })}
              />
              Flip ROS Y
            </label>
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <Crosshair size={17} />
            Navigation Goal
          </div>
          <div className="goal-grid">
            <label className="field">
              X
              <input
                type="number"
                step="0.1"
                value={selectedGoal.x}
                onChange={(event) => setSelectedGoal({ ...selectedGoal, x: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              Y
              <input
                type="number"
                step="0.1"
                value={selectedGoal.y}
                onChange={(event) => setSelectedGoal({ ...selectedGoal, y: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              Z
              <input
                type="number"
                step="0.1"
                value={selectedGoal.z}
                onChange={(event) => setSelectedGoal({ ...selectedGoal, z: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              Yaw
              <input
                type="number"
                step="0.1"
                value={selectedGoal.theta}
                onChange={(event) =>
                  setSelectedGoal({ ...selectedGoal, theta: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <button className="primary-button" onClick={publishGoal} type="button">
            Publish Goal
          </button>
        </section>

        <section className="card">
          <div className="card-title">
            <Boxes size={17} />
            YOLO Defects
          </div>
          <div className="defect-stack">
            {defects.slice(0, 6).map((defect) => (
              <div className={`defect-row ${defect.severity}`} key={defect.id}>
                <strong>{defect.type}</strong>
                <span>{defect.robotId}</span>
                <em>{Math.round(defect.confidence * 100)}%</em>
              </div>
            ))}
            {defects.length === 0 && <p className="empty">No defects received yet.</p>}
          </div>
        </section>

        <section className="card log-card">
          <div className="card-title">
            <RotateCcw size={17} />
            Events
          </div>
          <div className="log-list">
            {logs.map((log) => (
              <p key={log.id}>
                <span>{log.at}</span>
                {log.message}
              </p>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}

function RobotPoseText({ robot, transform }) {
  if (transform.surfaceMode === "leftWall") {
    const wall = projectToLeftWall(robot, transform);
    return (
      <>
        <small>
          wall x {wall.x.toFixed(2)} / h {wall.z.toFixed(2)} / d {wall.y.toFixed(2)}
        </small>
        <small className="raw-pose">
          raw x {robot.x.toFixed(2)} / y {robot.y.toFixed(2)}
        </small>
      </>
    );
  }

  return (
    <small>
      x {robot.x.toFixed(2)} / y {robot.y.toFixed(2)} / z {robot.z.toFixed(2)}
    </small>
  );
}

function projectToLeftWall(pose, transform) {
  const scale = Number(transform.scale) || 1;
  const wallScaleY = Number(transform.wallScaleY ?? scale) || scale;
  const sourceHorizontal = transform.wallSwapAxes ? pose.y : pose.x;
  const verticalPose = transform.wallSwapAxes ? pose.x : pose.y;
  const sourceVertical = transform.flipY ? -verticalPose : verticalPose;
  const wallSceneZ = Math.abs(Number(transform.offsetY || 2.72));
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
