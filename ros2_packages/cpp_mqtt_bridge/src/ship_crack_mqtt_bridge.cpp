#include <algorithm>
#include <chrono>
#include <cmath>
#include <iomanip>
#include <limits>
#include <memory>
#include <regex>
#include <sstream>
#include <string>

#include <mqtt/async_client.h>
#include <rclcpp/rclcpp.hpp>
#include <rclcpp_action/rclcpp_action.hpp>

#include <builtin_interfaces/msg/duration.hpp>
#include <geometry_msgs/msg/pose_with_covariance_stamped.hpp>
#include <geometry_msgs/msg/twist.hpp>
#include <nav2_msgs/action/navigate_to_pose.hpp>
#include <nav_msgs/msg/odometry.hpp>
#include <sensor_msgs/msg/battery_state.hpp>
#include <sensor_msgs/msg/laser_scan.hpp>
#include <std_msgs/msg/string.hpp>
#include <visualization_msgs/msg/marker.hpp>
#include <visualization_msgs/msg/marker_array.hpp>

using namespace std::chrono_literals;

namespace
{
constexpr double kPi = 3.14159265358979323846;

double yawFromQuaternion(const geometry_msgs::msg::Quaternion &q)
{
  const double siny_cosp = 2.0 * (q.w * q.z + q.x * q.y);
  const double cosy_cosp = 1.0 - 2.0 * (q.y * q.y + q.z * q.z);
  return std::atan2(siny_cosp, cosy_cosp);
}

geometry_msgs::msg::Quaternion quaternionFromYaw(double yaw)
{
  geometry_msgs::msg::Quaternion q;
  q.x = 0.0;
  q.y = 0.0;
  q.z = std::sin(yaw * 0.5);
  q.w = std::cos(yaw * 0.5);
  return q;
}

int64_t nowMs()
{
  return std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::system_clock::now().time_since_epoch()).count();
}

std::string number(double value, int precision = 3)
{
  std::ostringstream out;
  out << std::fixed << std::setprecision(precision) << value;
  return out.str();
}

double extractJsonNumber(const std::string &json, const std::string &key, double fallback)
{
  const std::regex pattern("\"" + key + "\"\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)");
  std::smatch match;
  if (!std::regex_search(json, match, pattern)) {
    return fallback;
  }
  return std::stod(match[1].str());
}
}

class ShipCrackMqttBridge : public rclcpp::Node, public virtual mqtt::callback
{
public:
  using NavigateToPose = nav2_msgs::action::NavigateToPose;
  using GoalHandleNavigateToPose = rclcpp_action::ClientGoalHandle<NavigateToPose>;

