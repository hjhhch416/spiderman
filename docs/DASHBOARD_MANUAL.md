# Ship Defect Dashboard 수동 실행 메뉴얼

이 문서는 Windows에서 작업한 React 대시보드를 Linux 서버에서 실행하고, TurtleBot17의 ROS2/MQTT/YOLO 데이터를 대시보드로 받는 절차를 정리한 것이다.

현재 기준은 **bot17 단일 운용**이다. 이전 bot18, `crack_bot_02`, Simulation 버튼 기반 더미 데이터는 사용하지 않는다.

## 0. 현재 기준 정보

서버 PC:

```text
IP: 10.10.16.201
SSH: lee@10.10.16.201
password: 2222
dashboard path: ~/AHJ/ship-defect-dashboard
dashboard URL: http://10.10.16.201:5173
MQTT TCP: 10.10.16.201:1883
MQTT WebSocket: ws://10.10.16.201:9001
```

TurtleBot17:

```text
IP: 10.10.16.155
SSH: ubuntu@10.10.16.155
password: 1234
ROS_DOMAIN_ID: 17
TURTLEBOT3_MODEL: burger
LDS_MODEL: LDS-01
project path: ~/project4_detect
model path: ~/models/best_v5n_320_ncnn_model
camera stream: http://10.10.16.155:8080/stream.mjpg
```

대시보드 MQTT 토픽:

```text
pose: ship/crack_bot_01/state/pose
detection: ship/crack_bot_01/detection/crack
nav command: ship/crack_bot_01/command/nav
```

대시보드는 현재 `ship/crack_bot_01/...`만 구독한다. `ship/crack_bot_02/...`는 구독하지 않는다.

## 1. 서버 MQTT 확인

서버 접속:

```bash
ssh lee@10.10.16.201
```

Mosquitto 상태 확인:

```bash
sudo systemctl status mosquitto --no-pager
```

꺼져 있으면 실행:

