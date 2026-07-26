# Verification Report

This report records the checks completed on the final source package before handoff.

## Completed checks

- Full-project semantic TypeScript check using TypeScript 5.8.3 and temporary external-module declarations.
- Manual risk-engine assertions covering score weighting, state thresholds, priority ranking inputs, invalid values, debounce and recovery behavior.
- Deterministic Bonus 3 logistic-regression training and held-out metric generation.
- ML model sanity checks confirming low baseline probability, positive fire/gas/water/occupancy/trend coefficients and high probability under severe combined hazards.
- JSON syntax validation for package files, Wokwi diagrams and model artifacts.
- YAML syntax validation for OpenAPI, Render and Docker Compose configuration.
- Static consistency checks for five-zone keys/codes, 500 ms telemetry, five-second command fallback, live-first cached replay, 20-second liveness and removal of previously hardcoded frontend data.
- Source review of authenticated REST/WebSocket/SSE snapshots, server-side risk calculation, deduplication, incident lifecycle, first-write-wins acknowledgment, RBAC, manual override, database indexes/integrity, history/timeline, trends, advisory ML prediction and NLP validation gate.

## Environment limitation

A clean `npm ci` was attempted repeatedly in this sandbox. The configured internal npm mirror returned repeated HTTP 503 errors for `@emnapi/core`, so this environment could not install dependencies and therefore could not execute the real Next.js build, ESLint or Vitest suites. This is an infrastructure/download limitation, not a reported source-code test failure.

## Required pre-deployment gate

Run these commands in a normal internet-connected Node.js 20+ environment before final submission:

```bash
npm ci
npm run verify:all
```

For database/concurrency tests, copy `.env.test.example` to `.env.test`, point it to a disposable MongoDB replica-set database, then run:

```bash
npm run verify:backend
```

After deployment, start all five Wokwi projects and confirm each Serial Monitor shows successful ingestion responses rather than `401`, `422` or repeated timeout errors. Then execute the PDF test-case sequence using `docs/VIDEO_DEMO_SCRIPT.md`.

## Submission boundary

The repository includes the engineering implementation and supporting Markdown documentation. The final formatted submission PDF and narrated demonstration video remain user-produced submission artifacts. Camera/ESP32-CAM Bonus 1 is intentionally not claimed.
