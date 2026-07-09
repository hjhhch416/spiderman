#!/usr/bin/env bash
set -eo pipefail

ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-22}"
ROBOT_ID="${ROBOT_ID:-bot17}"
MQTT_HOST="${MQTT_HOST:-127.0.0.1}"
MQTT_PORT="${MQTT_PORT:-1883}"
MQTT_TOPIC="${MQTT_TOPIC:-ship/crack_bot_01/state/pose}"
ODOM_TOPIC="${ODOM_TOPIC:-/flat_odom}"
RATE="${RATE:-10}"
DISPLAY_Z="${DISPLAY_Z:-0.25}"
PROJECT_DIR="${PROJECT_DIR:-$HOME/AHJ/gazebo_bridge}"

say() { printf '\n==> %s\n' "$1"; }
warn() { printf '\n[warn] %s\n' "$1"; }
fail() { printf '\n[error] %s\n' "$1"; exit 1; }

source /opt/ros/humble/setup.bash
if [ -f "$HOME/turtlebot3_ws/install/setup.bash" ]; then
  source "$HOME/turtlebot3_ws/install/setup.bash"
fi
if [ -f "$HOME/ros2_ws/install/setup.bash" ]; then
  source "$HOME/ros2_ws/install/setup.bash"
fi

export ROS_DOMAIN_ID

mkdir -p "$PROJECT_DIR"
[ -f "$PROJECT_DIR/gazebo_odom_to_mqtt.py" ] || fail "$PROJECT_DIR/gazebo_odom_to_mqtt.py not found"

say "Checking MQTT $MQTT_HOST:$MQTT_PORT"
if command -v nc >/dev/null 2>&1; then
  nc -z -w 3 "$MQTT_HOST" "$MQTT_PORT" || warn "MQTT TCP check failed"
fi

say "Gazebo/odom-like ROS topics"
ros2 topic list -t | grep -Ei 'gazebo|model|world|odom|pose|cmd_vel|clock' || true

if [ -z "$ODOM_TOPIC" ]; then
  for candidate in \
    /odom \
    /diff_drive_controller/odom \
    /model/turtlebot3_burger/odometry \
    /model/turtlebot3/odometry \
    /turtlebot3_burger/odom \
    /turtlebot3/odom
  do
    if ros2 topic list | grep -qx "$candidate"; then
      ODOM_TOPIC="$candidate"
      break
    fi
  done
fi

[ -n "$ODOM_TOPIC" ] || fail "No odometry topic found. Set ODOM_TOPIC=/your/gazebo/odom/topic"

say "Using odom topic: $ODOM_TOPIC"
timeout 5 ros2 topic echo "$ODOM_TOPIC" --once >/dev/null 2>&1 \
  || warn "$ODOM_TOPIC exists, but no sample arrived during quick check"

say "Stopping old Gazebo MQTT bridge"
pkill -f '[g]azebo_odom_to_mqtt.py' || true
sleep 1

say "Starting Gazebo odom MQTT bridge"
nohup python3 "$PROJECT_DIR/gazebo_odom_to_mqtt.py" \
  --odom-topic "$ODOM_TOPIC" \
  --robot-id "$ROBOT_ID" \
  --mqtt-topic "$MQTT_TOPIC" \
  --mqtt-host "$MQTT_HOST" \
  --mqtt-port "$MQTT_PORT" \
  --rate "$RATE" \
  --z "$DISPLAY_Z" \
  --map-mode raw \
  --best-effort \
  > "$HOME/gazebo_odom_mqtt_bridge.log" 2>&1 &

sleep 3

say "Process"
pgrep -af 'gazebo_odom_to_mqtt.py' || true

say "Log"
tail -40 "$HOME/gazebo_odom_mqtt_bridge.log" || true

say "MQTT receive test"
if command -v mosquitto_sub >/dev/null 2>&1; then
  timeout 6 mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "$MQTT_TOPIC" -C 1 -v || true
else
  warn "mosquitto_sub is not installed"
fi