```bash
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

포트 확인:

```bash
ss -lntp | grep -E ':1883|:9001'
```

정상 예:

```text
0.0.0.0:1883
0.0.0.0:9001
```

## 2. 대시보드 실행

### 방법 0. 서버에 한 파일만 보내서 셋업

핫스팟 등으로 서버 IP가 바뀐 상황에서 대시보드 파일을 새로 밀어 넣고 실행할 때는 아래 파일 하나만 서버로 보낸다.

```text
C:\Users\kccistc1\Documents\Codex\2026-06-23\mqtt\setup_dashboard_server_onefile.sh
```

서버로 복사:

```bash
scp setup_dashboard_server_onefile.sh lee@서버_IP:~/setup_dashboard_server_onefile.sh
```

서버에서 실행:

```bash
ssh lee@서버_IP
bash ~/setup_dashboard_server_onefile.sh
```

이 파일은 다음 작업을 자동으로 수행한다.

```text
1. ~/AHJ/ship-defect-dashboard 경로 생성
2. 기존 대시보드 폴더가 있으면 backup 폴더로 이동
3. 파일 안에 포함된 React 대시보드 소스를 압축 해제
4. npm/node 확인
5. npm install 실행
6. Mosquitto 1883/9001 포트 상태 출력
7. 기존 5173 포트 프로세스 종료 시도
8. npm run dev -- --host 0.0.0.0 --port 5173 실행
9. 접속 URL 출력
```

실행 후 출력되는 URL 예:

```text
URL: http://서버_IP:5173
```

주의:

```text
이 스크립트는 React 대시보드 셋업용이다.
bot17 브링업, 카메라, odom MQTT, YOLO MQTT 브릿지는 따로 실행해야 한다.
node/npm이 서버에 없으면 먼저 설치해야 한다.
```

### 방법 A. Windows 원버튼 실행

Windows 작업 폴더에서 아래 파일을 더블클릭한다.

```text
start_dashboard_oneclick.bat
```

이 버튼은 다음 작업을 자동으로 수행한다.

```text
1. 서버 10.10.16.201에 SSH 접속
2. ~/AHJ/ship-defect-dashboard로 이동
3. node_modules가 없으면 npm install 실행
4. 5173 포트가 꺼져 있으면 npm run dev 실행
5. 브라우저에서 http://10.10.16.201:5173 열기
```

원버튼 실행 파일 위치:

```text
C:\Users\kccistc1\Documents\Codex\2026-06-23\mqtt\start_dashboard_oneclick.bat
C:\Users\kccistc1\Documents\Codex\2026-06-23\mqtt\start_dashboard_oneclick.ps1
```

서버 IP, 계정, 포트가 바뀌면 `start_dashboard_oneclick.ps1` 상단 값을 수정한다.

```powershell
$ServerHost = "10.10.16.201"
$ServerUser = "lee"
$ServerPassword = "2222"
$DashboardDir = "/home/lee/AHJ/ship-defect-dashboard"
$DashboardPort = 5173
```

원버튼 실행이 `Connection timed out`으로 실패하면 서버 전원, IP, SSH 연결 상태를 먼저 확인한다.

```powershell
Test-NetConnection 10.10.16.201 -Port 22
Test-NetConnection 10.10.16.201 -Port 5173
```

### 방법 B. 서버에서 직접 실행

서버에서 실행:

```bash
cd ~/AHJ/ship-defect-dashboard
npm install
nohup npm run dev -- --host 0.0.0.0 --port 5173 > vite.log 2>&1 &
```

확인:

```bash
ss -lntp | grep ':5173'
pgrep -af 'vite|npm run dev'
```

브라우저 접속:

```text
http://10.10.16.201:5173
```

현재 대시보드는 Simulation 버튼이 없다. 앱이 켜지면 바로 MQTT WebSocket으로 연결을 시도한다.

기본 WebSocket broker:

```text
ws://10.10.16.201:9001
```

## 3. TurtleBot17 ROS2 환경

bot17 접속:

```bash
ssh ubuntu@10.10.16.155
```

반드시 아래 환경을 맞춘다.

```bash
export ROS_DOMAIN_ID=17
export TURTLEBOT3_MODEL=burger
export LDS_MODEL=LDS-01
source /opt/ros/humble/setup.bash
source ~/turtlebot3_ws/install/setup.bash
```

주의:

```text
/opt/ros/humble/setup.bash만 source하면 turtlebot3_bringup을 못 찾을 수 있다.
LDS_MODEL이 없으면 robot.launch.py가 KeyError: 'LDS_MODEL'로 실패한다.
```

## 4. bot17 브링업

bot17에서 실행:

```bash
export ROS_DOMAIN_ID=17
export TURTLEBOT3_MODEL=burger
export LDS_MODEL=LDS-01
source /opt/ros/humble/setup.bash
source ~/turtlebot3_ws/install/setup.bash

nohup ros2 launch turtlebot3_bringup robot.launch.py \
  > ~/robot_bringup.log 2>&1 &
```

확인:

```bash
pgrep -af 'robot.launch|turtlebot3_ros'
ros2 topic list | grep -E '^/(cmd_vel|odom|scan)$'
tail -80 ~/robot_bringup.log
```

정상 토픽:

```text
/cmd_vel
/odom
/scan
```

## 5. bot17 카메라 실행

bot17에서 실행:

```bash
export ROS_DOMAIN_ID=17
source /opt/ros/humble/setup.bash
source ~/turtlebot3_ws/install/setup.bash

nohup ros2 launch turtlebot3_bringup camera.launch.py format:=BGR888 \
  > ~/camera_bringup.log 2>&1 &
```

확인:

```bash
ros2 topic info -v /camera/image_raw
ros2 topic list | grep camera
tail -80 ~/camera_bringup.log
```

정상 기준:

```text
Publisher count: 1
/camera/image_raw
/camera/image_raw/compressed
```

만약 `/camera/image_raw` 토픽 이름은 보이는데 `Publisher count: 0`이면 카메라 container가 꼬인 상태다. 이때는 카메라 관련 프로세스를 정리하고 다시 실행한다.

```bash
pkill -f 'camera.launch.py' || true
pkill -f 'component_container.*camera_container' || true
sleep 2

