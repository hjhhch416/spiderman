#!/usr/bin/env bash
set -eo pipefail

SERVER_IP="${1:-${SERVER_IP:-192.168.0.3}}"
MQTT_PORT="${MQTT_PORT:-1883}"
ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-17}"
TURTLEBOT3_MODEL="${TURTLEBOT3_MODEL:-burger}"
LDS_MODEL="${LDS_MODEL:-LDS-01}"
BOT_ID="${BOT_ID:-bot17}"
BASE_TOPIC="${BASE_TOPIC:-ship/crack_bot_01}"
PROJECT_DIR="${PROJECT_DIR:-$HOME/project4_detect}"
MODEL_DIR="${MODEL_DIR:-$HOME/models/best_v5n_320_ncnn_model}"
CAMERA_PORT="${CAMERA_PORT:-8080}"
ROBOT_BRINGUP_CMD="${ROBOT_BRINGUP_CMD:-$HOME/bin/bringup.sh}"

say() { printf '\n==> %s\n' "$1"; }
warn() { printf '\n[warn] %s\n' "$1"; }
fail() { printf '\n[error] %s\n' "$1"; exit 1; }

say "Using server MQTT host: $SERVER_IP:$MQTT_PORT"
say "Using ROS_DOMAIN_ID=$ROS_DOMAIN_ID, BOT_ID=$BOT_ID, BASE_TOPIC=$BASE_TOPIC"

export ROS_DOMAIN_ID
export TURTLEBOT3_MODEL
export LDS_MODEL

source /opt/ros/humble/setup.bash
if [ -f "$HOME/turtlebot3_ws/install/setup.bash" ]; then
  source "$HOME/turtlebot3_ws/install/setup.bash"
else
  fail "$HOME/turtlebot3_ws/install/setup.bash not found"
fi

[ -f "$PROJECT_DIR/raw_camera_mjpeg_server.py" ] || fail "$PROJECT_DIR/raw_camera_mjpeg_server.py not found"
[ -f "$PROJECT_DIR/detect_raw_ncnn_mqtt.py" ] || fail "$PROJECT_DIR/detect_raw_ncnn_mqtt.py not found"
[ -f "$MODEL_DIR/model.ncnn.param" ] || fail "$MODEL_DIR/model.ncnn.param not found"
[ -f "$MODEL_DIR/model.ncnn.bin" ] || fail "$MODEL_DIR/model.ncnn.bin not found"
[ -f "$ROBOT_BRINGUP_CMD" ] || fail "$ROBOT_BRINGUP_CMD not found"

mkdir -p "$PROJECT_DIR/detection_logs"

say "Checking MQTT TCP connection to server"
if command -v nc >/dev/null 2>&1; then
  nc -z -w 3 "$SERVER_IP" "$MQTT_PORT" || warn "Cannot connect to MQTT $SERVER_IP:$MQTT_PORT yet"
else
  warn "nc not installed. Skipping MQTT TCP precheck."
fi

say "Stopping old bot17 dashboard processes"
pkill -f '[d]etect_raw_ncnn_mqtt.py' || true
pkill -f '[o]dom_to_mqtt.py' || true
pkill -f '[r]tabmap_pose_to_mqtt.py' || true
pkill -f '[r]aw_camera_mjpeg_server.py' || true
pkill -f 'camera.launch.py' || true
pkill -f 'component_container.*camera_container' || true
pkill -f '[c]yglidar' || true
pkill -f '[b]ringup.sh' || true
pkill -f 'robot.launch.py' || true
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${CAMERA_PORT}/tcp" 2>/dev/null || true
fi
sleep 2

say "Starting TurtleBot3 robot bringup from $ROBOT_BRINGUP_CMD"
nohup bash -lc "export ROS_DOMAIN_ID=$ROS_DOMAIN_ID; export TURTLEBOT3_MODEL=$TURTLEBOT3_MODEL; export LDS_MODEL=$LDS_MODEL; source /opt/ros/humble/setup.bash; source $HOME/turtlebot3_ws/install/setup.bash; bash $ROBOT_BRINGUP_CMD" \
  > "$HOME/robot_bringup.log" 2>&1 &

say "Starting camera bringup"
nohup bash -lc "export ROS_DOMAIN_ID=$ROS_DOMAIN_ID; source /opt/ros/humble/setup.bash; source $HOME/turtlebot3_ws/install/setup.bash; ros2 launch turtlebot3_bringup camera.launch.py format:=BGR888" \
  > "$HOME/camera_bringup.log" 2>&1 &

say "Waiting for ROS topics"
sleep 8

say "Starting MJPEG camera bridge"
nohup bash -lc "export ROS_DOMAIN_ID=$ROS_DOMAIN_ID; source /opt/ros/humble/setup.bash; source $HOME/turtlebot3_ws/install/setup.bash; python3 $PROJECT_DIR/raw_camera_mjpeg_server.py --topic /camera/image_raw --host 0.0.0.0 --port $CAMERA_PORT" \
  > "$HOME/mjpeg_bridge.log" 2>&1 &

say "Skipping bot odom to MQTT bridge; dashboard pose comes from Gazebo /flat_odom"

say "Starting YOLO MQTT bridge"
nohup bash -lc "export ROS_DOMAIN_ID=$ROS_DOMAIN_ID; source /opt/ros/humble/setup.bash; source $HOME/turtlebot3_ws/install/setup.bash; python3 $PROJECT_DIR/detect_raw_ncnn_mqtt.py --broker $SERVER_IP --robot-id $BOT_ID --image-topic /camera/image_raw --defect-topic $BASE_TOPIC/detection/crack --pose-topic $BASE_TOPIC/state/pose --param-path $MODEL_DIR/model.ncnn.param --bin-path $MODEL_DIR/model.ncnn.bin --log-path $PROJECT_DIR/detection_logs/detections.jsonl --duplicate-window 20 --duplicate-iou 0.35 --duplicate-center-px 80 --duplicate-pose-distance 0.6" \
  > "$HOME/yolo_mqtt_bridge.log" 2>&1 &

sleep 8

say "Process status"
pgrep -af 'bringup.sh|robot.launch|cyglidar|camera.launch|turtlebot3_ros|raw_camera_mjpeg_server.py|detect_raw_ncnn_mqtt.py' || true

say "Topic status"
ros2 topic list | grep -E '^/(cmd_vel|odom|scan|camera/image_raw|camera/image_raw/compressed)$' || true
ros2 topic list | grep -Ei 'scan|point|cloud|lidar|cyg' || true
ros2 topic info -v /camera/image_raw || true

say "Port status"
ss -lntp | grep ":$CAMERA_PORT" || true

BOT_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
say "Done"
echo "Bot IP candidates: $(hostname -I 2>/dev/null || true)"
echo "Camera URL: http://${BOT_IP:-BOT_IP}:$CAMERA_PORT/stream.mjpg"
echo "MQTT pose topic: $BASE_TOPIC/state/pose"
echo "MQTT detection topic: $BASE_TOPIC/detection/crack"
echo "Logs:"
echo "  $HOME/robot_bringup.log"
echo "  $HOME/camera_bringup.log"
echo "  $HOME/mjpeg_bridge.log"
echo "  $HOME/yolo_mqtt_bridge.log"
