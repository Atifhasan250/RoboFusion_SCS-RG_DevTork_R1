# Wokwi Hardware Simulation (Track B)

This directory contains the ESP32 simulation files for a Zone Node, implementing the requirements for Section A: Hardware & Sensing.

## Running the Simulation

The simulation is configured to connect to the backend deployed on Render.

### Step 1: Wokwi Setup
We have pre-configured 3 active zones for your simulation (`zone-1-iot-lab`, `zone-2-robotics-lab`, `zone-3-server-room`). For each zone:
1. Go to [wokwi.com](https://wokwi.com) and create a **New ESP32 Project**.
2. Open the corresponding zone folder in this directory (e.g., `zone-1-iot-lab`).
3. Copy the contents of **`sketch.ino`** into the Wokwi sketch editor.
4. Copy the contents of **`diagram.json`** into the Wokwi diagram editor to generate the circuit.
5. Open the `Library Manager` in Wokwi (or create `libraries.txt`) and add: `ArduinoJson`.
*(Repeat this process in 3 separate browser tabs for the 3 zones).*

### Step 2: Configuration
The `sketch.ino` in each folder already has the correct `ZONE_CODE` and `ZONE_API_KEY` configured for you! The backend endpoint is also predefined:
```cpp
const char* BACKEND_URL = "https://robofusion-scs-rg-devtork-r1.onrender.com"; 
```

### Step 3: Execution
Click the Play button in all 3 Wokwi tabs. 
- The 3 ESP32 nodes will connect to the `Wokwi-GUEST` WiFi.
- Sensor data from all 3 zones will be sampled and transmitted concurrently via POST request every 500ms.
- Actuator commands are polled via GET request every 1000ms.

## Sensor Operations
- **Fire/Flame:** Toggled via the Flame Sensor slide switch. Triggers debouncing logic on the backend.
- **Gas:** Adjusted via the Gas potentiometer. The backend enforces a 30-second warm-up period.
- **Camera Occupancy:** Toggled via the Camera Occ switch to provide cross-checking logic against the PIR sensor.
