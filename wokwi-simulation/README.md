# Five-Zone Wokwi Hardware Simulation

This folder contains one independent ESP32 zone node for each official lab:

| Folder | Zone code |
|---|---|
| `zone-1-iot-lab` | `IOT_LAB` |
| `zone-2-robotics-lab` | `ROBOTICS_LAB` |
| `zone-3-server-room` | `SERVER_ROOM` |
| `zone-4-data-science-lab` | `DATA_SCIENCE_LAB` |
| `zone-5-software-lab` | `SOFTWARE_LAB` |

## Components per zone

- Flame switch
- Gas potentiometer
- Water-level potentiometer
- PIR motion sensor
- Occupancy cross-check development switch
- Sensor-fault switch
- Green, yellow and red LEDs
- Buzzer
- Relay module

The occupancy cross-check switch is not an ESP32-CAM implementation and is not claimed as the camera bonus.

## Pin mapping

| Component | GPIO |
|---|---:|
| Flame | 13 |
| Gas | 34 |
| Water | 35 |
| PIR | 12 |
| Occupancy cross-check switch | 21 |
| Sensor fault | 15 |
| Green LED | 25 |
| Yellow LED | 26 |
| Red LED | 27 |
| Buzzer | 14 |
| Relay | 32 |

## Running each zone

1. Create/open an ESP32 project in Wokwi.
2. Copy the zone folder's `sketch.ino` and `diagram.json`.
3. Add the `ArduinoJson` library listed in `libraries.txt`.
4. Change `BACKEND_URL` only when the deployment address differs.
5. Run all five projects in separate tabs.

The sketches connect to `Wokwi-GUEST` and use HTTPS. `client.setInsecure()` is limited to Wokwi/demo transport; production physical hardware should verify or pin the server certificate.

## Timing and behaviour

- Sensor sampling: 200 ms
- Command polling: 250 ms
- Wi-Fi reconnect attempt: every 5 seconds
- PIR entry debounce: about 1 second
- PIR exit debounce: about 2 seconds
- Fire confirmation: backend requires five samples, about 1 second
- Gas warm-up: first 30 seconds ignored by backend
- Offline cache: 180 readings, about 36 seconds at the configured sample interval

## Fault behaviour

Turning on `Sensor Fault` sends:

```json
{
  "sensorHealth": "OFFLINE",
  "sensorStatus": {
    "fire": "OFFLINE",
    "gas": "OFFLINE",
    "water": "OFFLINE",
    "pir": "OFFLINE"
  }
}
```

The backend preserves the last known state/risk/occupancy. It does not interpret disconnected sensors as empty or Safe.

## Actuator rules

| State | LED | Buzzer | Relay |
|---|---|---|---|
| SAFE | Green | Off | Off |
| WARNING | Yellow | Off | Off |
| CRITICAL | Red | On | Cutoff on |
| OFFLINE after prior SAFE | Off | Off | Off |
| OFFLINE after prior WARNING | Yellow | Off | Off |
| OFFLINE after prior CRITICAL | Red | On | Cutoff remains on |

Commands carry an increasing `command_version`. Each ESP32 applies a version only once and acknowledges the command back to the server.

## Development keys

The sketches currently use the seed-compatible demo keys. Replace them before any public/non-demo deployment.
