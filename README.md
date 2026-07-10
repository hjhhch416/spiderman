# 해상 선박 선체 검사 AI 로봇

ROS2 TurtleBot, Gazebo simulation, YOLO defect detection, and MQTT-based server dashboard integration project.

## Overview

This repository contains the code used to connect a TurtleBot-based inspection robot to a Linux server dashboard.

The main design is:

- ROS2 handles robot-side sensing, odometry, camera, lidar, and local robot bringup.
- MQTT sends lightweight data such as robot pose, YOLO detection results, bbox data, logs, and commands to the server.
- MJPEG streams camera frames to the React dashboard.
- Gazebo `/flat_odom` can be bridged to MQTT for simulation-driven 3D visualization.
- The React dashboard displays Gazebo, a Three.js ship exterior model, robot position, YOLO camera, and defect markers.

## Directory Structure

```text
.
├── dashboard/
│   └── ship-defect-dashboard/       # React + Three.js dashboard
├── bridges/
│   ├── turtlebot/                   # TurtleBot camera, YOLO, pose bridge scripts
│   └── gazebo/                      # Gazebo /flat_odom to MQTT bridge
├── ros2_packages/                   # C++ ROS2 MQTT bridge package experiments
├── scripts/
│   ├── server/                      # Linux server setup script
│   ├── turtlebot/                   # TurtleBot one-touch bringup script
│   ├── windows/                     # Windows launcher scripts
│   └── navigation/                  # Navigation bringup helper
├── docs/                            # Dashboard/manual notes
└── legacy/                          # Earlier static Three.js MQTT dashboard prototype
```

## Current Runtime Architecture

```text
TurtleBot ROS2
  ├─ /camera/image_raw
  │    └─ raw_camera_mjpeg_server.py -> http://BOT_IP:8080/stream.mjpg
  │          └─ server camera_proxy.py -> http://SERVER_IP:18080/stream.mjpg
  ├─ YOLO NCNN detector
  │    └─ MQTT: ship/crack_bot_01/detection/crack
  └─ lidar / scan / robot bringup topics

Gazebo Server
  └─ /flat_odom
       └─ gazebo_odom_to_mqtt.py -> MQTT: ship/crack_bot_01/state/pose

React Dashboard
  ├─ MQTT WebSocket: ws://SERVER_IP:9001
  ├─ Camera stream: http://SERVER_IP:18080/stream.mjpg
  ├─ Gazebo noVNC: http://SERVER_IP:6082/vnc_lite.html
  └─ 3D ship model / YOLO bbox / defect markers
```

## Key Topics

| Purpose | Topic |
| --- | --- |
| Gazebo/robot pose for dashboard | `ship/crack_bot_01/state/pose` |
| YOLO defect detection | `ship/crack_bot_01/detection/crack` |
| Navigation command | `ship/crack_bot_01/command/nav` |
| TurtleBot camera source | `/camera/image_raw` |
| Gazebo simulation pose source | `/flat_odom` |

## Dashboard

Path:

```bash
dashboard/ship-defect-dashboard
```

Run locally or on the Linux server:

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Default dashboard services used during testing:

```text
Dashboard:       http://10.91.214.129:5173
MQTT WebSocket:  ws://10.91.214.129:9001
MQTT TCP:        10.91.214.129:1883
Camera proxy:    http://10.91.214.129:18080/stream.mjpg
Gazebo noVNC:    http://10.91.214.129:6082/vnc_lite.html?autoconnect=1&resize=scale
```

## TurtleBot Bringup

Main script:

```bash
scripts/turtlebot/start_bot17_bridges_oneclick.sh
```

Typical use on TurtleBot:

```bash
SERVER_IP=192.168.0.3 ROS_DOMAIN_ID=17 ./start_bot17_bridges_oneclick.sh
```

This starts:

- TurtleBot bringup from `~/bin/bringup.sh`
- Camera bringup
- MJPEG camera bridge
- YOLO NCNN MQTT bridge

The TurtleBot-side `/odom` MQTT bridge is intentionally skipped in the current Gazebo-mode setup, because dashboard pose comes from Gazebo `/flat_odom`.

## Gazebo MQTT Bridge

Main script:

```bash
bridges/gazebo/start_gazebo_mqtt_bridge.sh
```

Typical use on the Linux server:

```bash
ROS_DOMAIN_ID=22 ODOM_TOPIC=/flat_odom ./start_gazebo_mqtt_bridge.sh
```

This publishes `/flat_odom` to:

```text
ship/crack_bot_01/state/pose
```

## Why MQTT

ROS2 is used inside the robot for sensor and control data. MQTT is used between the robot/server/dashboard because it is lightweight, easy to consume from web/server software, and allows the dashboard to subscribe only to the topics it needs.

Camera frames are not sent through MQTT. They are streamed separately through MJPEG. MQTT is used for small structured messages such as pose, bbox, detection results, state, and commands.

---

### 🎬 시연 영상
[![해상선박선체검사AI로봇 시연영상](https://i.ytimg.com/vi/KMK6EfqXQ_Y/maxresdefault.jpg)](https://youtu.be/KMK6EfqXQ_Y)

## Notes

- Large model files are not included. Put NCNN model files on the TurtleBot under `~/models/best_v5n_320_ncnn_model/`.
- Runtime logs, ROS build folders, `node_modules`, and generated archives are ignored.
- See `docs/DASHBOARD_MANUAL.md` for the longer operation manual.
