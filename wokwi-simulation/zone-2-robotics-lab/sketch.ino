#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- Configuration ---
// IMPORTANT: Replace this with your ngrok URL or real backend URL (no trailing slash)
const char* BACKEND_URL = "https://robofusion-scs-rg-devtork-r1.onrender.com"; 
const char* ZONE_CODE = "ROBOTICS_LAB";
const char* ZONE_API_KEY = "ROBOTICS_LAB-demo-key";

// WiFi settings for Wokwi
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// --- Pin Definitions ---
const int PIN_FIRE = 13;      // Slide Switch (Pullup)
const int PIN_GAS = 34;       // Potentiometer
const int PIN_WATER = 35;     // Potentiometer
const int PIN_MOTION = 12;    // PIR Sensor
const int PIN_CAMERA = 21;    // Slide Switch (Bonus 1 Camera)

const int PIN_LED_SAFE = 25;  // Green LED
const int PIN_LED_WARN = 26;  // Yellow LED
const int PIN_LED_CRIT = 27;  // Red LED
const int PIN_BUZZER = 14;    // Buzzer
const int PIN_RELAY = 32;     // Relay (Power Cutoff)

// --- Timers ---
unsigned long lastReadingTime = 0;
unsigned long lastCommandTime = 0;
const int READING_INTERVAL = 500;  // Send readings every 500ms
const int COMMAND_INTERVAL = 1000; // Poll commands every 1000ms

void setup() {
  Serial.begin(115200);

  // Initialize Input Pins
  pinMode(PIN_FIRE, INPUT_PULLUP); // Switch connects to GND, so default is HIGH
  pinMode(PIN_GAS, INPUT);
  pinMode(PIN_WATER, INPUT);
  pinMode(PIN_MOTION, INPUT);
  pinMode(PIN_CAMERA, INPUT_PULLUP);

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

void sendReadings() {
  if (WiFi.status() != WL_CONNECTED) return;

  // Read sensors
  // Note: Slide switch with pullup is LOW when closed, HIGH when open.
  // Assuming closed (LOW) = 1 (Fire). Adjust if your physical switch is different.
  int fireVal = (digitalRead(PIN_FIRE) == LOW) ? 1 : 0; 
  int gasVal = analogRead(PIN_GAS);
  int waterVal = analogRead(PIN_WATER);
  int motionVal = digitalRead(PIN_MOTION);
  bool cameraOcc = (digitalRead(PIN_CAMERA) == LOW);

  // Create JSON payload
  StaticJsonDocument<200> doc;
  doc["fire"] = fireVal;
  doc["gas"] = gasVal;
  doc["water"] = waterVal;
  doc["motion"] = motionVal;
  doc["cameraOccupancy"] = cameraOcc; // Bonus 1 Support

  String requestBody;
  serializeJson(doc, requestBody);

  // Send POST Request
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/v1/readings/" + ZONE_CODE;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-zone-api-key", ZONE_API_KEY);

  int httpResponseCode = http.POST(requestBody);
  if (httpResponseCode > 0) {
    // Serial.print("Readings POST: ");
    // Serial.println(httpResponseCode); // Commented out to reduce serial spam
  } else {
    Serial.print("Error sending readings: ");
    Serial.println(http.errorToString(httpResponseCode));
  }
  http.end();
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
  doc["commandId"] = commandId;
  String requestBody;
  serializeJson(doc, requestBody);

  http.POST(requestBody);
  http.end();
}
