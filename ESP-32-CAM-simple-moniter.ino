/*
 * ESP32-CAM Sensor Hub (COMPLETE REWRITE)
 * 
 * Hardware:
 *   - ESP32-CAM (AI Thinker) with OV2640 camera
 *   - HLK-LD1020-P (24GHz microwave radar)
 *   - AHT30 (I2C temperature & humidity sensor)
 *
 * Behavior:
 *   - LD1020-P detects motion → capture JPEG photo
 *   - Every 1.5s or 2.5s: read AHT30 T & H
 *   - Serve HTTP dashboard on port 80
 *   - Send JSON API + live images
 *   - All 3 sensors working together
 */

// ── Includes ──────────────────────────────────────────────────────────────
#include "esp_camera.h"
#include "esp_timer.h"
#include "img_converters.h"
#include "fb_gfx.h"
#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <ArduinoJson.h>
#include <SPIFFS.h>

// ── User Configuration ────────────────────────────────────────────────────
#define WIFI_SSID        "YOUR_SSID"
#define WIFI_PASSWORD    "YOUR_PASSWORD"

// AHT30 poll interval (ms): 1500 or 2500
#define TEMP_INTERVAL_MS  1500

// LD1020-P UART configuration
#define LD1020_SERIAL     Serial2
#define LD1020_BAUD       9600
#define LD1020_RX_PIN     16
#define LD1020_TX_PIN     17

// Motion capture cooldown (prevent rapid captures)
#define CAPTURE_COOLDOWN_MS  3000

// Camera capture mode
#define CAPTURE_MODE  PHOTO  // PHOTO or VIDEO

// ── Camera Model (AI-Thinker ESP32-CAM) ───────────────────────────────────
#define CAMERA_MODEL_AI_THINKER
#include "camera_pins.h"

// ── I2C Pins for AHT30 ────────────────────────────────────────────────────
#define I2C_SDA  14
#define I2C_SCL  15

// ── Global Variables ──────────────────────────────────────────────────────
WebServer server(80);
Adafruit_AHTX0 aht;

// Sensor data
float g_temperature  = 0.0f;
float g_humidity     = 0.0f;
uint32_t g_tempReadCount = 0;

// Motion detection
bool   g_motionDetected   = false;
uint32_t g_lastCaptureMs  = 0;
uint32_t g_captureCount   = 0;

// Camera JPEG buffer
uint8_t* g_jpegBuf  = nullptr;
size_t   g_jpegLen  = 0;

// Startup time
uint32_t g_bootTimeMs = 0;

