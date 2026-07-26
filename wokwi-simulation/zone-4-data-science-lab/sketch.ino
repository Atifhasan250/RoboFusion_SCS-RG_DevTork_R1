#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// Replace only when the deployed backend URL changes. No trailing slash.
const char* BACKEND_URL = "https://robofusion-scs-rg-devtork-r1.onrender.com";
const char* ZONE_CODE = "DATA_SCIENCE_LAB";
const char* ZONE_API_KEY = "DATA_SCIENCE_LAB-demo-key";
const char* ssid = "Wokwi-GUEST";
const char* password = "";

const int PIN_FIRE = 13;
const int PIN_GAS = 34;
const int PIN_WATER = 35;
const int PIN_MOTION = 12;
const int PIN_CAMERA = 21; // Development occupancy cross-check switch; not an ESP32-CAM claim.
const int PIN_FAULT = 15;
const int PIN_LED_SAFE = 25;
const int PIN_LED_WARN = 26;
const int PIN_LED_CRIT = 27;
const int PIN_BUZZER = 14;
const int PIN_RELAY = 32;

String bootId;
unsigned long sequence = 1;
unsigned long lastReadingTime = 0;
unsigned long lastCommandTime = 0;
unsigned long lastReconnectAttempt = 0;
const unsigned long READING_INTERVAL = 1000;
const unsigned long COMMAND_INTERVAL = 3000;
const unsigned long RECONNECT_INTERVAL = 5000;
long lastAppliedCommandVersion = -1;

const int MAX_QUEUE = 180; // ~36 seconds at 200 ms sampling.
String offlineQueue[MAX_QUEUE];
int queueHead = 0;
int queueTail = 0;
int queueCount = 0;
bool pirState = false;
unsigned long pirHighStart = 0;
unsigned long pirLowStart = 0;

void enqueueReading(const String& payload) {
  if (queueCount == MAX_QUEUE) {
    // Drop the oldest sample rather than blocking current sensing forever.
    queueHead = (queueHead + 1) % MAX_QUEUE;
    queueCount--;
  }
  offlineQueue[queueTail] = payload;
  queueTail = (queueTail + 1) % MAX_QUEUE;
  queueCount++;
}

void beginSecure(HTTPClient& http, WiFiClientSecure& client, const String& url) {
  client.setInsecure(); // Wokwi/demo transport. Production hardware should pin/verify the server CA.
  http.begin(client, url);
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
}

void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastReconnectAttempt < RECONNECT_INTERVAL) return;
  lastReconnectAttempt = millis();
  WiFi.disconnect();
  WiFi.begin(ssid, password);
}

void applyActuators(bool buzzer, const char* leds, bool relay) {
  digitalWrite(PIN_LED_SAFE, LOW);
  digitalWrite(PIN_LED_WARN, LOW);
  digitalWrite(PIN_LED_CRIT, LOW);
  if (leds != nullptr) {
    String color = String(leds);
    color.toUpperCase();
    if (color == "GREEN") digitalWrite(PIN_LED_SAFE, HIGH);
    else if (color == "YELLOW") digitalWrite(PIN_LED_WARN, HIGH);
    else if (color == "RED") digitalWrite(PIN_LED_CRIT, HIGH);
  }
  digitalWrite(PIN_BUZZER, buzzer ? HIGH : LOW);
  digitalWrite(PIN_RELAY, relay ? HIGH : LOW);
}

void acknowledgeCommand(const String& commandId) {
  if (WiFi.status() != WL_CONNECTED || commandId.length() == 0) return;
  HTTPClient http;
  WiFiClientSecure client;
  beginSecure(http, client, String(BACKEND_URL) + "/api/v1/commands/" + ZONE_CODE);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-zone-api-key", ZONE_API_KEY);
  StaticJsonDocument<128> body;
  body["command_id"] = commandId;
  String payload;
  serializeJson(body, payload);
  http.POST(payload);
  http.end();
}

void processCommand(JsonVariantConst command) {
  if (command.isNull()) return;
  long version = command["command_version"] | -1;
  if (version < 0) version = command["state_version"] | -1;
  if (version <= lastAppliedCommandVersion) return;
  const char* led = command["led"] | "OFF";
  bool buzzer = command["buzzer"] | false;
  bool relay = command["relay_cutoff"] | false;
  applyActuators(buzzer, led, relay);
  lastAppliedCommandVersion = version;
  if (!command["command_id"].isNull()) acknowledgeCommand(command["command_id"].as<String>());
}

bool sendPostRequest(const String& requestBody, bool isQueued) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  WiFiClientSecure client;
  beginSecure(http, client, String(BACKEND_URL) + "/api/v1/readings/" + ZONE_CODE);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-zone-api-key", ZONE_API_KEY);
  int code = http.POST(requestBody);
  bool success = code == 200 || code == 201;
  if (success && !isQueued) {
    StaticJsonDocument<768> response;
    if (deserializeJson(response, http.getString()) == DeserializationError::Ok
        && response.containsKey("command")
        && !response["command"].isNull()) {
      processCommand(response["command"].as<JsonVariantConst>());
    }
  } else if (!success && code > 0) {
    Serial.printf("Reading API error %d: %s\n", code, http.getString().c_str());
  }
  http.end();
  return success;
}

