import { Boxes, Camera, Crosshair } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFleetStore } from "../store/useFleetStore";

const ACTIVE_BBOX_MS = 25000;

export function YoloView() {
  const defects = useFleetStore((state) => state.defects);
  const robots = useFleetStore((state) => state.robots);
  const cameraUrl = useFleetStore((state) => state.yolo.cameraUrl);
  const sceneTransform = useFleetStore((state) => state.sceneTransform);
  const [now, setNow] = useState(() => Date.now());
  const latest = defects[0] ?? null;
  const robot = latest ? robots[latest.robotId] : robots.bot17;
  const detections = useMemo(() => defects.slice(0, 8), [defects]);
  const activeDetections = useMemo(
    () => detections.filter((defect) => now - detectionTime(defect) <= ACTIVE_BBOX_MS),
    [detections, now],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="yolo-view">
      <div className="yolo-frame">
        <div className="yolo-overlay top-left">
          <Camera size={15} />
          YOLO Camera
        </div>
        <CameraCanvas cameraUrl={cameraUrl} detections={activeDetections} />
      </div>

      <div className="yolo-side">
        <section className="yolo-panel">
          <div className="overlay-title">
            <Crosshair size={15} />
            Latest
          </div>
          {latest ? (
            <div className="latest-detection">
              <strong>{latest.type}</strong>
              <span>{latest.robotId}</span>
              <em>{Math.round(latest.confidence * 100)}%</em>
              <WallPoseLine pose={latest} transform={sceneTransform} />
              {latest.bbox && <small>bbox {latest.bbox.map((value) => Number(value).toFixed(0)).join(", ")}</small>}
            </div>
          ) : (
            <p className="empty">No detections</p>
          )}
        </section>

        <section className="yolo-panel detection-list">
          {detections.map((defect) => (
            <div className={`defect-row ${defect.severity}`} key={defect.id}>
              <strong>{defect.type}</strong>
              <span>{defect.robotId}</span>
              <em>{Math.round(defect.confidence * 100)}%</em>
            </div>
          ))}
        </section>

        {robot && (
          <section className="yolo-panel compact-pose">
            <strong>{robot.id}</strong>
            <WallPoseLine pose={robot} transform={sceneTransform} />
          </section>
        )}
      </div>
    </div>
  );
}

function CameraCanvas({ cameraUrl, detections }) {
  const latestWithSize = detections.find((defect) => defect.image_size?.length === 2);
  const [width, height] = latestWithSize?.image_size ?? [640, 480];
  const aspectRatio = `${width} / ${height}`;

  return (
    <div className="bbox-canvas" style={{ aspectRatio }}>
      <img
        alt="YOLO camera stream"
        className="yolo-stream"
        src={cameraUrl}
      />
      <div className="bbox-grid" />
      <div className="bbox-frame-label">
        {width} x {height}
      </div>
      {!cameraUrl && (
        <div className="yolo-empty">
          <Camera size={34} />
          <strong>No camera URL</strong>
          <span>Set the MJPEG camera stream URL</span>
        </div>
      )}
      {detections.length === 0 && cameraUrl && (
        <div className="yolo-empty">
          <Boxes size={34} />
          <strong>No bbox received</strong>
          <span>Waiting for MQTT detection payload</span>
        </div>
      )}
      {detections.map((defect) => (
        <DetectionBox defect={defect} key={defect.id} width={width} height={height} />
      ))}
    </div>
  );
}

function WallPoseLine({ pose, transform }) {
  if (transform.surfaceMode !== "leftWall") {
    return (
      <small>
        x {pose.x.toFixed(2)} / y {pose.y.toFixed(2)} / z {pose.z.toFixed(2)}
      </small>
    );
  }

  const wall = projectToLeftWall(pose, transform);
  return (
    <>
      <small className="wall-pose">
        wall x {wall.x.toFixed(2)} / h {wall.z.toFixed(2)} / d {wall.y.toFixed(2)}
      </small>
      <small className="raw-pose">
        raw x {pose.x.toFixed(2)} / y {pose.y.toFixed(2)} / z {pose.z.toFixed(2)}
      </small>
    </>
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

function DetectionBox({ defect, width, height }) {
  if (!defect.bbox || !width || !height) return null;
  const [x1, y1, x2, y2] = defect.bbox.map(Number);

  const style = {
    left: `${(x1 / width) * 100}%`,
    top: `${(y1 / height) * 100}%`,
    width: `${((x2 - x1) / width) * 100}%`,
    height: `${((y2 - y1) / height) * 100}%`,
  };

  return (
    <div className={`detection-box ${defect.severity}`} style={style}>
      <span>
        {defect.type} {Math.round(defect.confidence * 100)}%
      </span>
    </div>
  );
}

function detectionTime(defect) {
  if (Number.isFinite(defect.receivedAtMs)) return Number(defect.receivedAtMs);
  if (Number.isFinite(defect.timestamp_ms)) return Number(defect.timestamp_ms);
  const parsed = new Date(defect.timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
