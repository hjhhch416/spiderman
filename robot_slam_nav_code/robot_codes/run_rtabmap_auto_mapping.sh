#!/bin/bash
# run_rtabmap_auto_mapping.sh
# Starts Gazebo, Flat Projection nodes, RTAB-Map in Mapping mode, and RViz2,
# then launches the Autonomous Roomba Explorer in the background to automatically map the walls.

export ROS_DOMAIN_ID=22
export TURTLEBOT3_MODEL=waffle
export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
source /opt/ros/humble/setup.bash
source ~/ros2_humble/install/setup.bash 2>/dev/null
source ~/ros2_ws/install/setup.bash

echo "================================================="
echo "   Starting Autonomous RTAB-Map Auto Mapping"
echo "   * Roomba-Style Coverage Explorer Integration *"
echo "================================================="

# --- [0/4] 기존 잔존 프로세스 사전 청소 ---
echo "Cleaning up old Gazebo, SLAM, Nav2, RViz and Autonomy processes..."
killall -9 navigation_launch.py bt_navigator controller_server planner_server behavior_server velocity_smoother waypoint_follower 2>/dev/null
killall -9 gzserver gzclient robot_state_publisher spawn_entity.py rviz2 online_async_launch.py odom_unroller scan_unroller pointcloud_to_laserscan_node 2>/dev/null
killall -9 rtabmap rtabmap_viz rgbd_sync slam_toolbox wall_crawler_autonomy_3d.py wall_crawler_auto_explorer.py 2>/dev/null
pkill -9 -f wall_crawler_auto_explorer 2>/dev/null
sleep 2
echo "Cleanup completed."

# [1/4] Gazebo + Robot
echo "[1/4] Starting Gazebo..."
ros2 launch my_ship_robot wall_crawler_realistic.launch.py > ~/.ros/log/gazebo_mapping.log 2>&1 &
GAZEBO_PID=$!
sleep 15
echo "       Gazebo ready."

# [2/4] PointCloud2 -> LaserScan (For obstacle scanning)
echo "[2/4] Starting PointCloud2 to LaserScan converter..."
ros2 run pointcloud_to_laserscan pointcloud_to_laserscan_node \
    --ros-args \
    -r cloud_in:=/scan_3d \
    -p use_sim_time:=true \
    -p min_height:=0.08 \
    -p max_height:=0.3 \
    -p range_min:=0.1 \
    -p range_max:=10.0 \
    -p target_frame:=base_link \
    -p qos_overrides./scan.publisher.reliability:=reliable \
    > ~/.ros/log/pc2ls_mapping.log 2>&1 &
PC2LS_PID=$!
sleep 2

# [3/4] Unrollers (Odom to /flat_odom, Scan to /flat_scan)
echo "[3/4] Starting Odom and Scan Unrollers..."
ros2 run wall_unroller odom_unroller --ros-args \
    -p use_sim_time:=true \
    -p input_odom:=/odom \
    -p output_odom:=/flat_odom \
    > ~/.ros/log/odom_unroller_mapping.log 2>&1 &
ODOM_PID=$!

ros2 run wall_unroller scan_unroller --ros-args \
    -p use_sim_time:=true \
    -p input_scan:=/scan \
    -p output_scan:=/flat_scan \
    > ~/.ros/log/scan_unroller_mapping.log 2>&1 &
SCAN_PID=$!
sleep 2

# [4/4] RTAB-Map Mapping Mode (Subscribes to 3D cloud /scan_3d directly, builds 2D map)
echo "[4/4] Starting RTAB-Map (3D Cloud input)..."
ros2 launch rtabmap_launch rtabmap.launch.py \
    use_sim_time:=true \
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
    args:="-d --Reg/Force3D false --Reg/Strategy 1 --Grid/FromDepth false --Grid/MinGroundHeight -0.5 --Grid/MaxGroundHeight 0.08 --Grid/MaxObstacleHeight 2.0 --Grid/RangeMin 0.3 --Grid/RangeMax 5.0 --RGBD/NeighborLinkRefinement true" \
    rtabmap_viz:=false \
    rviz:=false \
    > ~/.ros/log/rtabmap_mapping.log 2>&1 &
RTABMAP_PID=$!
sleep 3

# Start RViz2 with Custom RViz configuration for 3D map rendering
echo "Starting RViz2 with rendering overrides and 3D Cloud display..."
export LIBGL_ALWAYS_SOFTWARE=1
export MESA_GL_VERSION_OVERRIDE=3.3
export MESA_GLSL_VERSION_OVERRIDE=330
ros2 run rviz2 rviz2 -d /home/lee/ros2_ws/nav2_with_3dmap.rviz \
    --ros-args -p use_sim_time:=true &
RVIZ_PID=$!

echo "=========================================================="
echo "    AUTONOMOUS MAP EXPLORER IS RUNNING!"
echo "    The robot is automatically sweeping the wall (Roomba style)."
echo "    * Output Map: /map"
echo "    (Press Ctrl+C to terminate auto mapping & clean up)"
echo "=========================================================="

cleanup() {
    echo "Stopping all mapping and explorer nodes..."
    kill -2 $RVIZ_PID $EXPLORER_PID $RTABMAP_PID $SCAN_PID $ODOM_PID $PC2LS_PID $GAZEBO_PID 2>/dev/null
    sleep 3
    kill -9 $RVIZ_PID $EXPLORER_PID $RTABMAP_PID $SCAN_PID $ODOM_PID $PC2LS_PID $GAZEBO_PID 2>/dev/null
    echo "Cleanup completed."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Run the Roomba-style Autonomous Explorer in background and wait on its PID
python3 /home/lee/ros2_ws/src/my_ship_robot/scripts/wall_crawler_auto_explorer.py &
EXPLORER_PID=$!

wait $EXPLORER_PID
cleanup
