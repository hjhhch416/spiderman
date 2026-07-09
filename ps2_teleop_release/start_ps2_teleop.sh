#!/usr/bin/env bash
# ROS 2 PS2 Teleop Autoreload Wrapper Script

# Default starting domain ID is now 17
DOMAIN=17
DOMAIN_FILE="$HOME/.ps2_teleop_domain"

# Source ROS 2 and workspace setup files
source /opt/ros/humble/setup.bash
source "$HOME/turtlebot3_ws/install/setup.bash" 2>/dev/null || true
export TURTLEBOT3_MODEL=burger

while true; do
    export ROS_DOMAIN_ID=$DOMAIN
    echo "====================================================="
    echo "Launching PS2 Teleop Node on ROS_DOMAIN_ID=$ROS_DOMAIN_ID"
    echo "====================================================="
    
    ros2 run ps2_teleop ps2_teleop_node
    EXIT_CODE=$?
    
    # Check if the exit code is exactly 100 (Domain Change Request)
    if [ $EXIT_CODE -eq 100 ]; then
        if [ -f "$DOMAIN_FILE" ]; then
            DOMAIN=$(cat "$DOMAIN_FILE")
            echo ""
            echo "Domain ID change requested: $DOMAIN. Restarting node..."
            echo ""
            sleep 0.5
        else
            echo "Domain file not found. Defaulting to 17."
            DOMAIN=17
        fi
    else
        echo "Node exited cleanly (Exit Code: $EXIT_CODE). Exiting wrapper."
        break
    fi
done
