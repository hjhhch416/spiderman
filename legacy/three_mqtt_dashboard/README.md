# TurtleBot 3D MQTT Dashboard

Three.js로 만든 TurtleBot 2대 관제용 대시보드입니다.

## 실행

현재 Codex PC에서 아래 주소로 열 수 있습니다.

```text
http://127.0.0.1:8603/
```

정적 서버를 직접 다시 띄우려면:

```powershell
cd C:\Users\kccistc1\Documents\Codex\2026-06-23\mqtt\outputs\three_mqtt_dashboard
python -m http.server 8603 --bind 127.0.0.1
```

## Mosquitto WebSocket 설정

브라우저는 MQTT TCP `1883`에 직접 접속할 수 없습니다. 서버 Mosquitto에 WebSocket listener를 추가해야 합니다.

리눅스 서버에서:

```bash
sudo nano /etc/mosquitto/conf.d/websocket.conf
```

내용:

```conf
listener 1883 0.0.0.0
allow_anonymous true

listener 9001 0.0.0.0
protocol websockets
allow_anonymous true
```

재시작:

```bash
sudo systemctl restart mosquitto
ss -lntp | grep -E "1883|9001"
```

대시보드의 Broker WebSocket 값:

```text
ws://10.10.16.201:9001/mqtt
```

## MQTT Pose Payload

추천 topic:

```text
turtlebot/bot17/telemetry/pose
turtlebot/bot18/telemetry/pose
```

payload:

```json
{
  "robot_id": "bot17",
  "x": 1.2,
  "y": -0.5,
  "theta": 1.57,
  "timestamp": "2026-07-04T10:20:00Z"
}
```

기존 `/odom` 브리지가 보내던 topic도 받습니다.

```text
turtlebot/bot17/telemetry/odom
turtlebot/bot18/telemetry/odom
```

## Goal Publish

대시보드에서 바닥을 클릭하면 goal X/Y가 입력됩니다. `Publish Goal`을 누르면 아래 topic으로 전송합니다.

```text
turtlebot/{robot_id}/command/nav
```

payload:

```json
{
  "robot_id": "bot17",
  "target": {
    "x": 1.2,
    "y": -0.5,
    "theta": 0
  },
  "timestamp": "2026-07-04T10:20:00.000Z"
}
```
