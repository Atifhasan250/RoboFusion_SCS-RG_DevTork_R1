# Five-Zone Wokwi Simulation

| Folder | Zone code |
|---|---|
| `zone-1-iot-lab` | `IOT_LAB` |
| `zone-2-robotics-lab` | `ROBOTICS_LAB` |
| `zone-3-server-room` | `SERVER_ROOM` |
| `zone-4-data-science-lab` | `DATA_SCIENCE_LAB` |
| `zone-5-software-lab` | `SOFTWARE_LAB` |

Each project contains an ESP32, flame switch, gas and water potentiometers, PIR, sensor-fault switch, green/yellow/red LEDs, buzzer and relay. GPIO 21 is only a development occupancy cross-check switch and is not claimed as ESP32-CAM Bonus 1.

## Pin map

| Component | GPIO |
|---|---:|
| Flame | 13 |
| Gas | 34 |
| Water | 35 |
| PIR | 12 |
| Occupancy cross-check | 21 |
| Sensor fault | 15 |
| Green / Yellow / Red LEDs | 25 / 26 / 27 |
| Buzzer | 14 |
| Relay | 32 |

## Run

Open each folder as a separate Wokwi project, retain `diagram.json`, install `ArduinoJson`, and start all five tabs. The current `BACKEND_URL` points to the Render deployment; change it only if the public origin changes.

Development keys are `${ZONE_CODE}-demo-key` and must match the hashes produced by `npm run db:seed` under the deployment's `ZONE_API_KEY_PEPPER`.

## Timing

- Sensor post: every 500 ms (2 Hz)
- Backend fire confirmation: two samples ≈ one second
- Command GET fallback: every five seconds; normal commands arrive in POST responses
- PIR entry: one second; exit: two seconds
- Gas warm-up: 30 seconds
- Backend liveness timeout: 20 seconds by default
- Cache: 120 samples ≈ 60 seconds
- Reconnect behavior: the newest live reading is sent first, followed by a maximum of three cached readings per live cycle

## Test controls

All three slide switches start in the right-hand position (`value: 1`), so flame, occupancy cross-check and sensor fault are inactive at boot. Move a switch left to assert the corresponding active-low input. This prevents the default Wokwi switch position from falsely booting every zone as `OFFLINE`.

- Flame switch: one brief toggle stays Safe; hold for about one second to confirm fire.
- Gas potentiometer: gradual movement produces proportional risk; first 30 seconds are warm-up.
- Water potentiometer: gradual movement produces proportional risk.
- PIR: entry/exit debounce avoids event spam.
- Sensor Fault: sends all required sensors as Offline; last known safety is preserved.

## Actuation

| State | LED | Buzzer | Relay |
|---|---|---|---|
| SAFE | Green | Off | Off |
| WARNING | Yellow | Off | Off |
| CRITICAL | Red | On | Cutoff on (relay simulation is configured active-high) |
| OFFLINE | Last safe command policy; dashboard shows Offline | Never treated as false recovery | Critical cutoff remains if already active |

Commands have an increasing `command_version`; a node ignores older or duplicate commands and acknowledges the applied command.

## Serial troubleshooting

- `401 INVALID_ZONE_KEY`: deployment pepper or seeded key does not match the sketch.
- `422 INVALID_READING`: inspect the response body for invalid field/range.
- HTTP timeout: verify Render is awake and URL is exact; after recovery the node posts the newest live sample first and then drains the bounded cache gradually.
- NTP delay: the sketch continues sending without `timestamp`; backend receipt time is used until synchronization.