  ShipCrackMqttBridge()
  : Node("ship_crack_mqtt_bridge"),
    baseTopic_("ship/crack_bot_01"),
    markerId_(0)
  {
    declare_parameter("mqtt_server", "tcp://127.0.0.1:1883");
    declare_parameter("mqtt_client_id", "ship_crack_mqtt_bridge");
    declare_parameter("base_topic", baseTopic_);
    declare_parameter("pose_topic", "/amcl_pose");
    declare_parameter("odom_topic", "/odom");
    declare_parameter("battery_topic", "/battery_state");
    declare_parameter("scan_topic", "/scan");
    declare_parameter("crack_detection_topic", "/yolo/crack_detections");
    declare_parameter("cmd_vel_topic", "/cmd_vel");
    declare_parameter("marker_topic", "/crack_markers");
    declare_parameter("nav_action_name", "navigate_to_pose");
    declare_parameter("nav_frame_id", "map");
    declare_parameter("obstacle_distance_m", 0.7);
    declare_parameter("danger_distance_m", 0.35);

    baseTopic_ = get_parameter("base_topic").as_string();
    obstacleDistance_ = get_parameter("obstacle_distance_m").as_double();
    dangerDistance_ = get_parameter("danger_distance_m").as_double();

    cmdPub_ = create_publisher<geometry_msgs::msg::Twist>(get_parameter("cmd_vel_topic").as_string(), 10);
    markerPub_ = create_publisher<visualization_msgs::msg::MarkerArray>(get_parameter("marker_topic").as_string(), 10);
    navClient_ = rclcpp_action::create_client<NavigateToPose>(
      this, get_parameter("nav_action_name").as_string());

    poseSub_ = create_subscription<geometry_msgs::msg::PoseWithCovarianceStamped>(
      get_parameter("pose_topic").as_string(), 10,
      std::bind(&ShipCrackMqttBridge::onPose, this, std::placeholders::_1));
    odomSub_ = create_subscription<nav_msgs::msg::Odometry>(
      get_parameter("odom_topic").as_string(), 10,
      std::bind(&ShipCrackMqttBridge::onOdom, this, std::placeholders::_1));
    batterySub_ = create_subscription<sensor_msgs::msg::BatteryState>(
      get_parameter("battery_topic").as_string(), 10,
      std::bind(&ShipCrackMqttBridge::onBattery, this, std::placeholders::_1));
    scanSub_ = create_subscription<sensor_msgs::msg::LaserScan>(
      get_parameter("scan_topic").as_string(), 10,
      std::bind(&ShipCrackMqttBridge::onScan, this, std::placeholders::_1));
    crackSub_ = create_subscription<std_msgs::msg::String>(
      get_parameter("crack_detection_topic").as_string(), 10,
      std::bind(&ShipCrackMqttBridge::onCrackDetection, this, std::placeholders::_1));

    connectMqtt();
    heartbeatTimer_ = create_wall_timer(1s, std::bind(&ShipCrackMqttBridge::publishHeartbeat, this));
  }

  void message_arrived(mqtt::const_message_ptr msg) override
  {
    const std::string topic = msg->get_topic();
    const std::string payload = msg->to_string();

    if (topic == mqttTopic("command/stop")) {
      cmdPub_->publish(geometry_msgs::msg::Twist());
      publishJson("state/nav", "{\"mission_status\":\"manual_stop\"}");
      return;
    }

    if (topic == mqttTopic("command/cmd_vel")) {
      geometry_msgs::msg::Twist twist;
      twist.linear.x = extractJsonNumber(payload, "linear_x", 0.0);
      twist.angular.z = extractJsonNumber(payload, "angular_z", 0.0);
      cmdPub_->publish(twist);
      return;
    }

    if (topic == mqttTopic("command/nav")) {
      sendNavGoal(payload);
    }
  }

private:
  void connectMqtt()
  {
    const std::string server = get_parameter("mqtt_server").as_string();
    const std::string clientId = get_parameter("mqtt_client_id").as_string();
    mqttClient_ = std::make_unique<mqtt::async_client>(server, clientId);
    mqttClient_->set_callback(*this);

    mqtt::connect_options options;
    options.set_clean_session(true);
    mqttClient_->connect(options)->wait();
    mqttClient_->subscribe(mqttTopic("command/cmd_vel"), 0)->wait();
    mqttClient_->subscribe(mqttTopic("command/stop"), 0)->wait();
    mqttClient_->subscribe(mqttTopic("command/nav"), 0)->wait();
    RCLCPP_INFO(get_logger(), "MQTT connected: %s", server.c_str());
  }

  std::string mqttTopic(const std::string &suffix) const
  {
    return baseTopic_ + "/" + suffix;
  }

  void publishJson(const std::string &suffix, const std::string &body)
  {
    std::string payload = body;
    if (payload.size() >= 2 && payload.front() == '{' && payload.back() == '}') {
      payload.pop_back();
      payload += ",\"timestamp_ms\":" + std::to_string(nowMs()) + "}";
    }
    if (mqttClient_) {
      mqttClient_->publish(mqttTopic(suffix), payload.c_str(), payload.size(), 0, false);
    }
  }

  void onPose(const geometry_msgs::msg::PoseWithCovarianceStamped::SharedPtr msg)
  {
    const auto &pose = msg->pose.pose;
    frameId_ = msg->header.frame_id.empty() ? "map" : msg->header.frame_id;
    x_ = pose.position.x;
    y_ = pose.position.y;
    z_ = pose.position.z;
    headingDeg_ = yawFromQuaternion(pose.orientation) * 180.0 / kPi;
    publishPose();
  }

