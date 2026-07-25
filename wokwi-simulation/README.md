# Wokwi Hardware Simulation (Track B)

This directory contains the ESP32 simulation files for a Zone Node, implementing the requirements for Section A: Hardware & Sensing.

## Running the Simulation

The simulation is configured to connect to the backend deployed on Render.

### Step 1: Wokwi Setup
1. Go to [wokwi.com](https://wokwi.com) and create a **New ESP32 Project**.
2. Copy the contents of **`sketch.ino`** from this directory into the Wokwi sketch editor.
3. Copy the contents of **`diagram.json`** from this directory into the Wokwi diagram editor to generate the circuit.
4. Open the `Library Manager` in Wokwi (or create `libraries.txt`) and add: `ArduinoJson`.

### Step 2: Configuration
In `sketch.ino`, the backend endpoint is predefined:
```cpp
const char* BACKEND_URL = "https://robofusion-scs-rg-devtork-r1.onrender.com"; 
```

### Step 3: Execution
Click the Play button in Wokwi. 
- The ESP32 will connect to the `Wokwi-GUEST` WiFi.
- Sensor data is sampled and transmitted via POST request every 500ms.
- Actuator commands are polled via GET request every 1000ms.
- To simulate multiple zones concurrently, duplicate the Wokwi project across multiple browser tabs and modify the `ZONE_CODE` variable in each (e.g., `"SERVER_ROOM"`, `"ROBOTICS_LAB"`).

## Sensor Operations
- **Fire/Flame:** Toggled via the Flame Sensor slide switch. Triggers debouncing logic on the backend.
- **Gas:** Adjusted via the Gas potentiometer. The backend enforces a 30-second warm-up period.
- **Camera Occupancy:** Toggled via the Camera Occ switch to provide cross-checking logic against the PIR sensor.
