# Final Deployment Checklist

## 1. Local source gate

```bash
npm ci
npm run verify:all
```

For database/concurrency verification, configure `.env.test` with a disposable MongoDB replica-set database ending in `_test`, then run:

```bash
npm run verify:backend
```

## 2. Render environment

Set these values before the first production start:

```env
MONGODB_URI=<MongoDB Atlas replica-set connection string>
MONGODB_DB=robofusion
SESSION_SECRET=<random 32+ character secret>
ZONE_API_KEY_PEPPER=<random 16+ character secret>
APP_ORIGIN=https://robofusion-scs-rg-devtork-r1.onrender.com
APP_ENV=production
DEMO_PASSWORD=scs-grid
OFFLINE_AFTER_MS=20000
ML_MODEL_PATH=models/risk-model-v1.json
```

`npm start` automatically runs idempotent migration and seed before starting the Next.js/WebSocket server. Do not rotate `ZONE_API_KEY_PEPPER` without restarting so the seed regenerates the five matching development-key hashes.

## 3. Health and login

- Open `/api/v1/system/ready` and confirm `status: ready`.
- Sign in with `admin@scs.local` or `staff@scs.local` and the configured `DEMO_PASSWORD`.
- Open direct routes such as `/priority` and `/incidents`; browser refresh must remain functional.

## 4. Wokwi

- Start all five folders under `wokwi-simulation/` in separate tabs.
- Keep Flame, Occupancy Cross-check and Sensor Fault switches in their initial right-hand/off position.
- Confirm the Serial Monitor has no `401 INVALID_ZONE_KEY`, `422 INVALID_READING` or repeated HTTP timeout errors.
- Within one live cycle, each dashboard zone should change from Offline to Online and show current risk/sensors.

## 5. Submission evidence

Follow `docs/VIDEO_DEMO_SCRIPT.md` and `docs/PDF_ALIGNMENT_CHECKLIST.md`. The final submission PDF should include the circuit/pinout, software architecture, API table/examples, ER diagram, risk formula/justification, backup/retention policy and bonus safety statements.