nohup ros2 launch turtlebot3_bringup camera.launch.py format:=BGR888 \
  > ~/camera_bringup.log 2>&1 &
```

## 6. MJPEG 카메라 브릿지 실행

대시보드 YOLO 탭에서 카메라 화면을 보기 위한 브릿지다.

bot17에서 실행:

```bash
export ROS_DOMAIN_ID=17
source /opt/ros/humble/setup.bash
source ~/turtlebot3_ws/install/setup.bash

pkill -f '[r]aw_camera_mjpeg_server.py' || true

nohup python3 ~/project4_detect/raw_camera_mjpeg_server.py \
  --topic /camera/image_raw \
  --host 0.0.0.0 \
  --port 8080 \
  > ~/mjpeg_bridge.log 2>&1 &
```

확인:

```bash
pgrep -af 'raw_camera_mjpeg_server.py'
ss -lntp | grep ':8080'
tail -40 ~/mjpeg_bridge.log
```

브라우저 또는 대시보드 YOLO camera URL:

```text
http://10.10.16.155:8080/stream.mjpg
```

## 7. odom to MQTT 브릿지 실행

bot17의 `/odom`을 서버 MQTT로 보낸다.

bot17에서 실행:

```bash
export ROS_DOMAIN_ID=17
source /opt/ros/humble/setup.bash
source ~/turtlebot3_ws/install/setup.bash

pkill -f '[o]dom_to_mqtt.py' || true

nohup python3 ~/project4_detect/odom_to_mqtt.py \
  --odom-topic /odom \
  --robot-id bot17 \
  --mqtt-topic ship/crack_bot_01/state/pose \
  --mqtt-host 10.10.16.201 \
  --mqtt-port 1883 \
  --rate 10 \
  --z 0.25 \
  --map-mode raw \
  --best-effort \
  > ~/odom_mqtt_bridge.log 2>&1 &
```

bot17에서 확인:

```bash
pgrep -af 'odom_to_mqtt.py'
tail -40 ~/odom_mqtt_bridge.log
```

서버에서 MQTT 수신 확인:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
  -t 'ship/crack_bot_01/state/pose' \
  -C 1 -W 5 -v
```

## 8. YOLO MQTT 브릿지 실행

bot17 카메라 이미지에서 YOLO 탐지 후 bbox와 현재 pose를 MQTT로 보낸다.

bot17에서 실행:

```bash
export ROS_DOMAIN_ID=17
source /opt/ros/humble/setup.bash
source ~/turtlebot3_ws/install/setup.bash

mkdir -p ~/project4_detect/detection_logs
pkill -f '[d]etect_raw_ncnn_mqtt.py' || true

nohup python3 ~/project4_detect/detect_raw_ncnn_mqtt.py \
  --broker 10.10.16.201 \
  --robot-id bot17 \
  --image-topic /camera/image_raw \
  --defect-topic ship/crack_bot_01/detection/crack \
  --pose-topic ship/crack_bot_01/state/pose \
  --param-path ~/models/best_v5n_320_ncnn_model/model.ncnn.param \
  --bin-path ~/models/best_v5n_320_ncnn_model/model.ncnn.bin \
  --log-path ~/project4_detect/detection_logs/detections.jsonl \
  --duplicate-window 20 \
  --duplicate-iou 0.35 \
  --duplicate-center-px 80 \
  --duplicate-pose-distance 0.6 \
  > ~/yolo_mqtt_bridge.log 2>&1 &
```

bot17에서 확인:

```bash
pgrep -af 'detect_raw_ncnn_mqtt.py'
tail -80 ~/yolo_mqtt_bridge.log
```

서버에서 detection 수신 확인:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
  -t 'ship/crack_bot_01/detection/crack' \
  -C 1 -W 20 -v