String replayPayload(const String& original, bool lastInBatch) {
  StaticJsonDocument<768> doc;
  if (deserializeJson(doc, original) != DeserializationError::Ok) return original;
  doc["replayed"] = true;
  doc["replayBatchLast"] = lastInBatch;
  String output;
  serializeJson(doc, output);
  return output;
}

String getTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 100)) return "";
  char value[32];
  strftime(value, sizeof(value), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(value);
}

void sendReadings() {
  String timestamp = getTimestamp();
  if (timestamp.length() == 0) return;

  int rawMotion = digitalRead(PIN_MOTION);
  if (rawMotion == HIGH) {
    if (pirHighStart == 0) pirHighStart = millis();
    if (millis() - pirHighStart >= 1000) pirState = true;
    pirLowStart = 0;
  } else {
    if (pirLowStart == 0) pirLowStart = millis();
    if (millis() - pirLowStart >= 2000) pirState = false;
    pirHighStart = 0;
  }

  bool fault = digitalRead(PIN_FAULT) == LOW;
  StaticJsonDocument<768> doc;
  doc["bootId"] = bootId;
  doc["sequence"] = sequence++;
  doc["timestamp"] = timestamp;
  doc["fire"] = digitalRead(PIN_FIRE) == LOW;
  doc["gas"] = analogRead(PIN_GAS);
  doc["water"] = map(analogRead(PIN_WATER), 0, 4095, 0, 100);
  doc["pir"] = pirState;
  doc["cameraOccupancy"] = digitalRead(PIN_CAMERA) == LOW;
  doc["sensorHealth"] = fault ? "OFFLINE" : "HEALTHY";
  JsonObject statuses = doc.createNestedObject("sensorStatus");
  statuses["fire"] = fault ? "OFFLINE" : "ONLINE";
  statuses["gas"] = fault ? "OFFLINE" : (millis() < 30000 ? "WARMING_UP" : "ONLINE");
  statuses["water"] = fault ? "OFFLINE" : "ONLINE";
  statuses["pir"] = fault ? "OFFLINE" : "ONLINE";
  doc["deviceUptimeSeconds"] = millis() / 1000.0;
  doc["sampleIntervalMs"] = READING_INTERVAL;
  doc["replayed"] = false;
  doc["replayBatchLast"] = false;

  String payload;
  serializeJson(doc, payload);
  if (WiFi.status() != WL_CONNECTED) {
    enqueueReading(payload);
    return;
  }

  while (queueCount > 0) {
    String queued = replayPayload(offlineQueue[queueHead], queueCount == 1);
    if (!sendPostRequest(queued, true)) break;
    queueHead = (queueHead + 1) % MAX_QUEUE;
    queueCount--;
  }
  if (!sendPostRequest(payload, false)) enqueueReading(payload);
}

void fetchCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  WiFiClientSecure client;
  beginSecure(http, client, String(BACKEND_URL) + "/api/v1/commands/" + ZONE_CODE);
  http.addHeader("x-zone-api-key", ZONE_API_KEY);
  int code = http.GET();
  if (code == 200) {
    StaticJsonDocument<512> response;
    if (deserializeJson(response, http.getString()) == DeserializationError::Ok) {
      processCommand(response.as<JsonVariantConst>());
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0));
  bootId = "boot-";
  for (int i = 0; i < 8; i++) bootId += String(random(0, 16), HEX);

  pinMode(PIN_FIRE, INPUT_PULLUP);
  pinMode(PIN_GAS, INPUT);
  pinMode(PIN_WATER, INPUT);
  pinMode(PIN_MOTION, INPUT);
  pinMode(PIN_CAMERA, INPUT_PULLUP);
  pinMode(PIN_FAULT, INPUT_PULLUP);
  pinMode(PIN_LED_SAFE, OUTPUT);
  pinMode(PIN_LED_WARN, OUTPUT);
  pinMode(PIN_LED_CRIT, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_RELAY, OUTPUT);
  applyActuators(false, "GREEN", false);

  WiFi.begin(ssid, password);
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 15000) delay(250);
  if (WiFi.status() == WL_CONNECTED) Serial.println("WiFi connected");
  else Serial.println("WiFi unavailable; sampling will start after reconnection and time sync");
  configTime(0, 0, "pool.ntp.org");
}

void loop() {
  ensureWiFiConnected();
  unsigned long now = millis();
  if (now - lastReadingTime >= READING_INTERVAL) {
    lastReadingTime = now;
    sendReadings();
  }
  if (now - lastCommandTime >= COMMAND_INTERVAL) {
    lastCommandTime = now;
    fetchCommands();
  }
  delay(5);
}
