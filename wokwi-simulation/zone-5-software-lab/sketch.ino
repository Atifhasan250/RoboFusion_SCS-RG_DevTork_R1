#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// --- Configuration ---
// IMPORTANT: Replace this with your ngrok URL or real backend URL (no trailing slash)
const char* BACKEND_URL = "https://robofusion-scs-rg-devtork-r1.onrender.com"; 
const char* ZONE_CODE = "SOFTWARE_LAB";
const char* ZONE_API_KEY = "SOFTWARE_LAB-demo-key";

// WiFi settings for Wokwi
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// --- Pin Definitions ---
const int PIN_FIRE = 13;      // Slide Switch (Pullup)
const int PIN_GAS = 34;       // Potentiometer
const int PIN_WATER = 35;     // Potentiometer
const int PIN_MOTION = 12;    // PIR Sensor
const int PIN_CAMERA = 21;
const int PIN_FAULT = 15;     // Slide Switch (Sensor Disconnect Fault)    // Slide Switch (Bonus 1 Camera)

const int PIN_LED_SAFE = 25;  // Green LED
const int PIN_LED_WARN = 26;  // Yellow LED
const int PIN_LED_CRIT = 27;  // Red LED
const int PIN_BUZZER = 14;    // Buzzer
const int PIN_RELAY = 32;     // Relay (Power Cutoff)

// --- State & Timers ---
String bootId = "";
unsigned long sequence = 1;
unsigned long lastReadingTime = 0;
unsigned long lastCommandTime = 0;
const int READING_INTERVAL = 500;  // Send readings every 500ms
const int COMMAND_INTERVAL = 1000; // Poll commands every 1000ms

// --- Offline Queue ---
const int MAX_QUEUE = 120;

bool pirState = false;
unsigned long pirHighStart = 0;
String offlineQueue[MAX_QUEUE];
int queueHead = 0;
int queueTail = 0;
int queueCount = 0;

void enqueueReading(String payload) {
  if (queueCount < MAX_QUEUE) {
    offlineQueue[queueTail] = payload;
    queueTail = (queueTail + 1) % MAX_QUEUE;
    queueCount++;
  }
}

void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0));
  bootId = "boot-";
  for(int i=0; i<6; i++) {
    bootId += String(random(0, 16), HEX);
  }

  // Initialize Input Pins
  pinMode(PIN_FIRE, INPUT_PULLUP); // Switch connects to GND, so default is HIGH
  pinMode(PIN_GAS, INPUT);
  pinMode(PIN_WATER, INPUT);
  pinMode(PIN_MOTION, INPUT);
  pinMode(PIN_CAMERA, INPUT_PULLUP);
  pinMode(PIN_FAULT, INPUT_PULLUP);

  // Initialize Output Pins
  pinMode(PIN_LED_SAFE, OUTPUT);
  pinMode(PIN_LED_WARN, OUTPUT);
  pinMode(PIN_LED_CRIT, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_RELAY, OUTPUT);

  // Ensure actuators are off at boot
  digitalWrite(PIN_LED_SAFE, LOW);
  digitalWrite(PIN_LED_WARN, LOW);
  digitalWrite(PIN_LED_CRIT, LOW);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_RELAY, LOW);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  configTime(0, 0, "pool.ntp.org");
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Send Sensor Readings (Every 500ms)
  if (currentMillis - lastReadingTime >= READING_INTERVAL) {
    lastReadingTime = currentMillis;
    sendReadings();
  }

  // 2. Poll for Actuator Commands (Every 1000ms)
  if (currentMillis - lastCommandTime >= COMMAND_INTERVAL) {
    lastCommandTime = currentMillis;
    fetchCommands();
  }
}

bool sendPostRequest(String requestBody, bool isQueued) {
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/v1/readings/" + ZONE_CODE;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-zone-api-key", ZONE_API_KEY);

  bool success = false;
  int httpResponseCode = http.POST(requestBody);
  if (httpResponseCode > 0) {
    if (httpResponseCode == 200 || httpResponseCode == 201) success = true;
    if (httpResponseCode != 200 && httpResponseCode != 201) {
      Serial.print("API Error ");
      Serial.print(httpResponseCode);
      Serial.print(": ");
      Serial.println(http.getString());
    }
  } else {
    Serial.print("Error sending readings: ");
    Serial.println(http.errorToString(httpResponseCode));
  }
  http.end();
  return success;
}

