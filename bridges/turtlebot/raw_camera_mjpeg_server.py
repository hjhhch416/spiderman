#!/usr/bin/env python3
import argparse
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
import rclpy
from cv_bridge import CvBridge
from rclpy.node import Node
from sensor_msgs.msg import Image


class FrameStore:
    def __init__(self):
        self.condition = threading.Condition()
        self.jpeg = None
        self.sequence = 0

    def update(self, jpeg):
        with self.condition:
            self.jpeg = jpeg
            self.sequence += 1
            self.condition.notify_all()


class RawCameraMjpegNode(Node):
    def __init__(self, topic, quality, store):
        super().__init__("raw_camera_mjpeg_server")
        self.bridge = CvBridge()
        self.quality = quality
        self.store = store
        self.sub = self.create_subscription(Image, topic, self.on_image, 10)
        self.get_logger().info(f"Serving MJPEG from {topic}")

    def on_image(self, msg):
        frame = self.frame_from_msg(msg)
        if frame is None:
            return
        ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), self.quality])
        if ok:
            self.store.update(encoded.tobytes())

    def frame_from_msg(self, msg):
        encoding = msg.encoding.lower()
        if encoding == "nv21":
            yuv = np.frombuffer(msg.data, dtype=np.uint8)
            expected = msg.height * msg.width * 3 // 2
            if yuv.size != expected:
                self.get_logger().warn(f"NV21 size mismatch: got {yuv.size}, expected {expected}")
                return None
            yuv = yuv.reshape((msg.height * 3 // 2, msg.width))
            return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_NV21)
        if encoding == "rgb8":
            frame = self.bridge.imgmsg_to_cv2(msg, desired_encoding="rgb8")
            return cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        if encoding == "bgr8":
            return self.bridge.imgmsg_to_cv2(msg, desired_encoding="bgr8")
        self.get_logger().warn(f"Unsupported encoding: {msg.encoding}")
        return None


def make_handler(store):
    class MjpegHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path in ("/", "/index.html"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"<html><body><img src='/stream.mjpg' /></body></html>")
                return
            if not self.path.startswith("/stream"):
                self.send_error(404)
                return

            self.send_response(200)
            self.send_header("Age", "0")
            self.send_header("Cache-Control", "no-cache, private")
            self.send_header("Pragma", "no-cache")
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.end_headers()

            last_sequence = -1
            while True:
                with store.condition:
                    store.condition.wait_for(
                        lambda: store.jpeg is not None and store.sequence != last_sequence,
                        timeout=5,
                    )
                    jpeg = store.jpeg
                    last_sequence = store.sequence
                if jpeg is None:
                    continue
                try:
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode("ascii"))
                    self.wfile.write(jpeg)
                    self.wfile.write(b"\r\n")
                except (BrokenPipeError, ConnectionResetError):
                    break

        def log_message(self, format, *args):
            return

    return MjpegHandler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--topic", default="/camera/image_raw")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--quality", type=int, default=75)
    args = parser.parse_args()

    store = FrameStore()
    rclpy.init()
    node = RawCameraMjpegNode(args.topic, args.quality, store)
    ros_thread = threading.Thread(target=rclpy.spin, args=(node,), daemon=True)
    ros_thread.start()

    server = ThreadingHTTPServer((args.host, args.port), make_handler(store))
    node.get_logger().info(f"MJPEG server listening on http://{args.host}:{args.port}/stream.mjpg")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.shutdown()
    node.destroy_node()
    rclpy.shutdown()


if __name__ == "__main__":
    main()