// ─────────────────────────────────────────────────────────────────────────
// Camera Initialization
// ─────────────────────────────────────────────────────────────────────────
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_VGA;   // 640×480
  config.jpeg_quality = 12;              // 0-63, lower = better
  config.fb_count     = 2;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] Init failed: 0x%x\n", err);
    return false;
  }
  
  Serial.println("[CAM] ✓ Initialized OK");
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Capture JPEG Snapshot
// ─────────────────────────────────────────────────────────────────────────
void capturePhoto() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[CAM] ✗ Capture failed");
    return;
  }

  // Check heap before allocating
  uint32_t freeHeap = esp_get_free_heap_size();
  if (freeHeap < (fb->len + 50000)) {
    Serial.printf("[CAM] ✗ Not enough heap (%u bytes free)\n", freeHeap);
    esp_camera_fb_return(fb);
    return;
  }

  // Free old buffer
  if (g_jpegBuf) {
    free(g_jpegBuf);
    g_jpegBuf = nullptr;
    g_jpegLen = 0;
  }

  // Allocate and copy new image
  g_jpegBuf = (uint8_t*)malloc(fb->len);
  if (g_jpegBuf) {
    memcpy(g_jpegBuf, fb->buf, fb->len);
    g_jpegLen = fb->len;
    g_captureCount++;
    Serial.printf("[CAM] ✓ Photo #%u captured (%u bytes, heap: %u)\n",
                  g_captureCount, g_jpegLen, esp_get_free_heap_size());
  } else {
    Serial.println("[CAM] ✗ malloc failed");
  }

  esp_camera_fb_return(fb);

  // Save to SPIFFS (optional)
  char path[32];
  snprintf(path, sizeof(path), "/photo_%04u.jpg", (uint16_t)(g_captureCount % 10));
  File f = SPIFFS.open(path, FILE_WRITE);
  if (f) {
    f.write(g_jpegBuf, g_jpegLen);
    f.close();
    Serial.printf("[SPIFFS] ✓ Saved: %s\n", path);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// LD1020-P Serial Parser
// ─────────────────────────────────────────────────────────────────────────
static char ld_buf[64];
static uint8_t ld_pos = 0;

void pollLD1020() {
  while (LD1020_SERIAL.available()) {
    char c = LD1020_SERIAL.read();
    
    if (c == '\n' || ld_pos >= sizeof(ld_buf) - 1) {
      ld_buf[ld_pos] = '\0';
      String line = String(ld_buf);
      line.trim();

      if (line.length() > 0) {
        Serial.printf("[LD1020] %s\n", line.c_str());

        // Check for motion commands
        if (line.indexOf("ON") >= 0 || line.indexOf("motion") >= 0) {
          g_motionDetected = true;
          Serial.println("[LD1020] ★ Motion detected → flag SET");
        } else if (line.indexOf("OFF") >= 0) {
          g_motionDetected = false;
          Serial.println("[LD1020] ○ No motion → flag CLEAR");
        }
      }
      ld_pos = 0;
    } else {
      ld_buf[ld_pos++] = c;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// AHT30 Sensor Reader (I2C)
// ─────────────────────────────────────────────────────────────────────────
void readAHT30() {
  sensors_event_t humidity_evt, temp_evt;
  
  if (!aht.getEvent(&humidity_evt, &temp_evt)) {
    Serial.println("[AHT30] ✗ Read failed");
    return;
  }

  g_temperature = temp_evt.temperature;
  g_humidity    = humidity_evt.relative_humidity;
  g_tempReadCount++;

  Serial.printf("[AHT30] #%u  T=%.2f°C  H=%.1f%%  (heap: %u)\n",
                g_tempReadCount, g_temperature, g_humidity,
                esp_get_free_heap_size());
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP Handlers
// ─────────────────────────────────────────────────────────────────────────

// GET /data - JSON sensor readings
void handleData() {
  StaticJsonDocument<256> doc;
  doc["temperature"]   = g_temperature;
  doc["humidity"]      = g_humidity;
  doc["motionActive"]  = g_motionDetected;
  doc["captureCount"]  = g_captureCount;
  doc["readingCount"]  = g_tempReadCount;
  doc["uptime_s"]      = (millis() - g_bootTimeMs) / 1000;

  String out;
  serializeJson(doc, out);
  
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", out);
}

// GET /snapshot - JPEG image
void handleSnapshot() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  if (!g_jpegBuf || g_jpegLen == 0) {
    server.send(404, "text/plain", "No snapshot yet");
    return;
  }
  
  server.send_P(200, "image/jpeg", (const char*)g_jpegBuf, g_jpegLen);
}

// GET / - Redirect to index.html
void handleRoot() {
  server.sendHeader("Location", "/index.html");
  server.send(302);
}

// ─────────────────────────────────────────────────────────────────────────
// setup()
// ─────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n");
  Serial.println("╔════════════════════════════════════════════════════════╗");
  Serial.println("║     ESP32-CAM SENSOR HUB - COMPLETE REWRITE            ║");
  Serial.println("║     Firmware v1.0 · 2024                              ║");
  Serial.println("╚════════════════════════════════════════════════════════╝");
  
  g_bootTimeMs = millis();

  // ── SPIFFS Initialization ─────────────────────────────────────────────
  if (!SPIFFS.begin(true)) {
    Serial.println("[SPIFFS] ✗ Mount failed - formatting...");
  } else {
    Serial.println("[SPIFFS] ✓ Ready");
  }

  // ── I2C + AHT30 ───────────────────────────────────────────────────────
  Wire.begin(I2C_SDA, I2C_SCL);
  Serial.printf("[I2C] Initialized - SDA=GPIO%d, SCL=GPIO%d\n", I2C_SDA, I2C_SCL);
  
  if (!aht.begin()) {
    Serial.println("[AHT30] ✗ Sensor NOT found!");
    Serial.println("        Check wiring: SDA→GPIO14, SCL→GPIO15");
  } else {
    Serial.println("[AHT30] ✓ Sensor Ready");
  }

  // ── LD1020-P UART ──────────────────────────────────────────────────────
  LD1020_SERIAL.begin(LD1020_BAUD, SERIAL_8N1, LD1020_RX_PIN, LD1020_TX_PIN);
  Serial.printf("[LD1020] ✓ UART ready @ %d baud (RX=GPIO%d)\n", 
                LD1020_BAUD, LD1020_RX_PIN);

  // ── Camera ─────────────────────────────────────────────────────────────
  if (!initCamera()) {
    Serial.println("[CAM] ✗ FAILED to initialize!");
  }

  // ── WiFi Connection ────────────────────────────────────────────────────
  Serial.printf("[WiFi] Connecting to '%s'", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  uint32_t wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifiStart) < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] ✓ Connected: http://%s\n", 
                  WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] ✗ Connection failed!");
  }

  // ── HTTP Routes ────────────────────────────────────────────────────────
  server.on("/",         handleRoot);
  server.on("/data",     handleData);
  server.on("/snapshot", handleSnapshot);
  server.serveStatic("/", SPIFFS, "/");
  server.begin();
  
  Serial.println("[HTTP] ✓ Server started on port 80");

  // ── Boot Complete ──────────────────────────────────────────────────────
  Serial.println("\n╔════════════════════════════════════════════════════════╗");
  Serial.println("║            SYSTEM READY - AWAITING INPUT               ║");
  Serial.println("║  - Wave hand for motion detection                      ║");
  Serial.println("║  - Open dashboard: http://192.168.1.100/              ║");
  Serial.println("╚════════════════════════════════════════════════════════╝\n");
}

// ─────────────────────────────────────────────────────────────────────────
// loop()
// ─────────────────────────────────────────────────────────────────────────
void loop() {
  // Handle HTTP requests
  server.handleClient();

  // Poll LD1020-P for motion data
  pollLD1020();

  // Handle motion-triggered capture
  if (g_motionDetected) {
    g_motionDetected = false;

    uint32_t now = millis();
    if ((now - g_lastCaptureMs) >= CAPTURE_COOLDOWN_MS) {
      g_lastCaptureMs = now;
      Serial.println("[EVENT] ★★★ MOTION DETECTED → CAPTURING ★★★");
      capturePhoto();
    } else {
      uint32_t remaining = CAPTURE_COOLDOWN_MS - (now - g_lastCaptureMs);
      Serial.printf("[EVENT] Motion detected (cooldown in %ums, skipped)\n", remaining);
    }
  }

  // Periodic AHT30 reading
  static uint32_t lastTempMs = 0;
  if ((millis() - lastTempMs) >= TEMP_INTERVAL_MS) {
    lastTempMs = millis();
    readAHT30();
  }

  // Small delay to prevent WDT issues
  delay(10);
}