void sendReadings() {
  int fireVal = (digitalRead(PIN_FIRE) == LOW) ? 1 : 0; 
  int gasVal = analogRead(PIN_GAS);
  int waterVal = map(analogRead(PIN_WATER), 0, 4095, 0, 100);
  int rawMotion = digitalRead(PIN_MOTION);
  if (rawMotion == HIGH) {
    if (pirHighStart == 0) pirHighStart = millis();
    if (millis() - pirHighStart >= 1000) pirState = true;
  } else {
    pirHighStart = 0;
    pirState = false;
  }
  bool cameraOcc = (digitalRead(PIN_CAMERA) == LOW);

  StaticJsonDocument<500> doc;
  doc["bootId"] = bootId;
  doc["sequence"] = sequence++;
  String ts = getTimestamp();
  if (ts != "") {
    doc["timestamp"] = ts;
  }
  doc["fire"] = (fireVal == 1);
  doc["gas"] = gasVal;
  doc["water"] = waterVal;
  doc["pir"] = pirState;
  doc["cameraOccupancy"] = cameraOcc;
  bool fault = (digitalRead(PIN_FAULT) == LOW);
  doc["sensorHealth"] = fault ? "FAULT" : "HEALTHY";
  doc["deviceUptimeSeconds"] = millis() / 1000;
  doc["sampleIntervalMs"] = READING_INTERVAL;

  String requestBody;
  serializeJson(doc, requestBody);

  if (WiFi.status() != WL_CONNECTED) {
    enqueueReading(requestBody);
    return;
  }

  while(queueCount > 0) {
    String queuedBody = offlineQueue[queueHead];
    if (sendPostRequest(queuedBody, true)) {
      queueHead = (queueHead + 1) % MAX_QUEUE;
      queueCount--;
    } else {
      break;
    }
  }

  if (!sendPostRequest(requestBody, false)) {
    enqueueReading(requestBody);
  }
}

void fetchCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/v1/commands/" + ZONE_CODE;
  http.begin(url);
  http.addHeader("x-zone-api-key", ZONE_API_KEY);

  int httpResponseCode = http.GET();
  if (httpResponseCode == 200) {
    String response = http.getString();
    StaticJsonDocument<500> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (!error) {
      applyActuators(doc["buzzer"], doc["led"], doc["relay_cutoff"]);
      
      // If we got a command, acknowledge it
      if (doc["command_id"] && !doc["command_id"].isNull()) {
        String cmdId = doc["command_id"];
        acknowledgeCommand(cmdId);
      }
    }
  }
  http.end();
}

void applyActuators(bool buzzer, const char* leds, bool relay) {
  // Update LEDs
  digitalWrite(PIN_LED_SAFE, LOW);
  digitalWrite(PIN_LED_WARN, LOW);
  digitalWrite(PIN_LED_CRIT, LOW);

  if (leds != nullptr) {
    String ledColor = String(leds);
    ledColor.toUpperCase();

    if (ledColor == "GREEN") digitalWrite(PIN_LED_SAFE, HIGH);
    else if (ledColor == "YELLOW") digitalWrite(PIN_LED_WARN, HIGH);
    else if (ledColor == "RED") digitalWrite(PIN_LED_CRIT, HIGH);
  }

  // Update Buzzer & Relay (PDF Section 06, TC5)
  digitalWrite(PIN_BUZZER, buzzer ? HIGH : LOW);
  digitalWrite(PIN_RELAY, relay ? HIGH : LOW);
}

void acknowledgeCommand(String commandId) {
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/v1/commands/" + ZONE_CODE;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-zone-api-key", ZONE_API_KEY);

  StaticJsonDocument<200> doc;
  doc["command_id"] = commandId;
  String requestBody;
  serializeJson(doc, requestBody);

  http.POST(requestBody);
  http.end();
}

String getTimestamp() {
  struct tm timeinfo;
  if(!getLocalTime(&timeinfo, 10)){
    return ""; 
  }
  char timeStringBuff[50];
  strftime(timeStringBuff, sizeof(timeStringBuff), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(timeStringBuff);
}
