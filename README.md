# 📷 ESP32-CAM Simple Monitor

![Platform](https://img.shields.io/badge/Platform-ESP32-blue)
![Framework](https://img.shields.io/badge/Framework-Arduino-orange)

A lightweight IoT monitoring system built with an ESP32-CAM, HLK-LD1020-P mmWave radar sensor, and AHT30 temperature/humidity sensor. The system provides real-time environmental monitoring, motion detection, image capture, and a responsive web dashboard.

---

## ✨ Features

### 📹 Camera Monitoring

* ESP32-CAM image capture
* Motion-triggered snapshots
* Live image viewing from browser
* Capture counter and timestamps

### 📡 Motion Detection

* HLK-LD1020-P 24GHz radar sensor
* Presence detection
* Real-time motion status updates
* Event logging

### 🌡️ Environmental Monitoring

* Temperature monitoring
* Humidity monitoring
* Real-time sensor readings
* Historical trend display

### 🌐 Web Dashboard

* Responsive design
* Mobile-friendly interface
* Live status updates
* Device statistics
* Event logs

---

## ⚡ Quick Start

1. Connect all hardware components.
2. Install Arduino IDE and ESP32 board package.
3. Configure Wi-Fi credentials.
4. Upload firmware to ESP32-CAM.
5. Open Serial Monitor.
6. Find the ESP32 IP address.
7. Open the IP address in your browser.

---

## 🛠 Hardware Requirements

| Component                           | Quantity |
| ----------------------------------- | -------- |
| ESP32-CAM (AI Thinker)              | 1        |
| HLK-LD1020-P Radar Sensor           | 1        |
| AHT30 Temperature & Humidity Sensor | 1        |
| USB-to-TTL Programmer               | 1        |
| Jumper Wires                        | Several  |
| Breadboard                          | 1        |
| 5V Power Supply                     | 1        |

---

## 🔌 Wiring Guide

### AHT30 → ESP32-CAM

| AHT30 | ESP32-CAM |
| ----- | --------- |
| VCC   | 3.3V      |
| GND   | GND       |
| SDA   | GPIO14    |
| SCL   | GPIO15    |

### HLK-LD1020-P → ESP32-CAM

| HLK-LD1020-P | ESP32-CAM         |
| ------------ | ----------------- |
| VCC          | 5V                |
| GND          | GND               |
| TX           | GPIO16            |
| RX           | GPIO17 (Optional) |

> ⚠️ Important: The HLK-LD1020-P must be powered from 5V.

---

## 🚀 Installation

### Step 1 — Install Arduino IDE

Download Arduino IDE:

https://www.arduino.cc/en/software

### Step 2 — Install ESP32 Board Package

Open:

```text
File → Preferences
```

Add:

```text
https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
```

Then:

```text
Tools → Board → Boards Manager
```

Search:

```text
ESP32
```

Install the latest package.

### Step 3 — Install Libraries

Install the following libraries:

```text
Adafruit AHTX0
ArduinoJson
WiFi
WebServer
Wire
```

### Step 4 — Clone Repository

```bash
git clone https://github.com/Freelacerz/ESP-32-CAM-simple-moniter.git
```

### Step 5 — Configure Wi-Fi

Edit:

```cpp
#define WIFI_SSID     "YOUR_WIFI"
#define WIFI_PASSWORD "YOUR_PASSWORD"
```

### Step 6 — Configure Board

```text
Board: AI Thinker ESP32-CAM
Upload Speed: 115200
CPU Frequency: 80 MHz
Flash Size: 4MB
Partition Scheme: Default 4MB with SPIFFS
```

### Step 7 — Upload Firmware

Connect:

```text
GPIO0 → GND
```

Upload the sketch.

After upload:

1. Disconnect GPIO0 from GND
2. Press RESET

### Step 8 — Open Dashboard

Open Serial Monitor:

```text
115200 baud
```

Look for:

```text
IP Address: 192.168.x.x
```

Open:

```text
http://192.168.x.x
```

in your browser.

---

## 📊 Dashboard Features

### Live Monitoring

* Current temperature
* Current humidity
* Motion detection status
* Device uptime

### Camera Panel

* Latest captured image
* Capture counter
* Motion-triggered snapshots

### Event Log

* Motion events
* Sensor updates
* System messages
* Time-stamped records

### Statistics

* Reading count
* Capture count
* Uptime
* Connection status

---

## 📡 API Endpoints

### GET /data

Returns:

```json
{
  "temperature": 25.1,
  "humidity": 62.3,
  "motionActive": false,
  "captureCount": 10,
  "readingCount": 250,
  "uptime_s": 3600
}
```

### GET /snapshot

Returns the latest image.

### GET /

Loads the dashboard.

---

## 🔧 Troubleshooting

### Camera Initialization Failed

* Check camera ribbon cable.
* Verify camera module connection.
* Use stable 5V power.

### AHT30 Not Detected

* Verify SDA → GPIO14.
* Verify SCL → GPIO15.
* Check 3.3V power.

### Radar Sensor Not Working

* Verify 5V power.
* Check TX connection.
* Restart the sensor.

### Upload Failed

* Connect GPIO0 to GND.
* Press RESET.
* Verify COM port.

### Dashboard Offline

* Verify Wi-Fi credentials.
* Check IP address.
* Restart ESP32-CAM.

---

## 📁 Project Structure

```text
ESP-32-CAM-simple-moniter/
├── esp32_sensor_hub.ino
├── index.html
├── README.md
├── LICENSE
└── .gitignore
```

---

## 📈 Performance

| Metric                 | Value     |
| ---------------------- | --------- |
| Motion Detection Range | 0.5–5m    |
| Temperature Accuracy   | ±0.3°C    |
| Humidity Accuracy      | ±3% RH    |
| Dashboard Update Rate  | 1.5–2.5s  |
| Power Consumption      | 300–500mA |

---

## 🚀 Future Improvements

* MQTT integration
* Home Assistant support
* Telegram alerts
* Cloud storage
* Video recording
* SD card image storage
* OTA updates
* Multi-device dashboard

---

## 🤝 Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Commit changes.
4. Open a Pull Request.

---

## 📜 License

MIT License

---

## ⭐ Support

If you find this project useful:

* Star the repository
* Report bugs through Issues
* Suggest improvements
* Share the project with others

---

Made with ❤️ using ESP32-CAM, HLK-LD1020-P, and AHT30.
