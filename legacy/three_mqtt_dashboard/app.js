import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#scene");
const connectionLabel = document.querySelector("#connectionLabel");
const cursorLabel = document.querySelector("#cursorLabel");
const robotList = document.querySelector("#robotList");
const logEl = document.querySelector("#log");
const brokerUrlInput = document.querySelector("#brokerUrl");
const topicFilterInput = document.querySelector("#topicFilter");
const goalRobotInput = document.querySelector("#goalRobot");
const goalXInput = document.querySelector("#goalX");
const goalYInput = document.querySelector("#goalY");
const goalThetaInput = document.querySelector("#goalTheta");

const robots = new Map();
let mqttClient = null;
let simTimer = null;
let lastCursorPoint = new THREE.Vector3();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101416);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
camera.position.set(6.5, 7.2, 8.5);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 4;
controls.maxDistance = 24;

const ambient = new THREE.HemisphereLight(0xe8fffb, 0x1b2326, 1.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(3, 8, 5);
sun.castShadow = true;
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 10),
  new THREE.MeshStandardMaterial({ color: 0x20282c, roughness: 0.8 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(14, 28, 0x5f716e, 0x344047);
grid.position.y = 0.012;
scene.add(grid);

addWall(0, -5, 14, 0.12);
addWall(0, 5, 14, 0.12);
addWall(-7, 0, 0.12, 10);
addWall(7, 0, 0.12, 10);
addObstacle(-2.4, -1.4, 1.5, 1.1, 0x6f7c82);
addObstacle(2.2, 1.6, 1.9, 0.85, 0x54666d);
addObstacle(0.9, -2.8, 1.1, 1.35, 0x677459);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const robotPalette = {
  bot17: 0x38c4a3,
  bot18: 0xe8b15a,
  default: 0x7aa7ff,
};

function addWall(x, z, width, depth) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.35, depth),
    new THREE.MeshStandardMaterial({ color: 0x2d383c, roughness: 0.7 })
  );
  wall.position.set(x, 0.175, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}

function addObstacle(x, z, width, depth, color) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.55, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
  );
  box.position.set(x, 0.275, z);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
}

function makeRobot(robotId) {
  const color = robotPalette[robotId] ?? robotPalette.default;
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 0.22, 36),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 })
  );
  base.position.y = 0.16;
  base.castShadow = true;
  group.add(base);

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.2, 0.22, 36),
    new THREE.MeshStandardMaterial({ color: 0xdce9e6, roughness: 0.4 })
  );
  top.position.y = 0.39;
  top.castShadow = true;
  group.add(top);

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.32, 3),
    new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.5 })
  );
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0.42, -0.32);
  group.add(arrow);

  const trailMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const trailGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.04, 0)]);
  const trail = new THREE.Line(trailGeometry, trailMaterial);
  scene.add(trail);

  scene.add(group);
  return {
    id: robotId,
    color,
    group,
    trail,
    points: [],
    x: 0,
    y: 0,
    theta: 0,
    updatedAt: new Date(),
  };
}

function updateRobotPose(robotId, pose) {
  const robot = robots.get(robotId) ?? makeAndStoreRobot(robotId);
  const x = Number(pose.x ?? pose.position?.x ?? 0);
  const y = Number(pose.y ?? pose.position?.y ?? 0);
  const theta = Number(pose.theta ?? pose.yaw ?? quaternionToYaw(pose.orientation) ?? 0);

  robot.x = x;
  robot.y = y;
  robot.theta = theta;
  robot.updatedAt = new Date();

  robot.group.position.set(x, 0, -y);
  robot.group.rotation.y = theta;

  const point = new THREE.Vector3(x, 0.055, -y);
  const last = robot.points[robot.points.length - 1];
  if (!last || last.distanceTo(point) > 0.04) {
    robot.points.push(point);
    if (robot.points.length > 180) robot.points.shift();
    robot.trail.geometry.dispose();
    robot.trail.geometry = new THREE.BufferGeometry().setFromPoints(robot.points);
  }

  renderRobotList();
}

function makeAndStoreRobot(robotId) {
  const robot = makeRobot(robotId);
  robots.set(robotId, robot);
  if (![...goalRobotInput.options].some((option) => option.value === robotId)) {
    goalRobotInput.add(new Option(robotId, robotId));
  }
  return robot;
}

