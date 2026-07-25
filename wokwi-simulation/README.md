# Wokwi Hardware Simulation (100% Accuracy)

This folder contains the complete simulation for a Zone Node (ESP32) that perfectly matches the PDF's Hardware and Sensing requirements (Section A).

## How to use this online

Since Wokwi runs in the cloud and your backend is on your PC (`localhost:3000`), you need a bridge to connect them. **ngrok** is the easiest way.

### Step 1: Start your backend and ngrok
1. Make sure your Next.js backend is running: `npm run dev`
2. Open a new terminal and run ngrok: `ngrok http 3000`
3. Ngrok will give you a public URL (e.g., `https://1234-abcd.ngrok-free.app`).

### Step 2: Create the Wokwi Project
1. Go to [wokwi.com](https://wokwi.com) and create a **New ESP32 Project**.
2. Open the **`sketch.ino`** file from this folder, copy all the code, and paste it into the `sketch.ino` tab on Wokwi.
3. Open the **`diagram.json`** file from this folder, copy all the code, and paste it into the `diagram.json` tab on Wokwi.
4. Click on the `Library Manager` tab in Wokwi (the plus icon next to files) or create a `libraries.txt` file and add: `ArduinoJson`.

### Step 3: Link the URL
In your Wokwi `sketch.ino`, find this line at the top:
```cpp
const char* BACKEND_URL = "https://YOUR_NGROK_URL.ngrok-free.app"; 
```
Replace it with your actual Ngrok URL. Make sure there is **no trailing slash (`/`)** at the end of the URL.

### Step 4: Run it!
Click the Green Play button in Wokwi. 
- You will see the ESP32 connect to WiFi.
- It will start sending sensor data every 500ms.
- To simulate the 5 zones, you can duplicate this Wokwi project in a new tab, and simply change the `ZONE_CODE` variable at the top of the code (e.g., `"SERVER_ROOM"`, `"ROBOTICS_LAB"`).

## Testing the Sensors (PDF Requirements)
- **Fire/Flame:** Flip the "Flame Sensor" switch. The backend requires 2 consecutive readings (1 second) to trigger (Debounce).
- **Gas:** Slide the Gas potentiometer past the middle. Note: The backend ignores gas for the first 30 seconds of uptime (Warm-up).
- **Camera (Bonus 1):** Flip the Camera Occ switch. This tells the backend the camera sees someone, cross-checking the PIR sensor.