  void sendNavGoal(const std::string &payload)
  {
    const double x = extractJsonNumber(payload, "x", x_);
    const double y = extractJsonNumber(payload, "y", y_);
    const double theta = extractJsonNumber(
      payload,
      "theta",
      extractJsonNumber(
        payload,
        "yaw",
        extractJsonNumber(payload, "heading_deg", headingDeg_) * kPi / 180.0));

    if (!navClient_->wait_for_action_server(1s)) {
      RCLCPP_WARN(get_logger(), "Nav2 action server is not available");
      publishJson("state/nav", "{\"mission_status\":\"nav_server_unavailable\"}");
      return;
    }

    NavigateToPose::Goal goal;
    goal.pose.header.frame_id = get_parameter("nav_frame_id").as_string();
    goal.pose.header.stamp = now();
    goal.pose.pose.position.x = x;
    goal.pose.pose.position.y = y;
    goal.pose.pose.position.z = 0.0;
    goal.pose.pose.orientation = quaternionFromYaw(theta);

    rclcpp_action::Client<NavigateToPose>::SendGoalOptions options;
    options.goal_response_callback =
      [this](const GoalHandleNavigateToPose::SharedPtr & goalHandle) {
        if (!goalHandle) {
          publishJson("state/nav", "{\"mission_status\":\"goal_rejected\"}");
          return;
        }
        publishJson("state/nav", "{\"mission_status\":\"goal_accepted\"}");
      };
    options.result_callback =
      [this](const GoalHandleNavigateToPose::WrappedResult & result) {
        std::string status = "unknown";
        if (result.code == rclcpp_action::ResultCode::SUCCEEDED) {
          status = "succeeded";
        } else if (result.code == rclcpp_action::ResultCode::ABORTED) {
          status = "aborted";
        } else if (result.code == rclcpp_action::ResultCode::CANCELED) {
          status = "canceled";
        }
        publishJson("state/nav", "{\"mission_status\":\"" + status + "\"}");
      };

    navClient_->async_send_goal(goal, options);
    RCLCPP_INFO(get_logger(), "Nav goal sent: x=%.3f y=%.3f theta=%.3f", x, y, theta);
  }

  void onOdom(const nav_msgs::msg::Odometry::SharedPtr msg)
  {
    linearX_ = msg->twist.twist.linear.x;
    angularZ_ = msg->twist.twist.angular.z;

    if (!hasPose_) {
      const auto &pose = msg->pose.pose;
      frameId_ = msg->header.frame_id.empty() ? "odom" : msg->header.frame_id;
      x_ = pose.position.x;
      y_ = pose.position.y;
      z_ = pose.position.z;
      headingDeg_ = yawFromQuaternion(pose.orientation) * 180.0 / kPi;
    }
    publishPose();
  }

  void publishPose()
  {
    hasPose_ = true;
    std::ostringstream json;
    json << "{\"frame_id\":\"" << frameId_ << "\","
         << "\"x\":" << number(x_) << ","
         << "\"y\":" << number(y_) << ","
         << "\"z\":" << number(z_) << ","
         << "\"heading_deg\":" << number(headingDeg_, 2) << ","
         << "\"speed_mps\":" << number(std::abs(linearX_)) << ","
         << "\"linear_x\":" << number(linearX_) << ","
         << "\"angular_z\":" << number(angularZ_) << "}";
    publishJson("state/pose", json.str());
  }

  void onBattery(const sensor_msgs::msg::BatteryState::SharedPtr msg)
  {
    const double percentage = msg->percentage >= 0.0 ? msg->percentage * 100.0 : -1.0;
    std::ostringstream json;
    json << "{\"percentage\":" << number(percentage, 1) << ","
         << "\"voltage\":" << number(msg->voltage, 2) << ","
         << "\"current\":" << number(msg->current, 2) << ","
         << "\"power_supply_status\":" << static_cast<int>(msg->power_supply_status) << "}";
    publishJson("state/battery", json.str());
  }

