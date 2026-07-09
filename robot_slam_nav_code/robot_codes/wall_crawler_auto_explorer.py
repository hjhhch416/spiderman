#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from geometry_msgs.msg import Twist
from tf2_ros import Buffer, TransformListener
import math

class WallCrawlerAutoExplorer(Node):
    def __init__(self):
        super().__init__('wall_crawler_auto_explorer')
        
        # TF2 listener to track robot position and orientation
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        
        # Subscribes to /flat_scan (LaserScan)
        self.scan_sub = self.create_subscription(
            LaserScan,
            '/flat_scan',
            self.scan_callback,
            10
        )
        
        # Publishes to /cmd_vel
        self.cmd_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        
        # States for the Endless Lawnmower Sweep Pattern (No STATE_STOPPED)
        self.STATE_INIT_FORWARD = 0
        self.STATE_TURN_TO_RIGHT = 1
        self.STATE_DRIVE_RIGHT = 2
        self.STATE_SHIFT_Y_FROM_RIGHT = 3
        self.STATE_TURN_TO_LEFT = 4
        self.STATE_DRIVE_LEFT = 5
        self.STATE_SHIFT_Y_FROM_LEFT = 6
        
        self.state = self.STATE_INIT_FORWARD
        self.state_start_time = self.get_clock().now()
        
        # Shifting variables
        self.start_y = None
        self.shift_distance = 0.8  # Shift Y 0.8 meters
        self.sweep_direction = -1.0  # -1.0 = Downward sweep, 1.0 = Upward sweep
        
        # Scan data distances
        self.front_dist = 10.0
        self.left_dist = 10.0
        self.right_dist = 10.0
        
        # Geofence boundary limits (plugin limits are X: [-5.2m, 5.0m], Y: [-5.0m, 5.0m])
        self.X_LIMIT = 4.1
        self.Y_LIMIT = 4.0
        
        # Control loop timer (10Hz)
        self.timer = self.create_timer(0.1, self.control_loop)
        self.get_logger().info('Endless Lawnmower Sweep Auto Explorer Started!')

    def scan_callback(self, msg):
        front_pts = []
        left_pts = []
        right_pts = []
        
        for i, r in enumerate(msg.ranges):
            if math.isnan(r) or math.isinf(r) or r <= 0.0:
                continue
                
            angle = msg.angle_min + i * msg.angle_increment
            angle = math.atan2(math.sin(angle), math.cos(angle))
            
            if -0.35 <= angle <= 0.35: # [-20 deg, +20 deg]
                front_pts.append(r)
            elif 0.35 < angle <= 1.3: # [+20 deg, +75 deg]
                left_pts.append(r)
            elif -1.3 <= angle < -0.35: # [-75 deg, -20 deg]
                right_pts.append(r)
                
        self.front_dist = min(front_pts) if front_pts else 10.0
        self.left_dist = min(left_pts) if left_pts else 10.0
        self.right_dist = min(right_pts) if right_pts else 10.0

    def control_loop(self):
        # 1. Get position and orientation from TF
        robot_x = 0.0
        robot_y = 0.0
        yaw = 0.0
        tf_success = False
        try:
            transform = self.tf_buffer.lookup_transform(
                'flat_odom',
                'base_footprint',
                rclpy.time.Time()
            )
            robot_x = transform.transform.translation.x
            robot_y = transform.transform.translation.y
            
            q = transform.transform.rotation
            siny_cosp = 2 * (q.w * q.z + q.x * q.y)
            cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z)
            yaw = math.atan2(siny_cosp, cosy_cosp)
            tf_success = True
        except Exception as e:
            pass

        if not tf_success:
            self.cmd_pub.publish(Twist())
            return

        now = self.get_clock().now()
        elapsed = (now - self.state_start_time).nanoseconds / 1e9
        
        twist = Twist()
        
        # 2. State Machine
        if self.state == self.STATE_INIT_FORWARD:
            target_yaw = math.pi / 2.0  # Upward
            yaw_error = self.normalize_angle(target_yaw - yaw)
            
            if abs(yaw_error) > 0.08:
                twist.linear.x = 0.0
                twist.angular.z = max(min(yaw_error * 2.0, 0.4), -0.4)
            else:
                twist.linear.x = 0.15
                twist.angular.z = yaw_error * 1.5
                
            if robot_y >= (self.Y_LIMIT - 0.25) or self.front_dist < 0.45:
                self.get_logger().info('Top boundary reached. Sweeping downwards to the right.')
                self.sweep_direction = -1.0  # Set direction to DOWN
                self.transition_to_state(self.STATE_TURN_TO_RIGHT)

        elif self.state == self.STATE_TURN_TO_RIGHT:
            target_yaw = 0.0  # Rightward
            yaw_error = self.normalize_angle(target_yaw - yaw)
            
            if abs(yaw_error) > 0.05:
                twist.linear.x = 0.0
                twist.angular.z = max(min(yaw_error * 2.0, 0.4), -0.4)
            else:
                self.get_logger().info('Aligned right. Driving to right wall.')
                self.transition_to_state(self.STATE_DRIVE_RIGHT)

        elif self.state == self.STATE_DRIVE_RIGHT:
            target_yaw = 0.0
            yaw_error = self.normalize_angle(target_yaw - yaw)
            twist.linear.x = 0.15
            twist.angular.z = yaw_error * 1.5
            
            # Hit right wall
            if robot_x >= (self.X_LIMIT - 0.25) or self.front_dist < 0.45:
                # Boundary Checks
                if self.sweep_direction == -1.0 and robot_y <= -(self.Y_LIMIT - 0.5):
                    # Reached bottom boundary while sweeping down -> Reverse direction to UP
                    self.get_logger().info('Bottom reached at right side. Reversing direction to UP.')
                    self.sweep_direction = 1.0
                elif self.sweep_direction == 1.0 and robot_y >= (self.Y_LIMIT - 0.5):
                    # Reached top boundary while sweeping up -> Reverse direction to DOWN
                    self.get_logger().info('Top reached at right side. Reversing direction to DOWN.')
                    self.sweep_direction = -1.0
                    
                self.get_logger().info(f'Right wall reached. Shifting Y (Dir: {"UP" if self.sweep_direction > 0 else "DOWN"}).')
                self.start_y = robot_y
                self.transition_to_state(self.STATE_SHIFT_Y_FROM_RIGHT)

        elif self.state == self.STATE_SHIFT_Y_FROM_RIGHT:
            # Shift Y depending on sweep_direction
            target_yaw = (math.pi / 2.0) if self.sweep_direction == 1.0 else (-math.pi / 2.0)
            yaw_error = self.normalize_angle(target_yaw - yaw)
            
            if abs(yaw_error) > 0.08:
                twist.linear.x = 0.0
                twist.angular.z = max(min(yaw_error * 2.0, 0.4), -0.4)
            else:
                twist.linear.x = 0.12
                twist.angular.z = yaw_error * 1.5
                
            # Verify if shifting target is met
            shift_traveled = abs(robot_y - self.start_y)
            y_limit_reached = (robot_y <= -(self.Y_LIMIT - 0.25)) if self.sweep_direction == -1.0 else (robot_y >= (self.Y_LIMIT - 0.25))
            
            if shift_traveled >= self.shift_distance or y_limit_reached:
                self.get_logger().info('Shift complete. Turning left.')
                self.transition_to_state(self.STATE_TURN_TO_LEFT)

        elif self.state == self.STATE_TURN_TO_LEFT:
            target_yaw = math.pi  # Leftward
            yaw_error = self.normalize_angle(target_yaw - yaw)
            
            if abs(yaw_error) > 0.05:
                twist.linear.x = 0.0
                twist.angular.z = max(min(yaw_error * 2.0, 0.4), -0.4)
            else:
                self.get_logger().info('Aligned left. Driving to left wall.')
                self.transition_to_state(self.STATE_DRIVE_LEFT)

        elif self.state == self.STATE_DRIVE_LEFT:
            target_yaw = math.pi
            yaw_error = self.normalize_angle(target_yaw - yaw)
            twist.linear.x = 0.15
            twist.angular.z = yaw_error * 1.5
            
            # Hit left wall
            if robot_x <= -(self.X_LIMIT - 0.25) or self.front_dist < 0.45:
                # Boundary Checks
                if self.sweep_direction == -1.0 and robot_y <= -(self.Y_LIMIT - 0.5):
                    # Reached bottom boundary while sweeping down -> Reverse direction to UP
                    self.get_logger().info('Bottom reached at left side. Reversing direction to UP.')
                    self.sweep_direction = 1.0
                elif self.sweep_direction == 1.0 and robot_y >= (self.Y_LIMIT - 0.5):
                    # Reached top boundary while sweeping up -> Reverse direction to DOWN
                    self.get_logger().info('Top reached at left side. Reversing direction to DOWN.')
                    self.sweep_direction = -1.0
                    
                self.get_logger().info(f'Left wall reached. Shifting Y (Dir: {"UP" if self.sweep_direction > 0 else "DOWN"}).')
                self.start_y = robot_y
                self.transition_to_state(self.STATE_SHIFT_Y_FROM_LEFT)

        elif self.state == self.STATE_SHIFT_Y_FROM_LEFT:
            # Shift Y depending on sweep_direction
            target_yaw = (math.pi / 2.0) if self.sweep_direction == 1.0 else (-math.pi / 2.0)
            yaw_error = self.normalize_angle(target_yaw - yaw)
            
            if abs(yaw_error) > 0.08:
                twist.linear.x = 0.0
                twist.angular.z = max(min(yaw_error * 2.0, 0.4), -0.4)
            else:
                twist.linear.x = 0.12
                twist.angular.z = yaw_error * 1.5
                
            # Verify if shifting target is met
            shift_traveled = abs(robot_y - self.start_y)
            y_limit_reached = (robot_y <= -(self.Y_LIMIT - 0.25)) if self.sweep_direction == -1.0 else (robot_y >= (self.Y_LIMIT - 0.25))
            
            if shift_traveled >= self.shift_distance or y_limit_reached:
                self.get_logger().info('Shift complete. Turning right.')
                self.transition_to_state(self.STATE_TURN_TO_RIGHT)

        self.cmd_pub.publish(twist)

    def transition_to_state(self, new_state):
        self.state = new_state
        self.state_start_time = self.get_clock().now()

    def normalize_angle(self, angle):
        return math.atan2(math.sin(angle), math.cos(angle))

def main(args=None):
    rclpy.init(args=args)
    node = WallCrawlerAutoExplorer()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.cmd_pub.publish(Twist())
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
