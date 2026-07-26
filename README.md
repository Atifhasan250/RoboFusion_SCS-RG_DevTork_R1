# Multi-Hazard Smart Campus Safety & Response Grid (SCS-RG)

**Team:** DevTork  
**Track:** Track B — Wokwi simulation  
**Implemented scope in this archive:** five-zone sensing firmware, backend/API, MongoDB Atlas schema, incident/ranking logic, database tooling, resilience and integration tests.

> The frontend dashboard, final submission PDF and demonstration video are intentionally outside this archive's requested fix scope.

## Official five zones

1. `IOT_LAB` — IoT Lab
2. `ROBOTICS_LAB` — Robotics Lab
3. `SERVER_ROOM` — Server Room
4. `DATA_SCIENCE_LAB` — Data Science Lab
5. `SOFTWARE_LAB` — Software Lab

Each zone sends raw fire, gas, water-level and PIR data. The backend—not the ESP32 node—calculates risk, state, incident lifecycle and priority. Each Wokwi node has independent green/yellow/red LEDs, buzzer and relay actuation.

## Important implemented behaviour

- Five official zones and 20 required sensor records are seeded.
- Raw readings are strictly validated and authenticated with per-zone API keys.
- Gas is suppressed during the first 30 seconds of device warm-up.
- Fire requires five consecutive positive samples; a short flicker does not trigger.
- Sensor disconnection produces `OFFLINE` and preserves the last known risk/state/occupancy instead of reporting a false `SAFE` or empty zone.
- Readings are deduplicated by `(zoneId, bootId, sequence)`.
- Late/replayed readings are stored without overwriting authoritative current state.
- Incidents remain active while a zone recovers through `WARNING`; they resolve only after confirmed `SAFE`.
- Acknowledgment is transactional and first-write-wins.
- Sensor/override command races use an atomic per-zone command version.
- A `SILENCE` override can mute a buzzer but cannot disable a critical relay cutoff.
- State is durable in MongoDB Atlas and is reconstructed after backend restart.
- WebSocket and SSE infrastructure are present for the future frontend.
- Trend, ML prediction and NLP reporting are advisory only and cannot actuate hardware.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A MongoDB Atlas deployment with network access enabled
- MongoDB Database Tools for `mongodump`/`mongorestore` when testing backup and recovery
- k6 only when running the optional load test

## Environment

Copy the template and put the real Atlas URI only in `.env`:

```bash
cp .env.example .env
```

Required values:

```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB=robofusion
SESSION_SECRET=<random string, at least 32 characters>
ZONE_API_KEY_PEPPER=<random string, at least 16 characters>
APP_ORIGIN=http://localhost:3000
APP_ENV=development
DEMO_PASSWORD=<demo login password>
```

`.env` is ignored by Git. Do not commit the Atlas URI or provider API keys.

For destructive integration tests, create a separate file:

```bash
cp .env.test.example .env.test
```

`MONGODB_DB` in `.env.test` **must end with `_test`**. Test scripts stop immediately otherwise.

## Install and initialize

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run db:seed:verify
npm run db:transactions:verify
```

After `.env.test` is configured, the full non-frontend verification entry point is:

```bash
npm run verify:backend
```

Expected seed verification:

```text
5 configured official zones
20 required sensor records (FIRE, GAS, WATER, PIR per zone)
```

Start the custom Next.js/API/WebSocket server:

```bash
npm run dev
```

Default address: `http://localhost:3000`.

## Wokwi zone nodes

Open the five projects under `wokwi-simulation/`. Each sketch contains the matching development key:

```text
IOT_LAB-demo-key
ROBOTICS_LAB-demo-key
SERVER_ROOM-demo-key
DATA_SCIENCE_LAB-demo-key
SOFTWARE_LAB-demo-key
```

The seed script hashes the same values with `ZONE_API_KEY_PEPPER`. Before a public deployment, replace these development keys in both the seed configuration and firmware.

The camera-labelled switch is only a development occupancy cross-check input. It is **not** presented as an ESP32-CAM implementation or claimed as Camera Bonus 1.

## Verification commands

```bash
# Static project checks
npm run lint
npm run typecheck
npm run test:unit
npm run build

# Atlas schema/data checks
npm run db:indexes:verify
npm run db:integrity:check
npm run db:seed:verify
npm run db:transactions:verify

# Destructive tests use .env.test only
npm run test:integration
npm run test:concurrency
npm run test:ack-race
npm run test:tc22
npm run test:edge-load

# Or run the complete destructive backend/database suite
npm run test:db-suite

# Query-performance evidence
npm run db:seed:readings
npm run db:indexes:explain

# Optional 30-zone load test; requires k6 and a running server
npm run db:seed:phantoms
npm run test:load
```

## Backup and safe restore test

Create a backup of the configured Atlas database:

```bash
npm run db:backup
```

Restore is deliberately blocked for the main database. Use a separate target whose name ends in `_test`:

```bash
RESTORE_TARGET_DB=robofusion_restore_test npm run db:restore -- backups/<archive>.archive.gz
```

Then point a test environment at the restored database and run:

```bash
npm run db:integrity:check
npm run db:seed:verify
```

## Technical documentation

- [API reference](docs/API.md)
- [Architecture and risk/priority rules](docs/ARCHITECTURE.md)
- [Database schema, integrity and retention](docs/DATABASE.md)
- [Wokwi five-zone setup](wokwi-simulation/README.md)
- [Detailed code changes](FIXES_APPLIED.md)
- [OpenAPI specification](openapi.yaml)

## Current scope boundary

This archive does not claim completion of:

- Frontend Command Dashboard test cases
- Final submission documentation PDF
- Seven-minute demonstration video
- Actual ESP32-CAM image/frame processing

Those omissions are explicit rather than hidden. Backend, database and five-zone Wokwi work can be integrated with the frontend later without changing the API contract.
