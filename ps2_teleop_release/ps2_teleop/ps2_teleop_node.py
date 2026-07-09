#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
import time
import os
import sys

from .ps2_driver import PS2Controller, L1, R1, CROSS, TRIANGLE, SQUARE, CIRCLE, UP, DOWN, LEFT, RIGHT

# HARDCODED CONSTANTS
DAT_PIN = 23           # Physical Pin 16 (GPIO 23)
CMD_PIN = 22           # Physical Pin 15 (GPIO 22)
ATT_PIN = 17           # Physical Pin 11 (GPIO 17)
CLK_PIN = 27           # Physical Pin 13 (GPIO 27)

POLL_RATE = 20.0           # Polling frequency (Hz)
DEFAULT_MAX_LINEAR = 0.22  # m/s
DEFAULT_MAX_ANGULAR = 1.2  # rad/s
DEFAULT_DEADZONE = 0.08    # Increased slightly to filter low-end analog stick jitter

class PS2TeleopNode(Node):
    def __init__(self):
        super().__init__('ps2_teleop_node')
        
        # Get current ROS_DOMAIN_ID (default starting value is now 17)
        self.current_domain = int(os.environ.get('ROS_DOMAIN_ID', '17'))
        
        # Set running variables
        self.max_linear = DEFAULT_MAX_LINEAR
        self.max_angular = DEFAULT_MAX_ANGULAR
        self.deadzone = DEFAULT_DEADZONE
        
        # Smoothing variables
        self.current_linear = 0.0
        self.current_angular = 0.0
        
        self.get_logger().info(f"=====================================================")
        self.get_logger().info(f"ROS_DOMAIN_ID is currently set to: {self.current_domain}")
        self.get_logger().info(f"Initializing PS2 Controller: DAT={DAT_PIN}, CMD={CMD_PIN}, ATT={ATT_PIN}, CLK={CLK_PIN}")
        self.get_logger().info(f"Limits: Linear={self.max_linear:.2f} m/s, Angular={self.max_angular:.2f} rad/s")
        self.get_logger().info(f"=====================================================")
        
        # Initialize Driver
        try:
            self.controller = PS2Controller(
                dat_pin=DAT_PIN, 
                cmd_pin=CMD_PIN, 
                att_pin=ATT_PIN, 
                clk_pin=CLK_PIN
            )
        except Exception as e:
            self.get_logger().error(f"Failed to initialize GPIO for PS2 Controller: {e}")
            raise e
            
        # Primary Publisher (Single Domain)
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)

        # Track previous button state to detect single-press edge transitions
        self.prev_buttons = 0
        
        # Polling Timer
        timer_period = 1.0 / POLL_RATE
        self.timer = self.create_timer(timer_period, self.timer_callback)
        self.get_logger().info("PS2 Teleop Node started successfully.")
        self.get_logger().info("Controls Info:")
        self.get_logger().info("  - LEFT D-PAD (UP/DOWN/LEFT/RIGHT): Drive at MAX speed (Hold to run, release to stop)")
        self.get_logger().info("  - LEFT JOYSTICK (LX/LY): Smooth Arcade Drive (No safety switch required)")
        self.get_logger().info("  - TRIANGLE (TOP): Change ROS_DOMAIN_ID to 22 (Restarts node)")
        self.get_logger().info("  - CROSS (BOTTOM): Change ROS_DOMAIN_ID to 17 (Restarts node)")
        self.get_logger().info("  - CIRCLE (O): Increase Max Speed Limit (+0.05 m/s, turning speed also increases)")
        self.get_logger().info("  - SQUARE: Decrease Max Speed Limit (-0.05 m/s, turning speed also decreases)")

    def apply_deadzone(self, val):
        if abs(val) < self.deadzone:
            return 0.0
        sign = 1.0 if val >= 0.0 else -1.0
        return sign * (abs(val) - self.deadzone) / (1.0 - self.deadzone)

    def timer_callback(self):
        twist = Twist()
        
        # Poll controller
        success = self.controller.update()
        if not success:
            self.get_logger().warning("Failed to read PS2 Controller! Stopping robot for safety.")
            self.current_linear = 0.0
            self.current_angular = 0.0
            self.cmd_vel_pub.publish(twist)
            return

        # Check button transitions
        pressed_transitions = self.controller.buttons & ~self.prev_buttons
        self.prev_buttons = self.controller.buttons

        # 1. Direct ROS_DOMAIN_ID toggling (Triangle -> 22, Cross -> 17)
        domain_changed = False
        new_domain = self.current_domain

        if (pressed_transitions & TRIANGLE) != 0:
            if self.current_domain != 22:
                new_domain = 22
                domain_changed = True
        elif (pressed_transitions & CROSS) != 0:
            if self.current_domain != 17:
                new_domain = 17
                domain_changed = True
            
        if domain_changed:
            self.get_logger().info(f"Changing ROS_DOMAIN_ID from {self.current_domain} to {new_domain}... Exiting.")
            self.current_linear = 0.0
            self.current_angular = 0.0
            self.cmd_vel_pub.publish(twist)
            self.controller.cleanup()
            
            # Write new domain ID to local configuration file
            domain_file = os.environ.get('HOME', '/home/pi') + "/.ps2_teleop_domain"
            try:
                with open(domain_file, "w") as f:
                    f.write(str(new_domain))
            except Exception as e:
                self.get_logger().error(f"Failed to write domain file: {e}")
            
            # Exit process returning unique exit code 100
            os._exit(100)

        # 2. Update Max Linear & Angular Speeds proportionally (Circle / Square)
        if (pressed_transitions & CIRCLE) != 0:
            self.max_linear = min(1.5, self.max_linear + 0.05)
            self.max_angular = self.max_linear * (DEFAULT_MAX_ANGULAR / DEFAULT_MAX_LINEAR)
            self.get_logger().info(f"Max Limits INCREASED -> Linear: {self.max_linear:.2f} m/s | Angular: {self.max_angular:.2f} rad/s")
        elif (pressed_transitions & SQUARE) != 0:
            self.max_linear = max(0.05, self.max_linear - 0.05)
            self.max_angular = self.max_linear * (DEFAULT_MAX_ANGULAR / DEFAULT_MAX_LINEAR)
            self.get_logger().info(f"Max Limits DECREASED -> Linear: {self.max_linear:.2f} m/s | Angular: {self.max_angular:.2f} rad/s")

        # 3. Determine Speed Targets
        target_linear = 0.0
        target_angular = 0.0

        # Read Left D-pad buttons
        dpad_up = self.controller.get_button(UP)
        dpad_down = self.controller.get_button(DOWN)
        dpad_left = self.controller.get_button(LEFT)
        dpad_right = self.controller.get_button(RIGHT)

        if dpad_up or dpad_down or dpad_left or dpad_right:
            if dpad_up:
                target_linear += self.max_linear
            if dpad_down:
                target_linear -= self.max_linear
            if dpad_left:
                target_angular += self.max_angular
            if dpad_right:
                target_angular -= self.max_angular
        else:
            # Joystick control: No deadman's switch required
            sticks = self.controller.get_joysticks()
            ly = self.apply_deadzone(sticks['ly'])
            lx = self.apply_deadzone(sticks['lx'])
            
            # Quadratic curve mapping: y = x * |x|
            ly_smooth = ly * abs(ly)
            lx_smooth = lx * abs(lx)
            
            target_linear = ly_smooth * self.max_linear
            target_angular = -lx_smooth * self.max_angular

        # 4. Acceleration Smoothing Filter (coefficient 0.12)
        self.current_linear += (target_linear - self.current_linear) * 0.12
        self.current_angular += (target_angular - self.current_angular) * 0.12

        if abs(self.current_linear) < 0.01:
            self.current_linear = 0.0
        if abs(self.current_angular) < 0.01:
            self.current_angular = 0.0

        twist.linear.x = self.current_linear
        twist.angular.z = self.current_angular
        
        # Publish only to primary domain
        self.cmd_vel_pub.publish(twist)

    def destroy_node(self):
        twist = Twist()
        self.cmd_vel_pub.publish(twist)
        self.controller.cleanup()
        super().destroy_node()

def main(args=None):
    rclpy.init(args=args)
    node = PS2TeleopNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        try:
            node.destroy_node()
        except:
            pass
        rclpy.shutdown()

if __name__ == '__main__':
    main()
