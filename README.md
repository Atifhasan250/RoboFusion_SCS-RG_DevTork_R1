# RoboFusion SCS-RG — Multi-Hazard Smart Campus Safety & Response Grid

**Team:** DevTork  
**Track:** Track B — five independent Wokwi ESP32 zone simulations  
**Deployment target:** Render + MongoDB Atlas

This repository contains the complete engineering prototype: frontend command dashboard, backend/API/WebSocket server, database schema and tooling, five Wokwi zone nodes, deterministic risk fusion, incident priority ranking, RBAC, resilience tests, short-term trend detection, trained ML prediction and validated natural-language incident reporting. The only remaining submission artifacts are the final documentation PDF and the narrated demonstration video.

## Official zones

`IOT_LAB`, `ROBOTICS_LAB`, `SERVER_ROOM`, `DATA_SCIENCE_LAB`, `SOFTWARE_LAB`.

Every zone reports raw fire, gas, water and PIR data. The backend is the sole authority for risk, `SAFE/WARNING/CRITICAL`, incidents, priority and actuator commands.

## Implemented rubric-critical behavior

- 500 ms sampling with approximately one-second sustained-fire confirmation (two consecutive samples).
- Thirty-second gas warm-up suppression; graded gas/water contributions.
- PIR entry/exit flicker control and explicit per-sensor `OFFLINE` state.
- Server-side validation, raw-value rejection, per-zone API-key authentication and retry deduplication.
- Durable MongoDB transactions, first-write-wins acknowledgment and deterministic command versions.
- Separate safety and connectivity state: a disconnected node never becomes a false `SAFE` or empty zone.
- Real priority queue from risk, occupancy, critical duration and bounded validated NLP evidence, including a visible ranking reason.
- Live WebSocket dashboard with reconnect-safe snapshot and two-second REST fallback.
- Searchable/date-filtered incident history and durable trigger → acknowledge → recovery timeline.
- Backend-enforced Admin/Security Staff RBAC and CSRF-protected mutations.
- Audited manual overrides; a Critical relay cannot be disabled by `SILENCE` or `RESET`.
- Backend restart recovery, bounded Wokwi offline cache/replay, late-reading protection and 20-second liveness threshold.
- Bonus 2 trend indicator, Bonus 3 trained logistic-regression prediction (advisory only), Bonus 4 NLP-to-structured report with deterministic validation gate.

## Quick start

Requirements: Node.js 20+, npm 10+, MongoDB Atlas replica-set deployment.

```bash
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run db:seed:verify
npm run dev
```

Open `http://localhost:3000`.

Demo accounts (password is the `DEMO_PASSWORD` environment value; template default `scs-grid`):

```text
admin@scs.local   — ADMIN
staff@scs.local   — SECURITY_STAFF
```

## Required environment

```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB=robofusion
SESSION_SECRET=<at least 32 random characters>
ZONE_API_KEY_PEPPER=<at least 16 random characters>
APP_ORIGIN=http://localhost:3000
APP_ENV=development
DEMO_PASSWORD=scs-grid
OFFLINE_AFTER_MS=20000
```

The five firmware development keys are `${ZONE_CODE}-demo-key`. `npm run db:seed` hashes them with `ZONE_API_KEY_PEPPER`; therefore a changed pepper must be followed by another seed. The production `start` script runs idempotent migration and seed automatically before the server starts.

## Render deployment

1. Push this repository to GitHub.
2. Create a Render Web Service or use `render.yaml`.
3. Set `MONGODB_URI`, `SESSION_SECRET`, `ZONE_API_KEY_PEPPER`, `APP_ORIGIN` and optional AI provider keys.
4. Set `APP_ORIGIN` to the exact public HTTPS origin.
5. Deploy. Start command: `npm start`.
6. Confirm `/api/v1/system/ready`, then sign in and run the five Wokwi projects.

Do not change `ZONE_API_KEY_PEPPER` after seeding unless the service is restarted so the automatic seed can regenerate matching hashes.

## Wokwi

Open all five projects under `wokwi-simulation/` in separate Wokwi tabs. The sketches use the deployed backend URL, send at 2 Hz, receive commands in the ingestion response and poll commands only every five seconds as a fallback. This avoids the former TLS/request burst that could make zones appear `UNAVAILABLE`. On reconnect, each node posts its newest live sample before gradually replaying cached history, so the dashboard can recover its online state immediately.

Serial Monitor diagnosis:

| Output | Meaning |
|---|---|
| `201`/no error | Reading accepted |
| `401 INVALID_ZONE_KEY` | Pepper/seed/firmware key mismatch |
| `422 INVALID_READING` | Invalid payload or impossible value |
| timeout/negative HTTP result | Render/TLS/network issue |
| `Clock not synchronized...` | Telemetry still sends; backend receipt time is used until NTP is ready |

## Verification

```bash
npm run verify:all
```

Database/integration verification uses a separate `.env.test` whose database name ends in `_test`:

```bash
npm run verify:backend
```

Additional evidence commands:

```bash
npm run ml:train
npm run db:seed:readings
npm run db:indexes:explain
npm run db:backup
npm run test:load
```

## Submission support documents

- [PDF/rubric alignment checklist](docs/PDF_ALIGNMENT_CHECKLIST.md)
- [Seven-minute video runbook](docs/VIDEO_DEMO_SCRIPT.md)
- [Circuit and pinout documentation](docs/CIRCUIT_PINOUTS.md)
- [Architecture and risk rules](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Database schema and retention](docs/DATABASE.md)
- [Wokwi operation](wokwi-simulation/README.md)
- [Applied fixes](FIXES_APPLIED.md)
- [Verification report](VERIFICATION_REPORT.md)
- [Deployment checklist](docs/DEPLOYMENT_CHECKLIST.md)
- [Machine-readable OpenAPI](openapi.yaml)

## Scope statement

This repository does **not** claim the physical ESP32-CAM camera bonus. The optional GPIO 21 switch is clearly labelled as a development occupancy cross-check. All core engineering requirements are implemented; the team must still create the final submission PDF and record the live video evidence.
