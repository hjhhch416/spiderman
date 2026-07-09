# 실제 터틀봇 3D SLAM 및 자율 주행(Nav2) 시연 패키지

이 패키지는 실제 수직 철판 바닥(약 1m x 1m)과 포맥스 가이드 벽면 환경에서 터틀봇3 Waffle 하드웨어를 구동하여 지형을 매핑(SLAM)하고, 실시간 위치 추정 및 장애물 회피 자율 주행(Nav2)을 시연하는 데 최적화된 파일 모음입니다.

---

## 📁 구성 파일 설명

### 1. 시연 기동 스크립트 (Shell Scripts)
* **`real_robot_mapping.sh`**: 실제 로봇 수동 매핑(지도 생성) 런처. 라이다 센서 프레임(`laser_frame`)과 모체(`base_link` 및 `base_footprint`) 사이의 static TF를 PC에서 강제 연동하고, RTAB-Map SLAM 노드를 실측 오도메트리 전진 신뢰 모드로 기동합니다.
* **`real_robot_navigation.sh`**: 실제 로봇 자율 주행 런처. 사전 저장된 `map.yaml` 지도를 로드하여 장애물 회피 주행 경로를 계산하는 Nav2 통합 엔진(`bringup_launch.py`)과 RTAB-Map 위치 정합 노드를 동시에 실행합니다.

### 2. 설정 파라미터 및 지도 데이터 (Configuration & Map)
* **`flat_nav2_params.yaml`**: 협소한 철판 공간을 위한 내비게이션 튜닝 파일. 로봇 동작 범위 축소(Robot Radius=15cm, Inflation Radius=25cm, Cost scaling=10.0), A* 플래너 기동, 미개척 영역 주행 금지, 실시간 RTC 클록 적용(`use_sim_time: false`)이 설정되어 있습니다.
* **`map.yaml` & `map.pgm`**: 실제 벽면 가림막 주행을 통해 성공적으로 작성 및 영구 저장된 사각형 격자 지도 데이터입니다.
* **`nav2_with_3dmap.rviz`**: 실시간 3D 장애물 코스트맵 및 실시간 위치 정합을 가시화하는 전용 RViz 뷰어 설정 파일입니다.

---

## 🚀 시연 시나리오 가동 순서

### Step 1. 수동 조작 기반 3D SLAM 매핑 (지도 생성)
1. 실물 로봇을 철판 하단 구석 시작점에 자석 부착합니다.
2. PC 터미널에서 매핑 스크립트를 기동합니다:
   ```bash
   cd ~/ros2_ws
   ./real_robot_mapping.sh
   ```
3. 새 터미널을 열고 키보드 텔레옵 노드를 켜서 로봇을 **매우 천천히(선속도 0.05m/s 이내)** 조작해 철판을 사각형 궤도로 한 바퀴 주행시킵니다:
   ```bash
   ros2 run turtlebot3_teleop teleop_keyboard
   ```
4. RViz 상에 깨끗한 직사각형 지도가 완성되면 새 터미널에서 지도를 저장합니다:
   ```bash
   ros2 run nav2_map_server map_saver_cli -f ~/map
   ```
5. 매핑을 실행 중이던 터미널에서 **`Ctrl + C`**를 입력하여 노드를 일괄 종료시킵니다. (데이터베이스가 `~/ros2_ws/real_rtabmap.db`에 자동 보관됩니다).

### Step 2. Nav2 장애물 회피 자율 주행 시연
1. PC 터미널에서 자율 주행 스크립트를 기동합니다:
   ```bash
   cd ~/ros2_ws
   ./real_robot_navigation.sh
   ```
2. RViz 창에 저장된 정적 격자 지도가 뜨면, 상단 메뉴의 **`2D Pose Estimate`** 버튼을 눌러 실제 로봇이 부착되어 있는 현재 위치와 머리 방향을 마우스 클릭&드래그로 정확하게 맞춰줍니다.
3. 위치 정합이 완료되면 로봇 센서 반경 내의 3D 장애물(벽면 가림막) 영역이 분홍색/보라색 코스트맵 레이어로 깔끔하게 투영됩니다.
4. 이제 **`Nav2 Goal`** 버튼을 누르고 철판 내부의 안전 영역 목적지를 클릭하면, 로봇이 벽면을 피해 지정된 목표지점까지 스스로 조향 및 직진하여 자율 주행을 진행합니다.

