# 🚢 해상 선박 선체 검사 AI 로봇

![ROS2](https://img.shields.io/badge/ROS2-Humble-blue)
![RTAB-Map](https://img.shields.io/badge/RTAB--Map-3D_SLAM-FF8C00)
![Nav2](https://img.shields.io/badge/Nav2-Autonomous-8A2BE2)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-black?logo=three.js)
![YOLO](https://img.shields.io/badge/YOLOv5n-Edge_AI-yellow)
![NCNN](https://img.shields.io/badge/NCNN-Optimization-808080)
![MQTT](https://img.shields.io/badge/MQTT-Mosquitto-green)

> **인텔 엣지 AI SW 아카데미 9기 최종 프로젝트**  🏅 [최종 프로젝트 경진대회 최우수상 수상]

---

## 📅 프로젝트 개요
- **프로젝트 명:** 해상 선박 선체 검사 AI 로봇
- **수행 기간:** 2026.06.29 ~ 2026.07.09
- **주요 기능**
  - **1:** 3D LiDAR 및 Nav2 기반 수직 철판 자율주행 및 SLAM 매핑
  - **2:** YOLOv5n(NCNN) 기반 실시간 선체 결함(부식, 크랙) 탐지
  - **3:** 네오디뮴(34.5kgf)을 활용한 안정적인 수직 등반 시스템
  - **4:** MQTT 및 MJPEG 스트리밍 기반 초저지연/경량화 원격 통신망 구축
  - **5:** React & Three.js 기반 3D 디지털 트윈 통합 웹 관제 대시보드
  - **6:** 커스텀 NMS 및 중복 탐지 필터링 적용과 실시간 결함 위치 데이터(JSONL) 로깅
  
---

## 🌟 개발 배경 
| <img src="https://github.com/user-attachments/assets/48d3bd4b-b754-42d9-9f53-efd1c76e81da" alt="수작업 안전 위험" width="400" height="260" /> | <img src="https://github.com/user-attachments/assets/a84cd05c-208a-40bc-aaa6-6e22e381392c" alt="선박 검사 프로세스의 고비용 및 저효율성" width="400" height="260" /> |
| :---: | :---: |
| ⚠️ **수작업 안전 위험** | 📉 **선박 검사 프로세스의 고비용 및 저효율성** |

> 본 프로젝트는 기존 수작업에 의존하여 고비용, 저효율성 및 인명 사고의 위험성을 내포하고 있던 선박 외벽 검사 작업을 자동화하기 위한 '수직 벽면 자율주행 로봇 및 AI 기반 결함 탐지 통합 관제 시스템'입니다.
> 
> 강자성체 기반의 하드웨어 기술과 ROS2, AI 비전 알고리즘, 그리고 웹 관제 기술을 융합하여 선체 유지보수 프로세스의 디지털 전환을 목표로 합니다.

---

## 🏗 시스템 아키텍처 (System Architecture)
<img width="1450" height="1085" alt="KakaoTalk_20260706_003405807" src="https://github.com/user-attachments/assets/3a069887-4c33-49ba-9758-266b79934036" />

---

## 🛠 기술 스택
| 분류 | 기술 Stack |
| :--- | :--- |
| **Languages** | C++, Python, JavaScript, Shell Script |
| **Communication** | MQTT, WebSocket, MJPEG Stream |
| **Frameworks** | ROS2 (Nav2, RTAB-Map), YOLOv5n, NCNN, OpenCV, React, Three.js, Zustand, Vite |
| **Hardware/OS** | Raspberry Pi 4, TurtleBot3 (Burger), CYG LiDAR D2, Pi Camera V2, IMU (OpenCR), Ubuntu 22.04 |

---

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

---

## 🔬 기술적 세부 구현

### 1. Robotics: 수직 벽면 자율주행 및 3D SLAM 고도화
* **수직 환경을 위한 TF 및 좌표계 매핑**: 일반적인 평면 주행 로봇과 좌표계 기준이 다른 수직 환경을 고려하여 `base_footprint` -> `base_link` -> `laser_frame` 간의 정적 변환을 세밀하게 적용해 3D LiDAR 데이터를 2D SLAM에 투영했습니다.
* **3D LiDAR 데이터 전처리**: Nav2 장애물 회피를 위해 `pointcloud_to_laserscan` 노드를 사용, 지면 노이즈 필터링을 위해 Z축 기준 `min_height: 0.12`, `max_height: 0.3` 영역만 슬라이싱하여 신뢰성을 높였습니다.
* **Nav2 Costmap 튜닝**: 협소한 철판 위 주행을 위해 Robot Radius 0.15m, Inflation Radius 0.25m, Cost Scaling 10.0으로 파라미터를 최적화했습니다.

### 2. Edge AI Vision: 자원 제약 환경에서의 실시간 탐지
* **NCNN 기반 경량화**: 라즈베리파이에서 실시간 FPS를 확보하기 위해 PyTorch 모델을 NCNN 포맷(`.param`, `.bin`)으로 최적화하여 배포했습니다.
* **커스텀 NMS 및 중복 탐지 필터링**: Bounding Box의 IoU가 0.45 이상이거나 중심점 거리 기반으로 동일 객체를 판별하여 대시보드로 불필요한 중복 데이터가 전송되는 것을 방지했습니다.

### 3. Backend & Communication: C++ 기반 MQTT 브릿지
* **비동기 초저지연 브릿지**: ROS2의 Odometry, Pose, 결함 정보 등을 웹 대시보드로 보내기 위해 Paho MQTT 라이브러리를 활용한 C++ 브릿지(`ship_crack_mqtt_bridge`)를 자체 개발했습니다.
* **동적 상대 좌표계**: 주행 시작점을 `0,0` 원점으로 매핑하기 위해 첫 번째 수신된 오도메트리 값을 기준으로 삼는 `useRelativePose` 플래그 및 변환 로직을 설계했습니다.

### 4. 3D Digital Twin Dashboard: React + Three.js
* **Zustand 최적화**: 수신되는 로봇의 Pose와 결함 데이터를 Zustand로 전역 관리하며, 메모리 릭을 방지하기 위해 로봇 이동 궤적(Trail) 포인트를 최대 240개로 제한했습니다.
* **3D 동적 프로젝션 (`projectToLeftWall`)**: 로봇에서 보내는 ROS2의 평면(2D) 맵 좌표를 Three.js 상의 3D 선박 모델의 좌측 수직 벽면(Left Wall) 공간에 정확히 매핑하기 위해 축 변환 및 프로젝션 로직을 자체 구현했습니다.

---

### 🎬 시연 영상
[![해상선박선체검사AI로봇 시연영상](https://i.ytimg.com/vi/KMK6EfqXQ_Y/maxresdefault.jpg)](https://youtu.be/KMK6EfqXQ_Y)

---

## 💡 한계점 및 향후 과제 
- 수직 철판 등반 시 발생하는 IMU와 휠 엔코더 간의 데이터 융합 오차 개선
- 매끄러운 철판 환경에서 라이다(LiDAR) 특징점 매칭이 어려운 사각지대 한계 극복
- 탐지 정확도 고도화를 위한 데이터셋 확충 및 모델 마이그레이션 (YOLOv5n → YOLO11n)
