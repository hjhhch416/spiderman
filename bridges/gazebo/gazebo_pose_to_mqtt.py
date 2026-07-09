#!/usr/bin/env python3
import argparse
import json
import math
import subprocess
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt


def read_pose(model_name):
    result = subprocess.run(
        ["gz", "model", "-m", model_name, "-p"],
        check=True,
        capture_output=True,
        text=True,
        timeout=10.0,
    )
    values = [float(part) for part in result.stdout.strip().split()]
    if len(values) != 6:
        raise ValueError(f"unexpected pose output: {result.stdout!r}")
    x, y, z, roll, pitch, yaw = values
    return {
        "x": x,
        "y": y,
        "z": z,
        "roll": roll,
        "pitch": pitch,
        "theta": yaw,
        "yaw": yaw,
    }


def main():
    parser = argparse.ArgumentParser(description="Publish Gazebo model pose to MQTT.")
    parser.add_argument("--model", default="turtlebot3_burger")
    parser.add_argument("--robot-id", default="bot17")
    parser.add_argument("--topic", default="ship/crack_bot_01/state/pose")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--rate", type=float, default=5.0)
    parser.add_argument("--z", type=float, default=None, help="Override z for dashboard display.")
    args = parser.parse_args()

    if hasattr(mqtt, "CallbackAPIVersion"):
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"gazebo_pose_{args.robot_id}")
    else:
        client = mqtt.Client(client_id=f"gazebo_pose_{args.robot_id}")
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()

    interval = 1.0 / max(args.rate, 0.1)
    previous = None
    print(f"Publishing {args.model} pose to mqtt://{args.host}:{args.port}/{args.topic}")

    while True:
        try:
            pose = read_pose(args.model)
            if args.z is not None:
                pose["z"] = args.z
            pose.update(
                {
                    "robot_id": args.robot_id,
                    "source": "gazebo",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
            if previous:
                pose["speed"] = math.hypot(pose["x"] - previous["x"], pose["y"] - previous["y"]) / interval
            previous = pose
            client.publish(args.topic, json.dumps(pose), qos=0, retain=False)
        except Exception as exc:
            print(f"pose publish failed: {exc}", flush=True)
        time.sleep(interval)


if __name__ == "__main__":
    main()