  void onScan(const sensor_msgs::msg::LaserScan::SharedPtr msg)
  {
    double minDistance = std::numeric_limits<double>::infinity();
    for (const float range : msg->ranges) {
      if (std::isfinite(range) && range >= msg->range_min && range <= msg->range_max) {
        minDistance = std::min(minDistance, static_cast<double>(range));
      }
    }

    const bool hasRange = std::isfinite(minDistance);
    const bool obstacle = hasRange && minDistance <= obstacleDistance_;
    const bool danger = hasRange && minDistance <= dangerDistance_;
    const std::string risk = danger ? "high" : obstacle ? "medium" : "low";

    std::ostringstream json;
    json << "{\"min_distance_m\":" << (hasRange ? number(minDistance) : "null") << ","
         << "\"obstacle_detected\":" << (obstacle ? "true" : "false") << ","
         << "\"collision_risk\":\"" << risk << "\"}";
    publishJson("state/safety", json.str());
  }

  void onCrackDetection(const std_msgs::msg::String::SharedPtr msg)
  {
    const double confidence = extractJsonNumber(msg->data, "confidence", 0.0);
    std::ostringstream json;
    json << "{\"frame_id\":\"" << frameId_ << "\","
         << "\"x\":" << number(x_) << ","
         << "\"y\":" << number(y_) << ","
         << "\"z\":" << number(z_) << ","
         << "\"heading_deg\":" << number(headingDeg_, 2) << ","
         << "\"confidence\":" << number(confidence, 2) << ","
         << "\"status\":\"detected\"}";
    publishJson("detection/crack", json.str());
    publishCrackMarker();
  }

  void publishCrackMarker()
  {
    visualization_msgs::msg::Marker marker;
    marker.header.frame_id = frameId_;
    marker.header.stamp = now();
    marker.ns = "cracks";
    marker.id = markerId_++;
    marker.type = visualization_msgs::msg::Marker::SPHERE;
    marker.action = visualization_msgs::msg::Marker::ADD;
    marker.pose.position.x = x_;
    marker.pose.position.y = y_;
    marker.pose.position.z = z_;
    marker.pose.orientation.w = 1.0;
    marker.scale.x = 0.12;
    marker.scale.y = 0.12;
    marker.scale.z = 0.12;
    marker.color.r = 1.0;
    marker.color.g = 0.08;
    marker.color.b = 0.04;
    marker.color.a = 1.0;

    visualization_msgs::msg::MarkerArray array;
    array.markers.push_back(marker);
    markerPub_->publish(array);
  }

  void publishHeartbeat()
  {
    publishJson("state/heartbeat", "{\"status\":\"online\"}");
  }

  std::unique_ptr<mqtt::async_client> mqttClient_;
  std::string baseTopic_;

  rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr cmdPub_;
  rclcpp::Publisher<visualization_msgs::msg::MarkerArray>::SharedPtr markerPub_;
  rclcpp_action::Client<NavigateToPose>::SharedPtr navClient_;
  rclcpp::Subscription<geometry_msgs::msg::PoseWithCovarianceStamped>::SharedPtr poseSub_;
  rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odomSub_;
  rclcpp::Subscription<sensor_msgs::msg::BatteryState>::SharedPtr batterySub_;
  rclcpp::Subscription<sensor_msgs::msg::LaserScan>::SharedPtr scanSub_;
  rclcpp::Subscription<std_msgs::msg::String>::SharedPtr crackSub_;
  rclcpp::TimerBase::SharedPtr heartbeatTimer_;

  std::string frameId_ = "map";
  bool hasPose_ = false;
  double x_ = 0.0;
  double y_ = 0.0;
  double z_ = 0.0;
  double headingDeg_ = 0.0;
  double linearX_ = 0.0;
  double angularZ_ = 0.0;
  double obstacleDistance_ = 0.7;
  double dangerDistance_ = 0.35;
  int markerId_;
};

int main(int argc, char **argv)
{
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<ShipCrackMqttBridge>());
  rclcpp::shutdown();
  return 0;
}
