import mqtt from "mqtt";
import { useEffect, useRef } from "react";
import { useFleetStore } from "../store/useFleetStore";

const SUBSCRIPTIONS = [
  "turtlebot/bot17/telemetry/pose",
  "turtlebot/bot17/telemetry/odom",
  "turtlebot/bot17/telemetry/status",
  "turtlebot/bot17/detection/defect",
  "ship/crack_bot_01/state/pose",
  "ship/crack_bot_01/state/battery",
  "ship/crack_bot_01/state/heartbeat",
  "ship/crack_bot_01/state/safety",
  "ship/crack_bot_01/detection/crack",
];

export function useMqttConnection(enabled) {
  const clientRef = useRef(null);
  const brokerUrl = useFleetStore((state) => state.connection.brokerUrl);
  const setConnectionStatus = useFleetStore((state) => state.setConnectionStatus);
  const updateRobotPose = useFleetStore((state) => state.updateRobotPose);
  const updateRobotStatus = useFleetStore((state) => state.updateRobotStatus);
  const addDefect = useFleetStore((state) => state.addDefect);
  const addLog = useFleetStore((state) => state.addLog);

  useEffect(() => {
    if (!enabled) {
      clientRef.current?.end(true);
      clientRef.current = null;
      return undefined;
    }

    let client;
    try {
      client = mqtt.connect(brokerUrl, {
        clientId: `ship_dashboard_${Math.random().toString(16).slice(2)}`,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 2000,
      });
    } catch (error) {
      setConnectionStatus("error");
      addLog(`mqtt connect failed: ${error.message}`);
      return undefined;
    }

    clientRef.current = client;
    setConnectionStatus("connecting");
    addLog(`connecting ${brokerUrl}`);

    client.on("connect", () => {
      setConnectionStatus("connected");
      client.subscribe(SUBSCRIPTIONS, { qos: 0 });
      addLog(`subscribed ${SUBSCRIPTIONS.join(", ")}`);
    });

    client.on("reconnect", () => setConnectionStatus("reconnecting"));

    client.on("close", () => setConnectionStatus("closed"));

    client.on("error", (error) => {
      setConnectionStatus("error");
      addLog(`mqtt error: ${error.message}`);
    });

    client.on("message", (topic, message) => {
      try {
        const robotId = robotIdFromTopic(topic);
        const payload = JSON.parse(message.toString());

        if (topic.includes("/detection/defect") || topic.includes("/detection/crack")) {
          addDefect(robotId, {
            source_robot_id: robotId,
            type: topic.includes("/detection/crack") ? "crack" : undefined,
            severity: payload.status === "detected" ? "high" : undefined,
            ...payload,
          });
          addLog(`defect ${robotId}: ${payload.type ?? payload.class_name ?? "crack"}`);
          return;
        }

        if (
          topic.includes("/telemetry/status") ||
          topic.includes("/state/battery") ||
          topic.includes("/state/heartbeat") ||
          topic.includes("/state/safety")
        ) {
          updateRobotStatus(robotId, payload);
          return;
        }

        updateRobotPose(robotId, payload);
      } catch (error) {
        addLog(`message parse failed: ${topic} ${error.message}`);
      }
    });

    return () => {
      client.end(true);
      clientRef.current = null;
    };
  }, [
    enabled,
    brokerUrl,
    setConnectionStatus,
    updateRobotPose,
    updateRobotStatus,
    addDefect,
    addLog,
  ]);

  return {
    publish: (topic, payload, options = { qos: 1, retain: false }) => {
      const client = clientRef.current;
      if (!client?.connected) return false;
      client.publish(topic, JSON.stringify(payload), options);
      return true;
    },
  };
}

function robotIdFromTopic(topic) {
  const parts = topic.split("/");
  const raw = parts[1] || "unknown";
  if (raw === "crack_bot_01") return "bot17";
  return raw;
}
