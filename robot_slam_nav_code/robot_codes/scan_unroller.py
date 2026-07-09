import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from rclpy.qos import qos_profile_sensor_data

class ScanUnroller(Node):
    def __init__(self):
        super().__init__('scan_unroller')
        
        self.declare_parameter('input_scan', '/scan')
        self.declare_parameter('output_scan', '/flat_scan')
        
        in_topic = self.get_parameter('input_scan').value
        out_topic = self.get_parameter('output_scan').value
        
        self.sub = self.create_subscription(LaserScan, in_topic, self.scan_cb, qos_profile_sensor_data)
        self.pub = self.create_publisher(LaserScan, out_topic, 10)

    def scan_cb(self, msg):
        flat_scan = LaserScan()
        flat_scan.header = msg.header
        flat_scan.header.frame_id = 'lidar_link'
        flat_scan.angle_min = msg.angle_min
        flat_scan.angle_max = msg.angle_max
        flat_scan.angle_increment = msg.angle_increment
        flat_scan.time_increment = msg.time_increment
        flat_scan.scan_time = msg.scan_time
        flat_scan.range_min = msg.range_min
        flat_scan.range_max = msg.range_max
        flat_scan.ranges = msg.ranges
        flat_scan.intensities = msg.intensities

        self.pub.publish(flat_scan)

def main(args=None):
    rclpy.init(args=args)
    node = ScanUnroller()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