```

탐지 대상이 화면에 없으면 detection 메시지가 안 올 수 있다. 이 경우 카메라 화면은 보여도 detection MQTT는 조용할 수 있다.

## 9. 전체 재시작 순서

문제가 생겼을 때는 아래 순서로 다시 올리는 것을 권장한다.

### 방법 A. bot17 원버튼 스크립트

Windows 작업 폴더에 있는 아래 파일을 bot17로 보낸다.

```text
C:\Users\kccistc1\Documents\Codex\2026-06-23\mqtt\start_bot17_bridges_oneclick.sh
```

bot17로 복사:

```bash
scp start_bot17_bridges_oneclick.sh ubuntu@BOT17_IP:~/
```

bot17에서 실행:

```bash
bash ~/start_bot17_bridges_oneclick.sh 10.91.214.129
```

여기서 `10.91.214.129`는 현재 서버 MQTT IP다. 서버 IP가 바뀌면 그 값으로 바꾼다.

이 스크립트는 다음을 자동으로 실행한다.

```text
1. ROS_DOMAIN_ID=17 설정
2. TURTLEBOT3_MODEL=burger 설정
3. LDS_MODEL=LDS-01 설정
4. turtlebot3_ws source
5. 기존 bot17 브릿지 프로세스 정리
6. robot.launch.py 실행
7. camera.launch.py 실행
8. raw_camera_mjpeg_server.py 실행
9. odom_to_mqtt.py 실행
10. detect_raw_ncnn_mqtt.py 실행
11. ROS 토픽/카메라 포트 상태 출력
```

실행 후 출력되는 Camera URL을 대시보드 YOLO camera URL에 넣는다.

```text
http://BOT17_IP:8080/stream.mjpg
```

### 방법 B. 수동 재시작

bot17:

```bash
export ROS_DOMAIN_ID=17
export TURTLEBOT3_MODEL=burger
export LDS_MODEL=LDS-01
source /opt/ros/humble/setup.bash
source ~/turtlebot3_ws/install/setup.bash

pkill -f '[d]etect_raw_ncnn_mqtt.py' || true
pkill -f '[o]dom_to_mqtt.py' || true
pkill -f '[r]aw_camera_mjpeg_server.py' || true
pkill -f 'camera.launch.py' || true
pkill -f 'component_container.*camera_container' || true
pkill -f 'robot.launch.py' || true
sleep 2

nohup ros2 launch turtlebot3_bringup robot.launch.py \
  > ~/robot_bringup.log 2>&1 &

nohup ros2 launch turtlebot3_bringup camera.launch.py format:=BGR888 \
  > ~/camera_bringup.log 2>&1 &

sleep 8

nohup python3 ~/project4_detect/raw_camera_mjpeg_server.py \
  --topic /camera/image_raw --host 0.0.0.0 --port 8080 \
  > ~/mjpeg_bridge.log 2>&1 &

nohup python3 ~/project4_detect/odom_to_mqtt.py \
  --odom-topic /odom \
  --robot-id bot17 \
  --mqtt-topic ship/crack_bot_01/state/pose \
  --mqtt-host 10.10.16.201 \
  --mqtt-port 1883 \
  --rate 10 \
  --z 0.25 \
  --map-mode raw \
  --best-effort \
  > ~/odom_mqtt_bridge.log 2>&1 &

nohup python3 ~/project4_detect/detect_raw_ncnn_mqtt.py \
  --broker 10.10.16.201 \
  --robot-id bot17 \
  --image-topic /camera/image_raw \
  --defect-topic ship/crack_bot_01/detection/crack \
  --pose-topic ship/crack_bot_01/state/pose \
  --param-path ~/models/best_v5n_320_ncnn_model/model.ncnn.param \
  --bin-path ~/models/best_v5n_320_ncnn_model/model.ncnn.bin \
  --log-path ~/project4_detect/detection_logs/detections.jsonl \
  --duplicate-window 20 \
  --duplicate-iou 0.35 \
  --duplicate-center-px 80 \
  --duplicate-pose-distance 0.6 \
  > ~/yolo_mqtt_bridge.log 2>&1 &
