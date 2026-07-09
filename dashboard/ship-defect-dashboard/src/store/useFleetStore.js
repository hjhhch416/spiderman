import { create } from "zustand";

const MAX_TRAIL_POINTS = 240;
const DUPLICATE_POSE_DISTANCE = 0.6;
const DUPLICATE_SAME_POSITION_DISTANCE = 0.35;
const DUPLICATE_BBOX_IOU = 0.2;
const DUPLICATE_CENTER_PX = 120;

export const useFleetStore = create((set, get) => ({
  robots: {
    bot17: makeRobot("bot17", "#38c4a3"),
  },
  defects: [],
  connection: {
    status: "mqtt",
    brokerUrl: "ws://10.91.214.129:9001",
    lastMessage: null,
  },
  gazebo: {
    url: "http://10.91.214.129:6082/vnc_lite.html?autoconnect=1&resize=scale",
  },
  yolo: {
    cameraUrl: "http://10.91.214.129:18080/stream.mjpg",
  },
  selectedRobotId: "bot17",
  selectedGoal: { x: 0, y: 0, z: 0, theta: 0 },
  sceneTransform: {
    surfaceMode: "leftWall",
    scale: 48.3,
    wallScaleY: -1.23,
    offsetX: -119.8,
    offsetY: -2.72,
    offsetZ: 1.61,
    wallSwapAxes: true,
    rawOriginX: 3.65,
    rawOriginY: 3.12,
    wallOriginX: 0,
    wallOriginH: 1.6,
    wallMinX: -6.2,
    wallMaxX: 6.2,
    wallMinH: 0.75,
    wallMaxH: 2.65,
    yawOffsetDeg: 0,
    flipY: false,
  },
  logs: [],

  setConnectionStatus: (status) =>
    set((state) => ({
      connection: { ...state.connection, status },
    })),

  setBrokerUrl: (brokerUrl) =>
    set((state) => ({
      connection: { ...state.connection, brokerUrl },
    })),

  setGazeboUrl: (url) =>
    set((state) => ({
      gazebo: { ...state.gazebo, url },
    })),

  setYoloCameraUrl: (cameraUrl) =>
    set((state) => ({
      yolo: { ...state.yolo, cameraUrl },
    })),

  setSelectedRobotId: (selectedRobotId) => set({ selectedRobotId }),

  setSelectedGoal: (selectedGoal) => set({ selectedGoal }),

  setSceneTransform: (sceneTransform) =>
    set((state) => ({
      sceneTransform: { ...state.sceneTransform, ...sceneTransform },
    })),

  updateRobotPose: (robotId, pose) =>
    set((state) => {
      const previous = state.robots[robotId] ?? makeRobot(robotId, colorForRobot(robotId));
      const normalized = normalizePose(pose);
      const point = { x: normalized.x, y: normalized.y, z: normalized.z };
      const trail = appendTrail(previous.trail, point);

      return {
        robots: {
          ...state.robots,
          [robotId]: {
            ...previous,
            ...normalized,
            trail,
            online: true,
            updatedAt: new Date().toISOString(),
          },
        },
        connection: {
          ...state.connection,
          lastMessage: new Date().toISOString(),
        },
      };
    }),

  updateRobotStatus: (robotId, status) =>
    set((state) => {
      const previous = state.robots[robotId] ?? makeRobot(robotId, colorForRobot(robotId));
      return {
        robots: {
          ...state.robots,
          [robotId]: {
            ...previous,
            status: status.status ?? status.mode ?? previous.status,
            battery: status.battery ?? status.percentage ?? previous.battery,
            online: status.online ?? previous.online,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    }),

  addDefect: (robotId, defect) =>
    set((state) => {
      const normalized = normalizeDefect(robotId, defect);
      const duplicateIndex = state.defects.findIndex((previous) => isDuplicateDefect(previous, normalized));
      if (duplicateIndex >= 0) {
        const previous = state.defects[duplicateIndex];
        const updated = {
          ...previous,
          ...normalized,
          id: previous.id,
          firstSeenAt: previous.firstSeenAt ?? previous.timestamp,
        };
        return {
          defects: [
            updated,
            ...state.defects.slice(0, duplicateIndex),
            ...state.defects.slice(duplicateIndex + 1),
          ].slice(0, 120),
        };
      }
      return {
        defects: [normalized, ...state.defects].slice(0, 120),
      };
    }),

  addLog: (message) =>
    set((state) => ({
      logs: [
        {
          id: makeId(),
          at: new Date().toLocaleTimeString(),
          message,
        },
        ...state.logs,
      ].slice(0, 80),
    })),

  clearSessionData: () =>
    set({
      robots: {
        bot17: makeRobot("bot17", "#38c4a3"),
      },
      defects: [],
    }),
}));

function makeRobot(id, color) {
  return {
    id,
    color,
    x: 0,
    y: 0,
    z: 0.25,
    theta: 0,
    roll: 0,
    pitch: 0,
    battery: null,
    status: "idle",
    online: false,
    trail: [],
    updatedAt: null,
  };
}

function colorForRobot(robotId) {
  if (robotId === "bot17") return "#38c4a3";
  if (robotId === "bot18") return "#f0b35a";
  return "#83a7ff";
}

function normalizePose(pose) {
  const position = pose.position ?? pose.pose?.pose?.position ?? {};
  const orientation = pose.orientation ?? pose.pose?.pose?.orientation;
  const yawFromQuaternion = orientation ? quaternionToYaw(orientation) : null;

  return {
    x: numberOr(pose.x, position.x, 0),
    y: numberOr(pose.y, position.y, 0),
    z: numberOr(pose.z, position.z, 0.25),
    theta: numberOr(
      pose.theta,
      pose.yaw,
      pose.heading_deg == null ? null : (Number(pose.heading_deg) * Math.PI) / 180,
      yawFromQuaternion,
      0,
    ),
    roll: numberOr(pose.roll, 0),
    pitch: numberOr(pose.pitch, 0),
  };
}

function normalizeDefect(robotId, defect) {
  const pose = normalizePose(defect);
  const receivedAtMs = Date.now();
  return {
    id: defect.defect_id ?? defect.id ?? makeId(),
    robotId,
    type: defect.type ?? defect.class_name ?? "defect",
    confidence: Number(defect.confidence ?? defect.score ?? 0),
    severity: defect.severity ?? severityFromConfidence(defect.confidence),
    imageUrl: defect.image_url ?? defect.imageUrl ?? null,
    bbox: defect.bbox ?? null,
    center_px: defect.center_px ?? defect.centerPx ?? null,
    image_size: defect.image_size ?? defect.imageSize ?? null,
    image_topic: defect.image_topic ?? defect.imageTopic ?? null,
    status: defect.status ?? null,
    timestamp: defect.timestamp ?? new Date().toISOString(),
    timestamp_ms: defect.timestamp_ms ?? null,
    receivedAtMs,
    firstSeenAt: defect.timestamp ?? new Date().toISOString(),
    ...pose,
  };
}

function isDuplicateDefect(previous, next) {
  if (previous.robotId !== next.robotId || previous.type !== next.type) return false;

  const poseDistance = Math.hypot(previous.x - next.x, previous.y - next.y);
  if (poseDistance > DUPLICATE_POSE_DISTANCE) return false;
  if (poseDistance <= DUPLICATE_SAME_POSITION_DISTANCE) return true;

  if (previous.bbox && next.bbox) {
    return bboxIou(previous.bbox, next.bbox) >= DUPLICATE_BBOX_IOU
      || bboxCenterDistance(previous.bbox, next.bbox) <= DUPLICATE_CENTER_PX;
  }

  return true;
}

function bboxIou(a, b) {
  const [ax1, ay1, ax2, ay2] = a.map(Number);
  const [bx1, by1, bx2, by2] = b.map(Number);
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
  return inter / Math.max(areaA + areaB - inter, 1e-6);
}

function bboxCenterDistance(a, b) {
  const [ax1, ay1, ax2, ay2] = a.map(Number);
  const [bx1, by1, bx2, by2] = b.map(Number);
  const acx = (ax1 + ax2) / 2;
  const acy = (ay1 + ay2) / 2;
  const bcx = (bx1 + bx2) / 2;
  const bcy = (by1 + by2) / 2;
  return Math.hypot(acx - bcx, acy - bcy);
}

function appendTrail(trail, point) {
  const previous = trail[trail.length - 1];
  const distance = previous
    ? Math.hypot(previous.x - point.x, previous.y - point.y, previous.z - point.z)
    : Infinity;

  if (distance < 0.04) return trail;
  return [...trail, point].slice(-MAX_TRAIL_POINTS);
}

function quaternionToYaw(q) {
  const x = Number(q.x ?? 0);
  const y = Number(q.y ?? 0);
  const z = Number(q.z ?? 0);
  const w = Number(q.w ?? 1);
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

function numberOr(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function severityFromConfidence(confidence) {
  const value = Number(confidence ?? 0);
  if (value >= 0.85) return "high";
  if (value >= 0.6) return "medium";
  return "low";
}

function makeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
