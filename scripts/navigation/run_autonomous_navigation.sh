#!/usr/bin/env bash
set -eo pipefail

ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-17}"
TURTLEBOT3_MODEL="${TURTLEBOT3_MODEL:-burger}"
USE_SIM_TIME="${USE_SIM_TIME:-false}"
MAP_FILE="${MAP_FILE:-/opt/ros/humble/share/turtlebot3_navigation2/map/map.yaml}"
PARAMS_FILE="${PARAMS_FILE:-/opt/ros/humble/share/turtlebot3_navigation2/param/humble/${TURTLEBOT3_MODEL}.yaml}"
LOG_DIR="${LOG_DIR:-$HOME/ros2_ws/logs}"
NAV_LOG="$LOG_DIR/nav2.log"
INITIAL_X="${INITIAL_X:-0.0}"
INITIAL_Y="${INITIAL_Y:-0.0}"
INITIAL_YAW_Z="${INITIAL_YAW_Z:-0.0}"
INITIAL_YAW_W="${INITIAL_YAW_W:-1.0}"

say() { printf '\n==> %s\n' "$1"; }
warn() { printf '\n[warn] %s\n' "$1"; }
fail() { printf '\n[error] %s\n' "$1"; exit 1; }

wait_for_topic() {
  local topic="$1"
  local timeout_sec="${2:-20}"
  say "Waiting for $topic"
  for _ in $(seq 1 "$timeout_sec"); do
    if ros2 topic list 2>/dev/null | grep -qx "$topic"; then
      return 0
    fi
    sleep 1
  done
  fail "$topic was not found after ${timeout_sec}s"
}

topic_once() {
  local topic="$1"
  local timeout_sec="${2:-5}"
  timeout "$timeout_sec" ros2 topic echo "$topic" --once >/dev/null 2>&1
}

nav_state() {
  local node="$1"
  timeout 2 ros2 lifecycle get "$node" 2>/dev/null || true
}

ensure_file() {
  local path="$1"
  [ -f "$path" ] || fail "$path not found"
}

publish_initial_pose() {
  say "Publishing initial pose for AMCL"
  for _ in 1 2 3; do
    timeout 4 ros2 topic pub --once /initialpose geometry_msgs/msg/PoseWithCovarianceStamped \
      "{header: {frame_id: map}, pose: {pose: {position: {x: $INITIAL_X, y: $INITIAL_Y, z: 0.0}, orientation: {z: $INITIAL_YAW_Z, w: $INITIAL_YAW_W}}, covariance: [0.25, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.25, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0685]}}" \
      >/dev/null 2>&1 || true
    sleep 1
  done
}

export ROS_DOMAIN_ID
export TURTLEBOT3_MODEL

source /opt/ros/humble/setup.bash
if [ -f "$HOME/turtlebot3_ws/install/setup.bash" ]; then
  source "$HOME/turtlebot3_ws/install/setup.bash"
fi

ensure_file "$MAP_FILE"
ensure_file "$PARAMS_FILE"
mkdir -p "$LOG_DIR"

say "ROS_DOMAIN_ID=$ROS_DOMAIN_ID"
say "TURTLEBOT3_MODEL=$TURTLEBOT3_MODEL"
say "MAP_FILE=$MAP_FILE"
say "PARAMS_FILE=$PARAMS_FILE"

wait_for_topic /odom 20
wait_for_topic /scan 20
wait_for_topic /tf 20

topic_once /odom 5 || warn "/odom exists, but no odom sample arrived during the quick check"
topic_once /scan 5 || warn "/scan exists, but no scan sample arrived during the quick check"
topic_once /tf 5 || warn "/tf exists, but no TF sample arrived during the quick check"

say "Stopping old Nav2 processes"
old_pids="$(ps -eo pid,cmd | awk '/turtlebot3_navigation2|nav2_bringup|nav2_container|controller_server|planner_server|bt_navigator|amcl|map_server/ && !/awk/ {print $1}')"
if [ -n "$old_pids" ]; then
  kill $old_pids 2>/dev/null || true
  sleep 3
fi

say "Starting Nav2 without RViz"
nohup ros2 launch nav2_bringup bringup_launch.py \
  slam:=False \
  map:="$MAP_FILE" \
  params_file:="$PARAMS_FILE" \
  use_sim_time:="$USE_SIM_TIME" \
  autostart:=true \
  use_composition:=False \
  > "$NAV_LOG" 2>&1 &

sleep 12

say "Requesting lifecycle startup"
timeout 10 ros2 service call /lifecycle_manager_localization/manage_nodes nav2_msgs/srv/ManageLifecycleNodes "{command: 0}" >/dev/null 2>&1 || warn "localization lifecycle startup request did not complete"
publish_initial_pose
timeout 10 ros2 service call /lifecycle_manager_navigation/manage_nodes nav2_msgs/srv/ManageLifecycleNodes "{command: 0}" >/dev/null 2>&1 || warn "navigation lifecycle startup request did not complete"
publish_initial_pose

sleep 4

say "Nav2 lifecycle states"
for node in /map_server /amcl /controller_server /planner_server /bt_navigator /behavior_server /waypoint_follower /velocity_smoother /global_costmap/global_costmap /local_costmap/local_costmap; do
  printf '%-36s %s\n' "$node" "$(nav_state "$node")"
done

inactive="$(for node in /map_server /amcl /controller_server /planner_server /bt_navigator /behavior_server /waypoint_follower /velocity_smoother; do nav_state "$node" | grep -q 'active' || echo "$node"; done)"
if [ -n "$inactive" ]; then
  warn "Some Nav2 nodes are not active:"
  printf '%s\n' "$inactive"
  warn "Recent Nav2 log:"
  tail -120 "$NAV_LOG" || true
  exit 2
fi

say "Nav2 is active"
echo "Log: $NAV_LOG"
