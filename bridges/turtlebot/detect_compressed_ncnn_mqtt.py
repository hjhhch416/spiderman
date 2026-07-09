#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path

import cv2
import ncnn
import numpy as np
import paho.mqtt.client as mqtt
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage

MODEL_DIR = "/home/pi/models/best_ncnn_model"
PARAM_PATH = MODEL_DIR + "/model.ncnn.param"
BIN_PATH = MODEL_DIR + "/model.ncnn.bin"
CLASS_NAMES = ["corrosion", "crack"]
INPUT_SIZE = 512
CONF_THRES = 0.25
IOU_THRES = 0.45


def letterbox(image, new_shape=512, color=(114, 114, 114)):
    h, w = image.shape[:2]
    scale = min(new_shape / w, new_shape / h)
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((new_shape, new_shape, 3), color, dtype=np.uint8)
    pad_x = (new_shape - new_w) // 2
    pad_y = (new_shape - new_h) // 2
    canvas[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = resized
    return canvas, scale, pad_x, pad_y


def nms(boxes, scores, iou_thres):
    if len(boxes) == 0:
        return []
    boxes = np.array(boxes, dtype=np.float32)
    scores = np.array(scores, dtype=np.float32)
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        union = areas[i] + areas[order[1:]] - inter + 1e-6
        inds = np.where((inter / union) <= iou_thres)[0]
        order = order[inds + 1]
    return keep


def preprocess(frame_bgr):
    img, scale, pad_x, pad_y = letterbox(frame_bgr, INPUT_SIZE)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = img.astype(np.float32) / 255.0
    img = np.transpose(img, (2, 0, 1))
    return np.ascontiguousarray(img), scale, pad_x, pad_y


def parse_yolo_output(output, orig_w, orig_h, scale, pad_x, pad_y):
    arr = np.squeeze(np.array(output))
    if arr.ndim != 2:
        return []
    if arr.shape[0] == 6:
        arr = arr.T
    elif arr.shape[1] != 6:
        return []

    boxes, scores, class_ids = [], [], []
    for pred in arr:
        x, y, w, h = pred[0:4]
        cls_scores = pred[4:]
        class_id = int(np.argmax(cls_scores))
        score = float(cls_scores[class_id])
        if score < CONF_THRES:
            continue
        x1 = (x - w / 2 - pad_x) / scale
        y1 = (y - h / 2 - pad_y) / scale
        x2 = (x + w / 2 - pad_x) / scale
        y2 = (y + h / 2 - pad_y) / scale
        x1, x2 = max(0, min(orig_w - 1, x1)), max(0, min(orig_w - 1, x2))
        y1, y2 = max(0, min(orig_h - 1, y1)), max(0, min(orig_h - 1, y2))
        if x2 <= x1 or y2 <= y1:
            continue
        boxes.append([x1, y1, x2, y2])
        scores.append(score)
        class_ids.append(class_id)

    detections = []
    for i in nms(boxes, scores, IOU_THRES):
        detections.append({
            "bbox": [round(float(v), 1) for v in boxes[i]],
            "confidence": round(float(scores[i]), 4),
            "class_id": int(class_ids[i]),
            "class_name": CLASS_NAMES[int(class_ids[i])],
        })
    return detections


class CompressedNcnnMqttDetector(Node):
    def __init__(self, args):
        super().__init__("compressed_ncnn_mqtt_detector")
        self.args = args
        self.net = ncnn.Net()
        self.net.load_param(args.param_path)
        self.net.load_model(args.bin_path)

        self.mqtt = mqtt.Client(client_id=f"{args.robot_id}_compressed_yolo")
        self.mqtt.on_message = self.on_mqtt_message
        self.mqtt.connect(args.broker, args.port, 60)
        self.mqtt.subscribe(args.pose_topic, qos=0)
        self.mqtt.loop_start()

        self.log_path = Path(args.log_path)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.last_publish_by_key = {}
        self.latest_pose = {"x": args.marker_x, "y": args.marker_y, "z": args.marker_z, "theta": 0.0}
        self.frame_count = 0
        self.prev_time = time.time()

        self.sub = self.create_subscription(CompressedImage, args.image_topic, self.image_callback, 10)
        self.get_logger().info(f"Compressed NCNN MQTT detector started: {args.image_topic}")
        self.get_logger().info(f"MQTT defect topic: {args.defect_topic}")
        self.get_logger().info(f"MQTT pose topic: {args.pose_topic}")
        self.get_logger().info(f"Log path: {self.log_path}")

    def on_mqtt_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            self.latest_pose = {
                "x": float(payload.get("x", self.latest_pose["x"])),
                "y": float(payload.get("y", self.latest_pose["y"])),
                "z": float(payload.get("z", self.latest_pose["z"])),
                "theta": float(payload.get("theta", payload.get("yaw", self.latest_pose["theta"]))),
            }
        except Exception as exc:
            self.get_logger().warn(f"Failed to parse MQTT pose: {exc}")

    def image_callback(self, msg):
        if not msg.data:
            self.get_logger().warn("Empty compressed image")
            return
        np_arr = np.frombuffer(msg.data, np.uint8)
        try:
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except cv2.error as exc:
            self.get_logger().warn(f"Failed to decode compressed image: {exc}")
            return
        if frame is None:
            self.get_logger().warn("Failed to decode compressed image")
            return

        orig_h, orig_w = frame.shape[:2]
        input_chw, scale, pad_x, pad_y = preprocess(frame)
        with self.net.create_extractor() as ex:
            ex.input("in0", ncnn.Mat(input_chw).clone())
            _, out0 = ex.extract("out0")
        detections = parse_yolo_output(out0, orig_w, orig_h, scale, pad_x, pad_y)

        now = time.time()
        self.frame_count += 1
        if self.frame_count % self.args.status_every == 0:
            fps = self.args.status_every / max(now - self.prev_time, 1e-6)
            self.prev_time = now
            self.get_logger().info(f"frames={self.frame_count} fps={fps:.2f} detections={len(detections)}")

        for det in detections:
            key = det["class_name"]
            if now - self.last_publish_by_key.get(key, 0) < self.args.publish_interval:
                continue
            self.last_publish_by_key[key] = now
            x1, y1, x2, y2 = det["bbox"]
            payload = {
                "robot_id": self.args.robot_id,
                "type": det["class_name"],
                "class_name": det["class_name"],
                "confidence": det["confidence"],
                "severity": "high" if det["confidence"] >= 0.85 else "medium",
                "status": "detected",
                "image_topic": self.args.image_topic,
                "bbox": det["bbox"],
                "center_px": [round((x1 + x2) / 2, 1), round((y1 + y2) / 2, 1)],
                "image_size": [orig_w, orig_h],
                "x": self.latest_pose["x"],
                "y": self.latest_pose["y"],
                "z": self.latest_pose["z"],
                "theta": self.latest_pose["theta"],
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "timestamp_ms": int(now * 1000),
            }
            text = json.dumps(payload, ensure_ascii=False)
            self.mqtt.publish(self.args.defect_topic, text, qos=0, retain=False)
            with self.log_path.open("a", encoding="utf-8") as f:
                f.write(text + "\n")
            self.get_logger().info(
                f"DETECTED {payload['type']} conf={payload['confidence']:.2f} bbox={payload['bbox']}"
            )

    def destroy_node(self):
        try:
            self.mqtt.loop_stop()
            self.mqtt.disconnect()
        finally:
            super().destroy_node()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--broker", default="10.10.16.201")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--robot-id", default="bot18")
    parser.add_argument("--image-topic", default="/camera/image_raw/compressed")
    parser.add_argument("--defect-topic", default="ship/crack_bot_02/detection/crack")
    parser.add_argument("--pose-topic", default="ship/crack_bot_02/state/pose")
    parser.add_argument("--param-path", default=PARAM_PATH)
    parser.add_argument("--bin-path", default=BIN_PATH)
    parser.add_argument("--log-path", default="/home/pi/project4_detect/detection_logs/detections.jsonl")
    parser.add_argument("--publish-interval", type=float, default=2.0)
    parser.add_argument("--status-every", type=int, default=30)
    parser.add_argument("--marker-x", type=float, default=0.0)
    parser.add_argument("--marker-y", type=float, default=0.0)
    parser.add_argument("--marker-z", type=float, default=1.0)
    args = parser.parse_args()

    rclpy.init()
    node = CompressedNcnnMqttDetector(args)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    node.destroy_node()
    rclpy.shutdown()


if __name__ == "__main__":
    main()
