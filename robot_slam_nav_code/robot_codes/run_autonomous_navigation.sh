#!/bin/bash
# run_autonomous_navigation.sh
# Starts Gazebo, Flat Projection nodes, RTAB-Map Localization, Nav2 (3D scan costmap enabled), Autonomy Node, and RViz2 in a single terminal!

export ROS_DOMAIN_ID=22
export TURTLEBOT3_MODEL=waffle
export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
source /opt/ros/humble/setup.bash
source ~/ros2_humble/install/setup.bash 2>/dev/null
source ~/ros2_ws/install/setup.bash

echo "================================================="
echo "   Starting Full Autonomous Navigation System"
echo "   * 3D LiDAR Obstacle Costmap Integration Active *"
echo "================================================="

# --- [0] 기존 잔존 프로세스 사전 청소 ---
echo "Cleaning up old Gazebo, SLAM, Nav2, RTAB-Map, RViz and Autonomy processes..."
killall -9 navigation_launch.py bt_navigator controller_server planner_server behavior_server velocity_smoother waypoint_follower 2>/dev/null
killall -9 gzserver gzclient robot_state_publisher spawn_entity.py rviz2 online_async_launch.py odom_unroller scan_unroller pointcloud_to_laserscan_node 2>/dev/null
killall -9 rtabmap rtabmap_viz rgbd_sync slam_toolbox wall_crawler_autonomy_3d.py map_navigation_client.py 2>/dev/null
pkill -9 -f nav2 2>/dev/null
pkill -9 -f gazebo 2>/dev/null
pkill -9 -f spawn_entity 2>/dev/null
pkill -9 -f wall_unroller 2>/dev/null
pkill -9 -f pointcloud_to_laserscan 2>/dev/null
pkill -9 -f rviz 2>/dev/null
pkill -9 -f slam_toolbox 2>/dev/null
pkill -9 -f wall_crawler_autonomy 2>/dev/null
sleep 2
echo "Cleanup completed."

# [1/4] Gazebo + Robot
echo "[1/4] Starting Gazebo..."
ros2 launch my_ship_robot wall_crawler_realistic.launch.py > ~/.ros/log/gazebo_nav.log 2>&1 &
GAZEBO_PID=$!
sleep 15
echo "       Gazebo ready."

# [2/4] Odom Unroller (Publish flat_odom TF for map -> flat_odom -> base_footprint tree)
echo "[2/4] Starting Odom Unroller..."
ros2 run wall_unroller odom_unroller --ros-args \
    -p use_sim_time:=true \
    -p input_odom:=/odom \
    -p output_odom:=/flat_odom \
    > ~/.ros/log/odom_unroller_nav.log 2>&1 &
ODOM_PID=$!
sleep 2

# [3/4] RTAB-Map Localization Mode (Publishes /map globally, listens to /scan_3d)
echo "[3/4] Starting RTAB-Map in LOCALIZATION mode..."
ros2 launch rtabmap_launch rtabmap.launch.py \
    use_sim_time:=true \
    localization:=true \
    initial_pose:="0 0 0 0 0 0" \
    frame_id:=base_footprint \
    odom_topic:=/flat_odom \
    subscribe_scan:=false \
    subscribe_scan_cloud:=true \
    scan_cloud_topic:=/scan_3d \
    subscribe_rgb:=false \
    depth:=false \
    approx_sync:=true \
    visual_odometry:=false \
    database_path:=/home/lee/ros2_ws/rtabmap.db \
    map_topic:=/map \
    args:="--Reg/Force3D false --Reg/Strategy 1 --Grid/FromDepth false --Grid/MinGroundHeight -0.5 --Grid/MaxGroundHeight 0.08 --Grid/MaxObstacleHeight 2.0 --Grid/RangeMin 0.3 --Grid/RangeMax 5.0 --RGBD/NeighborLinkRefinement true" \
    rtabmap_viz:=false \
    rviz:=false \
    > ~/.ros/log/rtabmap_nav.log 2>&1 &
RTABMAP_PID=$!
sleep 4

# [4/4] Nav2 Navigation Stack (3D PointCloud2 Obstacle layer directly enabled)
echo "[4/4] Starting Nav2 Navigation (3D Obstacle mode)..."
ros2 launch nav2_bringup navigation_launch.py \
    use_sim_time:=true \
    amcl:=false \
    params_file:=/home/lee/ros2_ws/flat_nav2_params_sim.yaml \
    > ~/.ros/log/nav2_nav.log 2>&1 &
NAV2_PID=$!
sleep 5
echo "       Nav2 ready."

# Starting Autonomy Control Node in background (for RViz clicked point)
ros2 run my_ship_robot wall_crawler_autonomy_3d.py > ~/.ros/log/autonomy_nav.log 2>&1 &
AUTONOMY_PID=$!

# Start RViz2 with Custom RViz configuration for 3D map rendering
echo "Starting RViz2 with rendering overrides..."
export LIBGL_ALWAYS_SOFTWARE=1
export MESA_GL_VERSION_OVERRIDE=3.3
export MESA_GLSL_VERSION_OVERRIDE=330
ros2 run rviz2 rviz2 -d /home/lee/ros2_ws/nav2_with_3dmap.rviz \
    --ros-args -p use_sim_time:=true &
RVIZ_PID=$!

echo "=========================================================="
echo "    ALL SYSTEM COMPONENTS STARTED IN A SINGLE TERMINAL!"
echo "  * Mode: 3D LiDAR Direct Obstacle Costmap & Navigation"
echo "  * To Set Goal: Use 'Publish Point' or 'Nav2 Goal' in RViz"
echo "  (Press Ctrl+C to terminate ALL nodes safely)"
echo "=========================================================="

cleanup() {
    echo "Stopping all system components..."
    kill -2 $RVIZ_PID $AUTONOMY_PID $NAV2_PID $RTABMAP_PID $ODOM_PID $GAZEBO_PID 2>/dev/null
    sleep 3
    kill -9 $RVIZ_PID $AUTONOMY_PID $NAV2_PID $RTABMAP_PID $ODOM_PID $GAZEBO_PID 2>/dev/null
    echo "System shutdown complete."
    exit 0
}

trap cleanup SIGINT SIGTERM
wait
