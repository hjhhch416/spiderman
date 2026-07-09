import rclpy
from rclpy.node import Node
from nav_msgs.msg import Odometry
import tf2_ros
from geometry_msgs.msg import TransformStamped
from rclpy.qos import qos_profile_sensor_data

class OdomUnroller(Node):
    def __init__(self):
        super().__init__('odom_unroller')
        
        self.declare_parameter('input_odom', '/odom')
        self.declare_parameter('output_odom', '/flat_odom')
        self.declare_parameter('flat_base_frame', 'base_footprint')
        
        in_topic = self.get_parameter('input_odom').value
        out_topic = self.get_parameter('output_odom').value
        self.base_frame = self.get_parameter('flat_base_frame').value
        
        self.sub = self.create_subscription(Odometry, in_topic, self.odom_cb, qos_profile_sensor_data)
        self.pub = self.create_publisher(Odometry, out_topic, 10)
        self.tf_broadcaster = tf2_ros.TransformBroadcaster(self)

    def odom_cb(self, msg):
        start_z_offset = 3.0
        
        flat_odom = Odometry()
        flat_odom.header = msg.header
        # Set parent frame to flat_odom to align with Nav2
        flat_odom.header.frame_id = 'flat_odom'
        flat_odom.child_frame_id = self.base_frame
        
        # === 1. Position Swap ===
        flat_odom.pose.pose.position.x = msg.pose.pose.position.z - start_z_offset
        flat_odom.pose.pose.position.y = msg.pose.pose.position.y
        flat_odom.pose.pose.position.z = msg.pose.pose.position.x
        
        # === 2. Quaternion Multiplication (Rotation of +90 degrees around Y axis) ===
        qx = msg.pose.pose.orientation.x
        qy = msg.pose.pose.orientation.y
        qz = msg.pose.pose.orientation.z
        qw = msg.pose.pose.orientation.w
        
        # q_rot for +90 deg around Y: [0, sin(pi/4), 0, cos(pi/4)]
        rx = 0.0
        ry = 0.7071068
        rz = 0.0
        rw = 0.7071068
        
        # q_new = q_rot * q_original
        flat_odom.pose.pose.orientation.x = rw*qx + rx*qw + ry*qz - rz*qy
        flat_odom.pose.pose.orientation.y = rw*qy - rx*qz + ry*qw + rz*qx
        flat_odom.pose.pose.orientation.z = rw*qz + rx*qy - ry*qx + rz*qw
        flat_odom.pose.pose.orientation.w = rw*qw - rx*qx - ry*qy - rz*qz
        
        # Twist velocities mapping
        flat_odom.twist = msg.twist

        self.pub.publish(flat_odom)
        
        # Broadcast TF (flat_odom -> base_footprint)
        t = TransformStamped()
        t.header.stamp = msg.header.stamp
        t.header.frame_id = 'flat_odom'
        t.child_frame_id = self.base_frame
        t.transform.translation.x = flat_odom.pose.pose.position.x
        t.transform.translation.y = flat_odom.pose.pose.position.y
        t.transform.translation.z = flat_odom.pose.pose.position.z
        t.transform.rotation = flat_odom.pose.pose.orientation
        self.tf_broadcaster.sendTransform(t)

def main(args=None):
    rclpy.init(args=args)
    node = OdomUnroller()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
