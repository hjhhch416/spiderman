import { AlertCircle, ExternalLink, Maximize2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useFleetStore } from "../store/useFleetStore";

export function GazeboView() {
  const gazeboUrl = useFleetStore((state) => state.gazebo.url);
  const robots = useFleetStore((state) => state.robots);
  const defects = useFleetStore((state) => state.defects);
  const robotList = useMemo(() => Object.values(robots), [robots]);
  const [frameReady, setFrameReady] = useState(false);

  return (
    <div className="gazebo-view">
      <iframe
        className={`gazebo-frame ${frameReady ? "ready" : ""}`}
        src={gazeboUrl}
        title="Gazebo view"
        allow="fullscreen"
        allowFullScreen
        onLoad={() => setFrameReady(true)}
      />
      {!frameReady && (
        <div className="gazebo-placeholder">
          <AlertCircle size={30} />
          <strong>Gazebo Web</strong>
          <span>{gazeboUrl}</span>
        </div>
      )}
      <div className="gazebo-overlay top-right">
        <div className="overlay-title">
          <Maximize2 size={15} />
          Gazebo
        </div>
        <a href={gazeboUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} />
          Open
        </a>
      </div>
      <div className="gazebo-overlay bottom-left">
        {robotList.map((robot) => (
          <div className="overlay-robot" key={robot.id}>
            <span className="robot-dot" style={{ background: robot.color }} />
            <strong>{robot.id}</strong>
            <span>
              {robot.x.toFixed(2)}, {robot.y.toFixed(2)}, {robot.z.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div className="gazebo-overlay bottom-right">
        <div className="overlay-title">Detections</div>
        <strong>{defects.length}</strong>
      </div>
    </div>
  );
}
