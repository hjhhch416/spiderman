#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PointStamped, Twist
from tf2_ros import Buffer, TransformListener
import tf2_geometry_msgs
import math

class WallCrawlerAutonomy3D(Node):
    def __init__(self):
        super().__init__('wall_crawler_autonomy_3d')
        
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        
        # 목표 지점을 /clicked_point 로 받습니다 (RViz2의 Publish Point 툴 사용)
        self.goal_sub = self.create_subscription(
            PointStamped,
            '/clicked_point',
            self.goal_callback,
            10
        )
        self.cmd_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        
        self.target_point = None  # PointStamped in map frame
        
        self.timer = self.create_timer(0.1, self.control_loop)
        self.get_logger().info('3D Autonomy Node Started. RViz2에서 "Publish Point"로 목표를 클릭하세요!')

    def goal_callback(self, msg):
        self.target_point = msg
        self.get_logger().info(f'새로운 목표 수신: x={msg.point.x:.2f}, y={msg.point.y:.2f}, z={msg.point.z:.2f} (Frame: {msg.header.frame_id})')

    def control_loop(self):
        if self.target_point is None:
            return

        try:
            # 타겟 포인트를 현재 로봇의 로컬 좌표계(base_footprint)로 변환
            # 로봇이 벽에 붙어 회전되어 있어도, 로컬 좌표계에서는 무조건 x가 앞, y가 왼쪽입니다.
            transform = self.tf_buffer.lookup_transform(
                'base_footprint',
                self.target_point.header.frame_id,
                rclpy.time.Time()
            )
            
            target_in_base = tf2_geometry_msgs.do_transform_point(self.target_point, transform)
            
        except Exception as e:
            self.get_logger().warn(f'TF 변환 실패: {e}')
            return

        # 로컬 좌표계에서의 목표 위치
        x = target_in_base.point.x
        y = target_in_base.point.y
        
        distance = math.sqrt(x**2 + y**2)
        angle_to_goal = math.atan2(y, x)

        twist = Twist()

        if distance < 0.2:
            self.get_logger().info('목표 도달 성공!')
            self.target_point = None
        else:
            # 단순 비례 제어 (P 제어)
            twist.angular.z = max(min(angle_to_goal * 1.5, 0.5), -0.5)
            
            # 각도 오차가 크면 제자리 회전, 작으면 직진 병행
            if abs(angle_to_goal) > 0.5:
                twist.linear.x = 0.0
            else:
                twist.linear.x = max(min(distance * 0.5, 0.2), 0.0)

        self.cmd_pub.publish(twist)

def main(args=None):
    rclpy.init(args=args)
    node = WallCrawlerAutonomy3D()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        # 종료 시 정지 명령
        node.cmd_pub.publish(Twist())
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()

