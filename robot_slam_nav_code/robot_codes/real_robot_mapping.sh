#!/bin/bash
# real_robot_mapping.sh
# Starts PointCloud to LaserScan, RTAB-Map Mapping, and RViz2 for Real TurtleBot in DOMAIN 17
# Uses direct /odom and native flat-chassis representation (aligned to RViz X-axis)

export ROS_DOMAIN_ID=17
export TURTLEBOT3_MODEL=waffle
export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
source /opt/ros/humble/setup.bash
source ~/ros2_humble/install/setup.bash 2>/dev/null
source ~/ros2_ws/install/setup.bash

echo "================================================="
echo "   Starting Real Robot Mapping System (Domain 17)"
echo "   * Mode: Manual 2D Direct Mapping (No Unrollers) *"
echo "================================================="

# --- [0] 기존 프로세스 사전 청소 ---
echo "Cleaning up old SLAM, RTAB-Map, RViz and Autonomy processes..."
killall -9 rviz2 odom_unroller scan_unroller pointcloud_to_laserscan_node rtabmap rtabmap_viz navigation_launch.py 2>/dev/null
pkill -9 -f wall_unroller 2>/dev/null
pkill -9 -f pointcloud_to_laserscan 2>/dev/null
pkill -9 -f rtabmap 2>/dev/null
pkill -9 -f wall_crawler_auto_explorer 2>/dev/null
pkill -9 -f nav2 2>/dev/null
sleep 2
echo "Cleanup completed."

# [1/2] PointCloud2 -> LaserScan (cloud_in QoS Best Effort, output scan:=/flat_scan)
echo "[1/2] Starting PointCloud2 to LaserScan converter..."
ros2 run pointcloud_to_laserscan pointcloud_to_laserscan_node \
    --ros-args \
    -r cloud_in:=/scan_3D \
    -r scan:=/flat_scan \
    -p use_sim_time:=false \
    -p min_height:=0.12 \
    -p max_height:=0.3 \
    -p range_min:=0.1 \
    -p range_max:=1.2 \
    -p target_frame:=base_link \
    -p qos_overrides./scan_3D.subscription.reliability:=best_effort \
    > ~/.ros/log/real_pc2ls_mapping.log 2>&1 &
PC2LS_PID=$!
sleep 1

# [2/2] RTAB-Map Mapping Mode (Direct odom_topic:=/odom, qos_scan:=2 for Best Effort)
echo "[2/2] Starting RTAB-Map (Real Robot mode)..."
ros2 run tf2_ros static_transform_publisher 0 0 0.1 0 0 0 base_link laser_frame &
STATIC_TF_PID=$!
ros2 run tf2_ros static_transform_publisher 0 0 0.01 0 0 0 base_footprint base_link &
STATIC_TF_FOOTPRINT_PID=$!
STATIC_TF_PID=$!
sleep 1
echo "[2/2] Starting RTAB-Map (Real Robot mode)..."
ros2 launch rtabmap_launch rtabmap.launch.py \
    use_sim_time:=false \
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
    map_topic:=/map \
    args:="-d --Reg/Force3D false --Reg/Strategy 1 --Grid/FromDepth false --Grid/MinGroundHeight -0.08 --Grid/MaxGroundHeight 0.08 --Grid/MaxObstacleHeight 0.6 --Grid/RangeMin 0.1 --Grid/RangeMax 1.2 --Grid/RayTracing true --Grid/FootprintRadius 0.15 --Grid/NormalsSegmentation false --RGBD/ProximityBySpace true --Icp/MaxTranslation 1.5 --Icp/CorrespondenceRatio 0.15" \
    rtabmap_viz:=false \
    rviz:=false \
    > ~/.ros/log/real_rtabmap_mapping.log 2>&1 &
RTABMAP_PID=$!
sleep 2

# Start RViz2 with Custom RViz configuration for Real-time rendering
echo "Starting RViz2 with rendering overrides..."
export LIBGL_ALWAYS_SOFTWARE=1
export MESA_GL_VERSION_OVERRIDE=3.3
export MESA_GLSL_VERSION_OVERRIDE=330
ros2 run rviz2 rviz2 -d /home/lee/ros2_ws/nav2_with_3dmap.rviz \
    --ros-args -p use_sim_time:=false &
RVIZ_PID=$!

echo "=========================================================="
echo "    REAL ROBOT MANUAL MAPPING RUNNING!"
echo "    Drive the robot manually (e.g., using teleop) to create the map."
echo "    * Output Map: /map"
echo "    * Output Database: ~/ros2_ws/real_rtabmap.db"
echo "    (Press Ctrl+C to terminate mapping & clean up)"
echo "=========================================================="

cleanup() {
    echo "Stopping all mapping nodes..."
    kill -2 $RVIZ_PID $RTABMAP_PID $PC2LS_PID $STATIC_TF_PID $STATIC_TF_FOOTPRINT_PID 2>/dev/null
    sleep 3
    kill -9 $RVIZ_PID $RTABMAP_PID $PC2LS_PID $STATIC_TF_PID $STATIC_TF_FOOTPRINT_PID 2>/dev/null
    echo "Cleanup completed."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait on RTABMAP node to keep terminal alive
wait $RTABMAP_PID
