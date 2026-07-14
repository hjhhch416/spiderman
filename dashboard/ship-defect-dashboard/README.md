# 선박 결함 탐지 로봇 대시보드

---

## 1. MQTT 토픽 구조 (MQTT Topics)

### 1) 위치 및 자세 데이터 (Pose/Odometry)
* `turtlebot/bot17/telemetry/pose`
* `turtlebot/bot18/telemetry/pose`
* `turtlebot/+/telemetry/pose` (모든 로봇 와일드카드 구독)
* `ship/crack_bot_01/state/pose`
* `ship/crack_bot_02/state/pose`

*기존 오도메트리(Odometry) 형식의 토픽 데이터도 수신 가능합니다:*
* `turtlebot/bot17/telemetry/odom`
* `turtlebot/bot18/telemetry/odom`

### 2) 상태 데이터 (Status)
* `turtlebot/bot17/telemetry/status`
* `turtlebot/bot18/telemetry/status`
* `ship/crack_bot_01/state/battery` (배터리 잔량 등)
* `ship/crack_bot_01/state/heartbeat` (통신 연결 확인용)
* `ship/crack_bot_01/state/safety` (안전 및 에러 상태 코드)

### 3) YOLO 결함 감지 이벤트 (YOLO Defect Event)
* `turtlebot/bot17/detection/defect`
* `turtlebot/bot18/detection/defect`
* `ship/crack_bot_01/detection/crack`
* `ship/crack_bot_02/detection/crack`

### 4) 이동 목표 명령 (Navigation Command)
* `turtlebot/{robot_id}/command/nav`
* `ship/crack_bot_01/command/nav`
* `ship/crack_bot_02/command/nav`

---

## 2. 데이터 패킷 페이로드 명세 (JSON Payloads)

### 1) 로봇 위치 및 자세 (Pose Payload)
TurtleBot 내부의 ROS-MQTT 브릿지가 대시보드로 실시간 송신해야 하는 표준 권장 페이로드 형식입니다.

```json
{
  "robot_id": "bot17",
  "x": 1.25,
  "y": -2.1,
  "z": 0.55,
  "theta": 1.57,
  "timestamp": "2026-07-04T05:40:00Z"
}
```

💡 좌표계 매핑 규격 (ROS ➔ Three.js)
ROS 세계관과 3D 그래픽스(Three.js) 세계관의 축 기준 차이를 맞추기 위해 대시보드 내부에서 다음과 같이 변환을 거칩니다.

ROS x ➔ Three.js x

ROS y ➔ Three.js -z (반전 적용)

ROS z ➔ Three.js y (높이 값으로 매핑)

ROS theta (혹은 yaw) ➔ 로봇의 실시간 헤딩(진행 방향) 회전 각도

오도메트리(geometry_msgs/msg/Odometry) 스타일의 구조로 전송되어도 파싱이 지원됩니다:

```json
{
  "robot_id": "bot17",
  "position": {
    "x": 1.25,
    "y": -2.1,
    "z": 0.55
  },
  "orientation": {
    "x": 0,
    "y": 0,
    "z": 0.707,
    "w": 0.707
  }
}
```

### 2) YOLO 결함 감지 데이터 (YOLO Defect Payload)
로봇이 선박 표면에서 결함(크랙 등)을 감지했을 때 실시간으로 발행하는 데이터 규격입니다. 수신 시 3D 공간 상의 해당 좌표(x, y, z)에 마커가 시각화됩니다.

```json
{
  "defect_id": "defect-001",
  "type": "crack",
  "confidence": 0.91,
  "severity": "high",
  "x": 3.4,
  "y": -2.55,
  "z": 1.3,
  "image_url": "[http://10.10.16.201:8000/images/defect-001.jpg](http://10.10.16.201:8000/images/defect-001.jpg)",
  "timestamp": "2026-07-04T05:42:00Z"
}
```

### 3. 네비게이션 명령 발행 (Goal Command Payload)
사용자가 대시보드 3D 뷰포트 상의 바닥면(Floor)을 마우스 클릭으로 선택하고 Publish Goal 버튼을 누르면 다음 사양으로 MQTT 명령이 전송됩니다.

- 토픽 (Topic): ship/crack_bot_01/command/nav
- 페이로드 (Payload):

```json
{
  "robot_id": "bot17",
  "target": {
    "x": 1.2,
    "y": -0.5,
    "z": 0,
    "theta": 0
  },
  "timestamp": "2026-07-04T05:45:00.000Z"
}
```

### 4. ROS2 MQTT 브릿지 구동 방법 (C++ Bridge)
서버의 ~/spider_bot/cpp_mqtt_bridge 경로에 빌드되어 있는 C++ 기반 브릿지 노드를 구동하는 명령어입니다. 대시보드가 전송한 네비게이션 명령 토픽({base_topic}/command/nav)을 구독한 뒤, 이를 ROS2 Nav2 액션 서버(navigate_to_pose)의 액션 목표로 변환해 줍니다.

```text
# ROS2 작업 공간 이동 및 빌드 환경 소싱
cd ~/spider_bot
source /opt/ros/humble/setup.bash
source install/setup.bash

# 브릿지 실행 (서버 IP, 베이스 토픽, 타겟 액션 이름 파라미터 주입)
ros2 run ship_crack_mqtt_bridge ship_crack_mqtt_bridge --ros-args \
  -p mqtt_server:=tcp://10.10.16.201:1883 \
  -p base_topic:=ship/crack_bot_01 \
  -p pose_topic:=/odom \
  -p nav_action_name:=navigate_to_pose \
  -p nav_frame_id:=map
```