```

확인:

```bash
pgrep -af 'robot.launch|camera.launch|raw_camera_mjpeg_server.py|odom_to_mqtt.py|detect_raw_ncnn_mqtt.py'
ros2 topic info -v /camera/image_raw
ros2 topic list | grep -E '^/(cmd_vel|odom|scan|camera/image_raw|camera/image_raw/compressed)$'
ss -lntp | grep ':8080'
```

서버:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 -t 'ship/crack_bot_01/state/pose' -C 1 -W 5 -v
mosquitto_sub -h 127.0.0.1 -p 1883 -t 'ship/crack_bot_01/detection/crack' -C 1 -W 20 -v
```

## 10. 대시보드 사용 방법

대시보드 접속:

```text
http://10.10.16.201:5173
```

Main View:

```text
Gazebo: noVNC/Gazebo 화면
3D Model: 배 측면 3D 모델과 bot17 위치
YOLO: 카메라 화면, bbox, 최신 탐지 정보
```

Gazebo URL:

```text
http://127.0.0.1:6082/vnc_lite.html?autoconnect=1&resize=scale
```

YOLO camera URL:

```text
http://10.10.16.155:8080/stream.mjpg
```

Coordinate Fit:

```text
Surface: Left Wall
Scale: raw x를 벽면 좌우 이동량으로 바꾸는 비율
Wall H Scale: raw y를 벽면 높이 이동량으로 바꾸는 비율
Wall Depth: 배 좌측 벽면의 고정 깊이
Wall Height: 벽면 기준 높이 offset
Flip ROS Y: raw y 방향이 반대로 보일 때 사용
```

YOLO Latest 표시:

```text
wall x: 3D 배 벽면 좌우 좌표
h: 3D 배 벽면 높이 좌표
d: 3D 배 벽면 깊이 좌표
raw x/y/z: MQTT 원본 odom 좌표
bbox: 카메라 이미지 기준 탐지 박스 좌표
```

## 11. 자주 생기는 문제

### bot18이 화면에 나오는 경우

현재 대시보드는 `crack_bot_01`만 구독하도록 수정되어 있다. 그래도 bot18이 보이면 브라우저에 이전 state가 남은 것이다.

```text
브라우저 새로고침
```

그래도 계속 나오면 서버에 최신 코드가 반영됐는지 확인한다.

```bash
cd ~/AHJ/ship-defect-dashboard
npm run build
```

### pose는 오는데 YOLO detection이 안 오는 경우

1. `/camera/image_raw` publisher 확인
2. YOLO 프로세스 확인
3. 탐지 대상이 실제 카메라 화면에 있는지 확인

```bash
ros2 topic info -v /camera/image_raw
pgrep -af 'detect_raw_ncnn_mqtt.py'
tail -80 ~/yolo_mqtt_bridge.log
```

`Publisher count: 0`이면 카메라 launch를 다시 실행한다.

### 카메라 화면이 안 보이는 경우

```bash
ss -lntp | grep ':8080'
pgrep -af 'raw_camera_mjpeg_server.py'
tail -80 ~/mjpeg_bridge.log
```

브라우저에서 직접 확인:

```text
http://10.10.16.155:8080/stream.mjpg
```

### robot.launch.py가 실패하는 경우

로그에 아래가 보이면:

```text
KeyError: 'LDS_MODEL'
```

아래를 넣고 다시 실행한다.

```bash
export LDS_MODEL=LDS-01
```

### turtlebot3_bringup을 못 찾는 경우

아래를 빠뜨린 경우가 많다.

```bash
source ~/turtlebot3_ws/install/setup.bash
```

## 12. 서버에서 현재 MQTT 데이터 빠른 확인

pose:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
  -t 'ship/crack_bot_01/state/pose' \
  -C 1 -W 5 -v
```

detection:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
  -t 'ship/crack_bot_01/detection/crack' \
  -C 1 -W 20 -v
```
