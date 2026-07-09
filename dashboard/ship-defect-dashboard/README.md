# Ship Defect Robot Dashboard

React + Three.js dashboard for TurtleBot-based ship exterior defect inspection.

## Target setup

Development flow:

```text
Windows Codex workspace
  -> zip project
  -> move zip to Linux server with MobaXterm/SCP
  -> unzip
  -> npm install
  -> run dashboard
```

Runtime flow:

```text
TurtleBot ROS2 nodes
  -> ROS-MQTT bridge on TurtleBot
  -> Mosquitto broker on Linux server
  -> React dashboard through MQTT WebSocket
```

The dashboard is designed for two robots by default:

```text
bot17
bot18
```

## Linux server requirements

Install Node.js 20 or newer.

```bash
node -v
npm -v
```

Install dependencies and run:

```bash
cd ship-defect-dashboard
npm install
npm run dev
```

Then open:

```text
http://SERVER_IP:5173
```

For a production build:

```bash
npm run build
npm run preview
```

Preview URL:

```text
http://SERVER_IP:4173
```

## Mosquitto WebSocket listener

The browser cannot connect to raw MQTT TCP `1883`. It needs WebSocket MQTT, for example port `9001`.

On the Linux server:

```bash
sudo nano /etc/mosquitto/conf.d/dashboard.conf
```

Example config:

```conf
listener 1883 0.0.0.0
allow_anonymous true

listener 9001 0.0.0.0
protocol websockets
allow_anonymous true
```

Restart and verify:

```bash
sudo systemctl restart mosquitto
ss -lntp | grep -E "1883|9001"
```

Dashboard broker URL:

```text
ws://10.10.16.201:9001
```

## MQTT topics

Pose topics:

```text
turtlebot/bot17/telemetry/pose
turtlebot/bot18/telemetry/pose
turtlebot/+/telemetry/pose
ship/crack_bot_01/state/pose
ship/crack_bot_02/state/pose
```

Odometry topics are also accepted:

```text
turtlebot/bot17/telemetry/odom
turtlebot/bot18/telemetry/odom
```

Status topics:

```text
turtlebot/bot17/telemetry/status
turtlebot/bot18/telemetry/status
ship/crack_bot_01/state/battery
ship/crack_bot_01/state/heartbeat
ship/crack_bot_01/state/safety
```

YOLO defect event topics:

```text
turtlebot/bot17/detection/defect
turtlebot/bot18/detection/defect
ship/crack_bot_01/detection/crack
ship/crack_bot_02/detection/crack
```

Navigation command published by the dashboard:

```text
turtlebot/{robot_id}/command/nav
ship/crack_bot_01/command/nav
ship/crack_bot_02/command/nav
```

## Pose payload

Recommended payload from the TurtleBot ROS-MQTT bridge:

```json
{
  "robot_id": "bot17",
  "x": 1.25,
  "y": -2.1,
  "z": 0.55,
  "theta": 1.57,
  "timestamp": "2026-07-04T05:40:00Z"
}
```

Coordinate convention in the dashboard:

```text
ROS x -> Three.js x
ROS y -> Three.js -z
ROS z -> Three.js y
ROS theta/yaw -> robot heading
```

If the bridge sends an odometry-like payload, this is also accepted:

```json
{
  "robot_id": "bot17",
  "position": {
    "x": 1.25,
    "y": -2.1,
    "z": 0.55
  },
  "orientation": {
    "x": 0,
    "y": 0,
    "z": 0.707,
    "w": 0.707
  }
}
```

The earlier C++ bridge found on the Linux server publishes this shape:

```json
{
  "frame_id": "map",
  "x": 1.25,
  "y": -2.1,
  "z": 0.0,
  "heading_deg": 90.0,
  "speed_mps": 0.12,
  "linear_x": 0.12,
  "angular_z": 0.0,
  "timestamp_ms": 1783140000000
}
```

The dashboard maps:

```text
ship/crack_bot_01 -> bot17
ship/crack_bot_02 -> bot18
```

## YOLO defect payload

Recommended payload:

```json
{
  "defect_id": "defect-001",
  "type": "crack",
  "confidence": 0.91,
  "severity": "high",
  "x": 3.4,
  "y": -2.55,
  "z": 1.3,
  "image_url": "http://10.10.16.201:8000/images/defect-001.jpg",
  "timestamp": "2026-07-04T05:42:00Z"
}
```

The dashboard places the defect marker on the 3D ship exterior using `x`, `y`, `z`.

## Goal command payload

When you click the floor in the 3D scene and press `Publish Goal`, the dashboard publishes:

Topic:

```text
ship/crack_bot_01/command/nav
```

Payload:

```json
{
  "robot_id": "bot17",
  "target": {
    "x": 1.2,
    "y": -0.5,
    "z": 0,
    "theta": 0
  },
  "timestamp": "2026-07-04T05:45:00.000Z"
}
```

The TurtleBot-side MQTT bridge should subscribe to this topic and convert it to a ROS2 Nav2 goal or another movement command.

The C++ bridge in `~/spider_bot/cpp_mqtt_bridge` now subscribes to:

```text
{base_topic}/command/nav
```

and sends a Nav2 `NavigateToPose` action goal to:

```text
navigate_to_pose
```

Example run command:

```bash
cd ~/spider_bot
source /opt/ros/humble/setup.bash
source install/setup.bash

ros2 run ship_crack_mqtt_bridge ship_crack_mqtt_bridge --ros-args \
  -p mqtt_server:=tcp://10.10.16.201:1883 \
  -p base_topic:=ship/crack_bot_01 \
  -p pose_topic:=/odom \
  -p nav_action_name:=navigate_to_pose \
  -p nav_frame_id:=map
```

## Current implementation

Implemented:

```text
React/Vite project
Three.js ship exterior placeholder model
bot17/bot18 robot markers
robot trail rendering
MQTT WebSocket connection
pose/odom/status/defect topic handling
YOLO defect markers
goal coordinate picking
navigation goal MQTT publish
simulation mode
```

Next recommended work:

```text
Replace the placeholder ship geometry with a real GLB model
Match coordinate origin with the real inspection map
Add TurtleBot-side ROS-MQTT bridge for pose/status/defect/nav
Add authentication/TLS after the demo works
```
