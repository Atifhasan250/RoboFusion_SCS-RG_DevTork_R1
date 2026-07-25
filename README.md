# Multi-Hazard Smart Campus Safety & Response Grid (SCS-RG)

Track B · Wokwi-ready full-stack backend · RoboFusion Hackathon Round 1

## What this system does

5 campus zones (IoT Lab, Robotics Lab, Server Room, Data Science Lab, Software Lab) send fire/gas/water/PIR readings every 500 ms. The server calculates risk, enforces state transitions, manages incident lifecycle, commands actuators (LED/buzzer/relay), and broadcasts real-time dashboard updates.

## Quick start

```bash
cp .env.example .env.local
docker compose up -d             # MongoDB replica set
npm run db:migrate               # Create all 15 collections + indexes + validators
npm run db:seed                  # Seed zones and demo users
npm run db:seed:readings         # Seed 10,000+ historical readings
npm run db:seed:phantoms         # Seed 30 phantom zones for load test
npm run ml:train                 # Train logistic-regression risk model
npm run dev                      # Start server on :3000
```

## Risk formula (PDF Section 14)

```
risk_score = min(100,
  70 × fire_factor       ← 0 or 1 (requires fire debounce: 2 consecutive samples)
  + 70 × gas_factor      ← 0.0–1.0 (ADC normalized; zeroed during first 30 s uptime)
  + 70 × water_factor    ← 0.0–1.0 (ADC normalized)
  + 10 × occupancy_factor ← 0 or 1 (PIR or camera cross-check)
)
```

**SAFE** < 30 · **WARNING** 30–64 · **CRITICAL** ≥ 65

## State hysteresis (PDF Section 15)

| Transition | Condition |
|---|---|
| SAFE → WARNING | risk ≥ 30 AND 2 consecutive readings |
| WARNING → CRITICAL | risk ≥ 65 AND 2 consecutive readings |
| Any → CRITICAL (immediate) | Fire debounce just completed |
| CRITICAL → WARNING | risk < 55 AND 5 s stable |
| WARNING → SAFE | risk < 25 AND 5 s stable |

## Priority queue (PDF Section 18)

```
priority_score = risk_score + occupancy_bonus(10) + duration_bonus(min 10, seconds/30)
```

Tie-breaking: priority_score → risk_score → occupied → critical_since → zone_code.
Each queue entry includes a human-readable `ranking_reason`.

## Commands

```bash
npm run typecheck               # TypeScript check
npm run lint                    # ESLint
npm run test:unit               # Vitest unit tests (risk engine, hysteresis, priority)
npm run test:integration        # Acknowledge race-condition test (needs running server)
npm run test:concurrency        # 10 simultaneous writes test (needs running server)
npm run db:indexes:verify       # Verify all required indexes exist
npm run db:indexes:explain      # Generate explain("executionStats") evidence (PDF TC 26)
npm run db:integrity:check      # Verify zero orphan documents across all collections
```

Load test (30-zone scenario):
```bash
npm run db:seed:phantoms
k6 run tests/load/ingestion.js
```

## Authentication

| Account | Role | Password |
|---|---|---|
| admin@scs.local | ADMIN | `$DEMO_PASSWORD` (default: `ChangeMe123!`) |
| staff@scs.local | SECURITY_STAFF | `$DEMO_PASSWORD` |

Zone API keys: `${ZONE_CODE}-demo-key` (e.g. `IOT_LAB-demo-key`). Rotate before any public deployment.

Login is rate-limited: 5 attempts per IP per 15 minutes.

## Demo accounts and Wokwi integration

Active zones accept readings on `POST /api/v1/readings/:zoneCode` with the `x-zone-api-key` header.
Wokwi origin is whitelisted via `WOKWI_ALLOWED_ORIGINS` in `.env.local`.
Zone nodes poll `GET /api/v1/commands/:zoneCode` for their actuator command and POST acknowledge when applied.

## WebSocket

Connect to `ws(s)://HOST/ws` with a valid session cookie.
All events share this envelope:
```json
{
  "event_id": "uuid",
  "event_type": "ZONE_STATE_CHANGED",
  "occurred_at": "2026-07-25T08:20:45Z",
  "data": {},
  "version": 42
}
```

Event types: `SNAPSHOT`, `ZONE_READING_UPDATED`, `ZONE_STATE_CHANGED`, `ZONE_CONNECTIVITY_CHANGED`,
`INCIDENT_CREATED`, `INCIDENT_ACKNOWLEDGED`, `INCIDENT_RESOLVED`, `PRIORITY_QUEUE_UPDATED`,
`ACTUATOR_COMMAND_UPDATED`, `SYSTEM_HEALTH_UPDATED`, `TREND_UPDATED`, `PREDICTION_UPDATED`, `NOTIFICATION_CREATED`

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layers, risk formula, hysteresis, design decisions
- [API](docs/API.md) — endpoint summary
- [Database](docs/DATABASE.md) — all 15 collections, indexes, retention policy
- [OpenAPI spec](openapi.yaml) — full schema for all endpoints

## Data retention

| Data | Retention |
|---|---|
| Raw readings | 90 days (TTL index) |
| Incidents & audit logs | ≥ 1 year (no TTL) |
| Predictions | 90 days (TTL index) |
| Sessions | 8 hours (TTL index) |

## Backup

```bash
# Backup
mongodump --uri="$MONGODB_URI" --db="$MONGODB_DB" --archive="backup_$(date +%Y-%m-%d).archive.gz" --gzip

# Restore (then verify)
mongorestore --uri="$MONGODB_URI" --archive="backup_YYYY-MM-DD.archive.gz" --gzip --drop
npm run db:integrity:check
```

Scripts: `scripts/backup-mongodb.ps1` / `scripts/restore-mongodb.ps1`

## Bonus features

| Bonus | Status | Notes |
|---|---|---|
| Camera Occupancy (Bonus 1) | ✅ | `cameraOccupancy` field; combined in occupancy factor |
| Risk Trend (Bonus 2) | ✅ | `GET /api/v1/trends/:zone` — linear regression on last 8 readings |
| ML Prediction (Bonus 3) | ✅ | `GET /api/v1/predictions/:zone` — logistic regression, advisory only |
| NLP Report (Bonus 4) | ✅ | `POST /api/v1/reports/note` — Gemini → OpenRouter → deterministic fallback |

**Critical safety rule:** ML predictions and NLP reports are advisory only. They cannot trigger actuators, change zone state, or override sensor-driven risk scores.
