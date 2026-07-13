# 🚢 해상 선박 선체 검사 AI 로봇

![ROS2](https://img.shields.io/badge/ROS2-Humble-blue)
![RTAB-Map](https://img.shields.io/badge/RTAB--Map-3D_SLAM-FF8C00)
![Nav2](https://img.shields.io/badge/Nav2-Autonomous-8A2BE2)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-black?logo=three.js)
![YOLO](https://img.shields.io/badge/YOLOv5n-Edge_AI-yellow)
![NCNN](https://img.shields.io/badge/NCNN-Optimization-808080)
![MQTT](https://img.shields.io/badge/MQTT-Mosquitto-green)

> **인텔 엣지 AI SW 아카데미 9기 최종 프로젝트** 

## 📖 프로젝트 개요
> 본 프로젝트는 기존 수작업에 의존하여 고비용, 저효율성 및 인명 사고의 위험성을 내포하고 있던 선박 외벽 검사 작업을 자동화하기 위한 '수직 벽면 자율주행 로봇 및 AI 기반 결함 탐지 통합 관제 시스템'입니다.
> 
> 강자성체 기반의 하드웨어 기술과 ROS2, AI 비전 알고리즘, 그리고 웹 관제 기술을 융합하여 선체 유지보수 프로세스의 디지털 전환을 목표로 합니다.

## 🏗 시스템 아키텍처 (System Architecture)
<img width="1450" height="1085" alt="KakaoTalk_20260706_003405807" src="https://github.com/user-attachments/assets/3a069887-4c33-49ba-9758-266b79934036" />

## 🌟 주요 기능
* **수직 철판 자율 주행**: 34.5kgf(338N)의 네오디뮴을 이용하여 선박 외벽 등반 및 이동
* **3D SLAM 및 자율 네비게이션**: CYG 3D LiDAR와 RTAB-Map, Nav2를 활용한 벽면 3D 매핑 및 장애물 회피 자율주행
* **실시간 결함 탐지 (Edge AI)**: Raspberry Pi 4 환경에서 NCNN으로 최적화된 YOLOv5n 모델을 구동하여 크랙 및 부식 실시간 탐지 (mAP50 86.9%)
* **3D 디지털 트윈 대시보드**: React와 Three.js를 활용하여 선박 외관을 3D로 렌더링하고, 로봇의 실시간 위치 및 결함 좌표를 시각화하는 관제 시스템
* **경량 통신망**: ROS2 시스템과 웹 대시보드 간의 데이터를 MQTT(Mosquitto) 및 WebSockets를 통해 실시간/초저지연 송수신

### 💻 기술 스택 
* **Hardware**: Raspberry Pi 4, TurtleBot3 (Burger), CYG LiDAR D2, Pi Camera V2, OpenCR
* **Robotics**: Ubuntu 22.04, ROS2 Humble, RTAB-Map, Nav2 
* **AI/Vision**: OpenCV, YOLOv5n, NCNN 
* **Frontend/Dashboard**: React, Three.js (@react-three/fiber), Zustand, Vite 
* **Communication**: MQTT, WebSocket, MJPEG Stream

## 📂 폴더 구조 (Directory Structure)
```text
📦 해상선박선체검사AI로봇
 ┣ 📂 bridges/                   # ROS2 odom/pose 데이터를 MQTT로 변환하는 브릿지 코드
 ┣ 📂 dashboard/                 # React & Three.js 기반 웹 대시보드 소스코드 (Vite)
 ┣ 📂 docs/                      # 대시보드 및 시스템 실행 메뉴얼
 ┣ 📂 robot_slam_nav_code/       # RTAB-Map 및 Nav2 기반 3D SLAM, 자율주행 ROS2 패키지
 ┣ 📂 ros2_packages/             # 카메라 스트리밍 및 YOLO 결함 탐지 관련 ROS2 커스텀 노드
 ┣ 📂 ps2_teleop_release/        # PS2 조이스틱 원격 수동 제어 패키지
 ┣ 📂 scripts/                   # 로봇 Bringup 및 통합 실행 Bash 스크립트 모음
 ┗ 📜 README.md
```

## 🚀 시작하기

서버 PC(관제 대시보드 및 MQTT Broker)와 로봇(Raspberry Pi 4) 양쪽에서 각각 실행되어야 합니다.

### 💻 1. 서버 PC 세팅 (Dashboard & MQTT)
서버 PC에서는 MQTT 브로커(Mosquitto)를 실행하고 관제용 웹 대시보드를 구동합니다.

```bash
# 1. Mosquitto MQTT & WebSocket 실행 확인
sudo systemctl status mosquitto

# 2. 대시보드 폴더로 이동 및 의존성 설치
cd dashboard/ship-defect-dashboard
npm install

# 3. 대시보드 실행
npm run dev -- --host 0.0.0.0 --port 5173
```

## 🤖 2. 로봇 세팅 (ROS2 & AI Vision)
로봇(Raspberry Pi 4)에서는 하드웨어 센서 기동, SLAM/Nav2, YOLO 탐지 노드 및 통신 브릿지를 실행합니다.

```bash
# 1. 로봇 Bringup 및 센서(카메라 등) 구동
bash ~/bin/bringup.sh
ros2 launch turtlebot3_bringup camera.launch.py format:=BGR888

# 2. 3D SLAM 매핑 또는 자율주행 실행 (목적에 따라 택 1)
./scripts/real_robot_mapping.sh     # 맵 생성 모드
./scripts/real_robot_navigation.sh  # 자율 주행 모드

# 3. YOLO NCNN 객체 탐지 및 MQTT 브릿지 실행
python3 detect_raw_ncnn_mqtt.py --broker [서버_IP] --image-topic /camera/image_raw
```

### 🎬 시연 영상
[![해상선박선체검사AI로봇 시연영상](https://i.ytimg.com/vi/KMK6EfqXQ_Y/maxresdefault.jpg)](https://youtu.be/KMK6EfqXQ_Y)
