cmake_minimum_required(VERSION 3.16)
project(ship_crack_mqtt_bridge)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(rclcpp_action REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(nav2_msgs REQUIRED)
find_package(nav_msgs REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(std_msgs REQUIRED)
find_package(visualization_msgs REQUIRED)

if(EXISTS "/usr/lib/aarch64-linux-gnu/libpaho-mqttpp3.so")
  set(PAHO_MQTT_CPP_LIB /usr/lib/aarch64-linux-gnu/libpaho-mqttpp3.so)
else()
  find_library(PAHO_MQTT_CPP_LIB
    NAMES paho-mqttpp3
    PATHS /usr/lib/aarch64-linux-gnu /usr/lib/x86_64-linux-gnu
    REQUIRED
  )
endif()

if(EXISTS "/usr/lib/aarch64-linux-gnu/libpaho-mqtt3as.so.1")
  set(PAHO_MQTT_C_LIB /usr/lib/aarch64-linux-gnu/libpaho-mqtt3as.so.1)
else()
  find_library(PAHO_MQTT_C_LIB
    NAMES paho-mqtt3as paho-mqtt3a paho-mqtt3cs paho-mqtt3c
    PATHS /usr/lib/aarch64-linux-gnu /usr/lib/x86_64-linux-gnu
    REQUIRED
  )
endif()

include_directories(/usr/include)

add_executable(ship_crack_mqtt_bridge src/ship_crack_mqtt_bridge.cpp)

ament_target_dependencies(ship_crack_mqtt_bridge
  rclcpp
  rclcpp_action
  geometry_msgs
  nav2_msgs
  nav_msgs
  sensor_msgs
  std_msgs
  visualization_msgs
)

target_link_libraries(ship_crack_mqtt_bridge
  ${PAHO_MQTT_CPP_LIB}
  ${PAHO_MQTT_C_LIB}
)

install(TARGETS ship_crack_mqtt_bridge
  DESTINATION lib/${PROJECT_NAME}
)

ament_package()
