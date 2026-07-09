#!/bin/bash
# real_robot_navigation.sh
# Starts RTAB-Map Localization, Nav2, Autonomy Node, and RViz2 in Domain 17 for Real TurtleBot
# Uses direct /odom and native flat-chassis representation (aligned to RViz X-axis)

export ROS_DOMAIN_ID=17
export TURTLEBOT3_MODEL=waffle
export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
source /opt/ros/humble/setup.bash
source ~/ros2_humble/install/setup.bash 2>/dev/null
source ~/ros2_ws/install/setup.bash

echo "================================================="
echo "   Starting Real Robot Navigation System (Domain 17)"
echo "   * Mode: 3D Costmap Navigation (No Unrollers) *"
echo "================================================="

# --- [0] 기존 프로세스 사전 청소 ---
echo "Cleaning up old Nav2, SLAM, RViz and Autonomy processes..."
killall -9 navigation_launch.py bt_navigator controller_server planner_server behavior_server velocity_smoother waypoint_follower 2>/dev/null
killall -9 rviz2 odom_unroller scan_unroller pointcloud_to_laserscan_node rtabmap rtabmap_viz wall_crawler_autonomy_3d.py map_navigation_client.py 2>/dev/null
pkill -9 -f nav2 2>/dev/null
pkill -9 -f wall_unroller 2>/dev/null
pkill -9 -f pointcloud_to_laserscan 2>/dev/null
pkill -9 -f rviz 2>/dev/null
pkill -9 -f wall_crawler_autonomy 2>/dev/null
sleep 2
echo "Cleanup completed."

# [1/2] RTAB-Map Localization Mode (Direct odom_topic:=/odom, qos_scan:=2 for Best Effort)
echo "[1/2] Starting RTAB-Map in LOCALIZATION mode..."
ros2 run tf2_ros static_transform_publisher 0 0 0.1 0 0 0 base_link laser_frame &
STATIC_TF_PID=$!
ros2 run tf2_ros static_transform_publisher 0 0 0.01 0 0 0 base_footprint base_link &
STATIC_TF_FOOTPRINT_PID=$!
STATIC_TF_PID=$!
sleep 1
echo "[1/2] Starting RTAB-Map in LOCALIZATION mode..."
ros2 launch rtabmap_launch rtabmap.launch.py \
    use_sim_time:=false \
    localization:=true \
    initial_pose:="0 0 0 0 0 0" \
    frame_id:=base_footprint \
    odom_topic:=/odom \
    subscribe_scan:=false \
    subscribe_scan_cloud:=true \
    scan_cloud_topic:=/scan_3D \
    qos_scan:=2 \
    subscribe_rgb:=false \
    depth:=false \
    approx_sync:=true \
    visual_odometry:=false \
    database_path:=/home/lee/ros2_ws/real_rtabmap.db \
    map_topic:=/rtabmap/map \
    args:="--Reg/Force3D false --Reg/Strategy 0 --Grid/FromDepth false --Grid/MinGroundHeight -0.5 --Grid/MaxGroundHeight 0.12 --Grid/MaxObstacleHeight 2.0 --Grid/RangeMin 0.3 --Grid/RangeMax 1.2 --RGBD/NeighborLinkRefinement false --RGBD/ProximityBySpace true --RGBD/ProximityPathMaxNeighbors 15 --RGBD/LocalRadius 1.5 --RGBD/ProximityMaxPaths 5 --Icp/MaxTranslation 1.5 --Icp/CorrespondenceRatio 0.15" \
    rtabmap_viz:=false \
    rviz:=false \
    > ~/.ros/log/real_rtabmap_nav.log 2>&1 &
RTABMAP_PID=$!
sleep 2

# [2/2] Nav2 Navigation Stack (using direct /odom frame parameters, remapping scan_3d to /scan_3D)
echo "[2/2] Starting Nav2 Bringup (Map Server + Navigation) (use_sim_time=false)..."
ros2 launch nav2_bringup bringup_launch.py \
    use_sim_time:=false \
    amcl:=false \
    map:=/home/lee/map.yaml \
    params_file:=/home/lee/ros2_ws/flat_nav2_params.yaml \
    > ~/.ros/log/real_nav2_nav.log 2>&1 &
NAV2_PID=$!
sleep 3
echo "       Nav2 ready."

# Starting Autonomy Control Node (Point-click receiver, use_sim_time=false)
ros2 run my_ship_robot wall_crawler_autonomy_3d.py > ~/.ros/log/real_autonomy_nav.log 2>&1 &
AUTONOMY_PID=$!

# Start RViz2 with Custom RViz configuration for Real-time rendering
echo "Starting RViz2 with rendering overrides..."
export LIBGL_ALWAYS_SOFTWARE=1
export MESA_GL_VERSION_OVERRIDE=3.3
export MESA_GLSL_VERSION_OVERRIDE=330
ros2 run rviz2 rviz2 -d /home/lee/ros2_ws/nav2_with_3dmap.rviz \
    --ros-args -p use_sim_time:=false &
RVIZ_PID=$!

echo "=========================================================="
echo "    ALL SYSTEM COMPONENTS STARTED ON REAL ROBOT!"
echo "  * Mode: Real Robot 3D Obstacle Costmap & Navigation"
echo "  * Domain ID: 17"
echo "  * To Set Goal: Use 'Publish Point' or 'Nav2 Goal' in RViz"
echo "  (Press Ctrl+C to terminate ALL nodes safely)"
echo "=========================================================="

cleanup() {
    echo "Stopping all system components..."
    kill -2 $RVIZ_PID $AUTONOMY_PID $NAV2_PID $RTABMAP_PID $STATIC_TF_PID $STATIC_TF_FOOTPRINT_PID 2>/dev/null
    sleep 3
    kill -9 $RVIZ_PID $AUTONOMY_PID $NAV2_PID $RTABMAP_PID $STATIC_TF_PID $STATIC_TF_FOOTPRINT_PID 2>/dev/null
    echo "System shutdown complete."
    exit 0
}

trap cleanup SIGINT SIGTERM
wait
