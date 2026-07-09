#!/usr/bin/env python3
import argparse
import json
import math
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import rclpy
from geometry_msgs.msg import PoseWithCovarianceStamped
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy


def yaw_from_quaternion(q):
    return math.atan2(
        2.0 * (q.w * q.z + q.x * q.y),
        1.0 - 2.0 * (q.y * q.y + q.z * q.z),
    )


def mapped_pose(position, args):
    if args.map_mode == "flat-wall":
        return {
            "x": -position.y,
            "y": position.x,
            "z": args.z if args.z is not None else 0.25,
            "raw_z": position.z,
            "raw": {"x": position.x, "y": position.y, "z": position.z},
        }
    return {
        "x": position.x,
        "y": position.y,
        "z": args.z if args.z is not None else position.z,
        "raw_z": position.z,
        "raw": {"x": position.x, "y": position.y, "z": position.z},
    }


class RtabmapPoseMqttBridge(Node):
    def __init__(self, args):
        super().__init__("rtabmap_pose_mqtt_bridge")
        self.args = args
        self.last_publish = 0.0
        self.interval = 1.0 / max(args.rate, 0.1)

        if hasattr(mqtt, "CallbackAPIVersion"):
            self.client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"rtabmap_pose_{args.robot_id}",
            )
        else:
            self.client = mqtt.Client(client_id=f"rtabmap_pose_{args.robot_id}")
        self.client.connect(args.mqtt_host, args.mqtt_port, keepalive=30)
        self.client.loop_start()

        qos = QoSProfile(depth=10)
        if args.best_effort:
            qos.reliability = ReliabilityPolicy.BEST_EFFORT
        if args.transient_local:
            qos.durability = DurabilityPolicy.TRANSIENT_LOCAL

        self.subscription = self.create_subscription(
            PoseWithCovarianceStamped,
            args.pose_topic,
            self.on_pose,
            qos,
        )
        self.get_logger().info(
            f"Publishing {args.pose_topic} to mqtt://{args.mqtt_host}:{args.mqtt_port}/{args.mqtt_topic}"
        )

    def on_pose(self, msg):
        now = time.monotonic()
        if now - self.last_publish < self.interval:
            return
        self.last_publish = now

        p = msg.pose.pose.position
        q = msg.pose.pose.orientation
        pose = mapped_pose(p, self.args)
        payload = {
            "robot_id": self.args.robot_id,
            "source": self.args.source,
            "map_mode": self.args.map_mode,
            "frame_id": msg.header.frame_id,
            "child_frame_id": self.args.child_frame_id,
            **pose,
            "theta": yaw_from_quaternion(q),
            "orientation": {"x": q.x, "y": q.y, "z": q.z, "w": q.w},
            "linear": {"x": 0.0, "y": 0.0, "z": 0.0},
            "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
            "covariance": list(msg.pose.covariance),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self.client.publish(self.args.mqtt_topic, json.dumps(payload), qos=0, retain=False)


def main():
    parser = argparse.ArgumentParser(description="Bridge RTAB-Map/AMCL-style ROS2 pose to MQTT.")
    parser.add_argument("--pose-topic", default="/rtabmap/localization_pose")
    parser.add_argument("--robot-id", default="bot17")
    parser.add_argument("--mqtt-topic", default="ship/crack_bot_01/state/pose")
    parser.add_argument("--mqtt-host", default="127.0.0.1")
    parser.add_argument("--mqtt-port", type=int, default=1883)
    parser.add_argument("--rate", type=float, default=10.0)
    parser.add_argument("--z", type=float, default=0.25)
    parser.add_argument("--map-mode", choices=["raw", "flat-wall"], default="raw")
    parser.add_argument("--source", default="rtabmap_localization_pose")
    parser.add_argument("--child-frame-id", default="base_footprint")
    parser.add_argument("--best-effort", action="store_true")
    parser.add_argument("--transient-local", action="store_true")
    args = parser.parse_args()

    rclpy.init()
    node = RtabmapPoseMqttBridge(args)
    try:
        rclpy.spin(node)
    finally:
        node.client.loop_stop()
        node.client.disconnect()
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
