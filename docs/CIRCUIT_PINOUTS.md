# Circuit and Pinout Documentation

All five implemented Wokwi zones use the same reproducible circuit; only `ZONE_CODE` and its development API key differ. Each zone folder contains the actual visual `diagram.json` required to rebuild it.

| Signal/component | ESP32 pin | Direction | Wokwi representation |
|---|---:|---|---|
| Flame/fire | GPIO 13 | Input pull-up | Slide/toggle switch; active LOW |
| Gas | GPIO 34 | Analog input | Potentiometer 0–4095 |
| Water level | GPIO 35 | Analog input | Potentiometer mapped to 0–100 |
| PIR occupancy | GPIO 12 | Digital input | PIR motion sensor |
| Development occupancy cross-check | GPIO 21 | Input pull-up | Switch; not an ESP32-CAM claim |
| Sensor fault/disconnect | GPIO 15 | Input pull-up | Switch; active LOW |
| Green LED | GPIO 25 | Output | Safe indicator |
| Yellow LED | GPIO 26 | Output | Warning indicator |
| Red LED | GPIO 27 | Output | Critical indicator |
| Buzzer | GPIO 14 | Output | Critical audible response |
| Relay | GPIO 32 | Output | Simulated non-essential power cutoff |

Power: ESP32 simulation supply and common ground as represented in each `diagram.json`. For physical replication, use correct LED resistors, relay isolation/module supply and a common logic ground; do not power a real relay coil or high-current buzzer directly from an ESP32 GPIO.

Implemented zone diagrams:

- `wokwi-simulation/zone-1-iot-lab/diagram.json`
- `wokwi-simulation/zone-2-robotics-lab/diagram.json`
- `wokwi-simulation/zone-3-server-room/diagram.json`
- `wokwi-simulation/zone-4-data-science-lab/diagram.json`
- `wokwi-simulation/zone-5-software-lab/diagram.json`