function quaternionToYaw(q) {
  if (!q) return null;
  const x = Number(q.x ?? 0);
  const y = Number(q.y ?? 0);
  const z = Number(q.z ?? 0);
  const w = Number(q.w ?? 1);
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

function renderRobotList() {
  robotList.innerHTML = "";
  for (const robot of robots.values()) {
    const row = document.createElement("div");
    row.className = "robot-row";
    row.innerHTML = `
      <span class="robot-dot" style="background:#${robot.color.toString(16).padStart(6, "0")}"></span>
      <span class="robot-main">
        <strong>${robot.id}</strong>
        <span>x ${robot.x.toFixed(2)} / y ${robot.y.toFixed(2)} / yaw ${robot.theta.toFixed(2)}</span>
      </span>
      <span class="robot-time">${robot.updatedAt.toLocaleTimeString()}</span>
    `;
    robotList.appendChild(row);
  }
}

function parseMqttMessage(topic, payloadText) {
  const parts = topic.split("/");
  const robotId = parts[1] || "unknown";
  const data = JSON.parse(payloadText);
  if (topic.endsWith("/odom")) {
    updateRobotPose(robotId, {
      x: data.position?.x,
      y: data.position?.y,
      orientation: data.orientation,
      theta: data.theta,
    });
  } else {
    updateRobotPose(robotId, data);
  }
}

function connectMqtt() {
  stopSimulation();
  disconnectMqtt();

  const url = brokerUrlInput.value.trim();
  const topic = topicFilterInput.value.trim();
  log(`connecting ${url}`);
  connectionLabel.textContent = "connecting";

  mqttClient = mqtt.connect(url, {
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    clientId: `dashboard_${Math.random().toString(16).slice(2)}`,
  });

  mqttClient.on("connect", () => {
    connectionLabel.textContent = "mqtt connected";
    log(`subscribed ${topic}`);
    mqttClient.subscribe(topic);
    mqttClient.subscribe(topic.replace("/pose", "/odom"));
  });

  mqttClient.on("message", (topicName, message) => {
    const text = message.toString();
    try {
      parseMqttMessage(topicName, text);
    } catch (error) {
      log(`parse failed ${topicName}: ${error.message}`);
    }
  });

  mqttClient.on("error", (error) => {
    connectionLabel.textContent = "mqtt error";
    log(`mqtt error: ${error.message}`);
  });

  mqttClient.on("close", () => {
    if (mqttClient) connectionLabel.textContent = "mqtt closed";
  });
}

function disconnectMqtt() {
  if (!mqttClient) return;
  mqttClient.end(true);
  mqttClient = null;
}

function startSimulation() {
  disconnectMqtt();
  stopSimulation();
  connectionLabel.textContent = "simulation";
  log("simulation started");
  let t = 0;
  simTimer = window.setInterval(() => {
    t += 0.045;
    updateRobotPose("bot17", {
      x: Math.cos(t) * 2.7,
      y: Math.sin(t * 0.9) * 1.8,
      theta: -t + Math.PI / 2,
    });
    updateRobotPose("bot18", {
      x: Math.sin(t * 0.8) * 2.1 + 1.2,
      y: Math.cos(t * 1.1) * 2.2 - 0.4,
      theta: t,
    });
  }, 80);
}

function stopSimulation() {
  if (simTimer) window.clearInterval(simTimer);
  simTimer = null;
}

function publishGoal() {
  const robotId = goalRobotInput.value;
  const payload = {
    robot_id: robotId,
    target: {
      x: Number(goalXInput.value),
      y: Number(goalYInput.value),
      theta: Number(goalThetaInput.value),
    },
    timestamp: new Date().toISOString(),
  };
  const topic = `turtlebot/${robotId}/command/nav`;

  if (!mqttClient || !mqttClient.connected) {
    log(`goal ready ${topic} ${JSON.stringify(payload)}`);
    return;
  }

  mqttClient.publish(topic, JSON.stringify(payload), { qos: 1, retain: false });
  log(`published ${topic} ${JSON.stringify(payload)}`);
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(floor);
  if (!hits.length) return;

  lastCursorPoint.copy(hits[0].point);
  const rosX = lastCursorPoint.x;
  const rosY = -lastCursorPoint.z;
  cursorLabel.textContent = `x ${rosX.toFixed(2)} / y ${rosY.toFixed(2)}`;
}

function pickGoal(event) {
  updatePointer(event);
  goalXInput.value = lastCursorPoint.x.toFixed(2);
  goalYInput.value = (-lastCursorPoint.z).toFixed(2);
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  resize();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function log(message) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `[${time}] ${message}\n${logEl.textContent}`.slice(0, 4000);
}

document.querySelector("#connectBtn").addEventListener("click", connectMqtt);
document.querySelector("#simBtn").addEventListener("click", startSimulation);
document.querySelector("#sendGoalBtn").addEventListener("click", publishGoal);
canvas.addEventListener("pointermove", updatePointer);
canvas.addEventListener("click", pickGoal);

makeAndStoreRobot("bot17");
makeAndStoreRobot("bot18");
updateRobotPose("bot17", { x: -1.5, y: 0.5, theta: 0.2 });
updateRobotPose("bot18", { x: 1.4, y: -0.7, theta: -0.4 });
startSimulation();
animate();
