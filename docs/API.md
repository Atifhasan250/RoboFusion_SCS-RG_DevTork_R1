# SCS-RG API Reference

The API uses two authentication modes:

- **Zone node:** `x-zone-api-key`
- **Dashboard/admin client:** HttpOnly `scs_session` cookie; mutations also require `x-csrf-token`

All risk scores, states and priorities are backend-computed.

## Core endpoints

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| POST | `/api/v1/readings/:zoneCode` | Zone API key | Validate and ingest raw sensor data |
| GET | `/api/v1/commands/:zoneCode` | Zone API key | Fetch latest durable actuator command |
| POST | `/api/v1/commands/:zoneCode` | Zone API key | Idempotently acknowledge command application |
| POST | `/api/v1/auth/login` | Public | Create HttpOnly session and return CSRF token |
| POST | `/api/v1/auth/logout` | Session + CSRF | Destroy current session |
| GET | `/api/v1/auth/me` | Session | Return current user and role |
| GET | `/api/v1/zones` | Session | Return all configured zones |
| GET | `/api/v1/zones/status` | Session | Return all configured zone states and risk components |
| GET | `/api/v1/dashboard/snapshot` | Session | Reconnect-safe authoritative system snapshot |
| GET | `/api/v1/incidents` | Session | Filter incident history by status/date/zone/hazard |
| GET | `/api/v1/incidents/:incidentId/timeline` | Session | Return complete ordered incident events |
| POST | `/api/v1/incidents/:incidentId/acknowledge` | Staff/Admin + CSRF | First-write-wins acknowledgment |
| GET | `/api/v1/priority-queue` | Session | Return currently critical incidents in deterministic rank order |
| POST | `/api/v1/admin/override` | Admin + CSRF | Apply audited `SILENCE`, `RESET` or `TEST_ACTUATOR` |
| DELETE | `/api/v1/admin/override?zone=CODE` | Admin + CSRF | Clear active override and restore sensor-derived output |
| GET | `/api/v1/admin/raw-readings` | Admin | Query raw historical readings |
| GET | `/api/v1/admin/system-health` | Admin | System, zone, incident and override health |
| GET | `/api/v1/system/events` | Session | SSE fallback stream |
| GET | `/api/v1/system/health` | Public | Liveness check |
| GET | `/api/v1/system/ready` | Public | Atlas and ML model readiness |

## Raw reading request

```http
POST /api/v1/readings/IOT_LAB
x-zone-api-key: IOT_LAB-demo-key
Content-Type: application/json
```

```json
{
  "bootId": "boot-a8f3c1",
  "sequence": 1052,
  "timestamp": "2026-07-25T08:20:45.120Z",
  "fire": false,
  "gas": 2200,
  "water": 20,
  "pir": true,
  "cameraOccupancy": false,
  "sensorStatus": {
    "fire": "ONLINE",
    "gas": "ONLINE",
    "water": "ONLINE",
    "pir": "ONLINE"
  },
  "sensorHealth": "HEALTHY",
  "deviceUptimeSeconds": 120,
  "sampleIntervalMs": 200,
  "replayed": false,
  "replayBatchLast": false
}
```

Raw ranges:

| Field | Range/meaning |
|---|---|
| `fire` | Boolean raw flame signal |
| `gas` | ESP32 ADC `0–4095`; baseline `1200`, critical `3000` |
| `water` | Normalized node reading `0–100`; critical `80` |
| `pir` | Debounced boolean occupancy |
| `sensorHealth` | `HEALTHY`, `DEGRADED` or `OFFLINE` |

An impossible value such as `gas=4096` or `water=-1` receives `422 INVALID_READING` and is not stored.

## Successful ingestion response

```json
{
  "accepted": true,
  "duplicate": false,
  "reading_id": "uuid",
  "zone": {
    "safety_state": "WARNING",
    "connectivity_state": "ONLINE",
    "risk_score": 48.89,
    "state_version": 13
  },
  "command": {
    "command_id": "uuid",
    "command_version": 7,
    "led": "YELLOW",
    "buzzer": false,
    "relay_cutoff": false
  }
}
```

A retried `(zone, bootId, sequence)` returns `200`, `duplicate=true`, and does not create another reading, incident or command.

## Incident query examples

```text
GET /api/v1/incidents?status=all
GET /api/v1/incidents?status=RESOLVED&from=2026-07-24T00:00:00Z&to=2026-07-25T23:59:59Z
GET /api/v1/incidents?zoneCode=SERVER_ROOM&hazard=FLOOD
```

Supported status values: `active`, `all`, `resolved`, `OPEN`, `ACKNOWLEDGED`, `RESOLVED`.

## Priority queue response

Only zones whose current authoritative safety state is `CRITICAL` are returned. An incident may remain active during `WARNING`, but it is excluded until the zone becomes critical again.

```json
{
  "queue": [
    {
      "rank": 1,
      "incident_id": "uuid",
      "zone_code": "IOT_LAB",
      "zone_name": "IoT Lab",
      "risk_score": 100,
      "priority_score": 117,
      "occupancy": true,
      "critical_duration_seconds": 45,
      "primary_hazard": "GAS",
      "ranking_reason": "IoT Lab is ranked first because it has a critically high risk score of 100, active gas hazard, confirmed occupancy, sustained critical for 45s."
    }
  ]
}
```

Deterministic order: priority score → risk score → occupancy → earliest critical time → zone code.

## Manual override safety rules

- `SILENCE`: buzzer off; a critical relay cutoff remains on.
- `RESET`: rejected while sensor-derived state is `CRITICAL`; otherwise restores current sensor-derived output.
- `TEST_ACTUATOR`: temporary audited actuator test.
- Sensor-derived `SAFE/WARNING/CRITICAL` remains authoritative.

## Real-time events

WebSocket: `ws(s)://HOST/ws` with the session cookie. A full `SNAPSHOT` is sent on connection. SSE at `/api/v1/system/events` is the fallback.

Typical event types:

```text
SNAPSHOT
ZONE_READING_UPDATED
ZONE_STATE_CHANGED
ZONE_CONNECTIVITY_CHANGED
INCIDENT_CREATED
INCIDENT_ACKNOWLEDGED
INCIDENT_RESOLVED
PRIORITY_QUEUE_UPDATED
ACTUATOR_COMMAND_UPDATED
CACHED_READINGS_SYNCED
TREND_CRITICAL
```

See `openapi.yaml` for the machine-readable contract.
