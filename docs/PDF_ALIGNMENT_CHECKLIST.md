# Problem-Statement Alignment Checklist

Use this as the source outline for the final submission PDF. It maps the Round 1 test cases to implementation evidence and the exact live proof to record.

## Section A — Hardware & Sensing (40)

| TC | Implementation evidence | Video proof |
|---|---|---|
| 1 Fire | Five `sketch.ino`; backend two-sample fire debounce and recovery hysteresis | Safe baseline; sub-one-second flicker; sustained flame; remove and recover |
| 2 Gas | ADC 0–4095; 30 s warm-up; proportional normalization | Warm-up no trigger; gradual rise; Critical crossing |
| 3 Water | 0–100 input; proportional normalization; reset | Dry; gradual rise; Critical; clear |
| 4 PIR | One-second entry, two-second exit; per-sensor Offline | Enter; brief exit/re-entry; fault switch shows Offline |
| 5 Actuation | Versioned green/yellow/red LED, buzzer and relay command | Warning visual-only; Critical full response; recovery reset; two zones independently Critical |

## Section B — Backend (35)

| TC | Evidence |
|---|---|
| 6 | `readingSchema`, `ingestion-service`, risk engine, dedup unique index, concurrency tests |
| 7 | Transactional incident lifecycle, unique acknowledgment, hysteresis, real-time events |
| 8 | `docs/API.md`, `openapi.yaml`, status/history/ack/admin override endpoints |
| 9 | `recovery-service`, receipt-time liveness, bounded firmware cache and late replay protection |
| 10 | Zone API hashes, HttpOnly sessions, CSRF, backend role guards |
| 11 | phantom-zone seed, k6 load script, 30-zone scaling notes |

## Section C — Frontend (30)

| TC | Evidence |
|---|---|
| 12 | WebSocket + REST fallback; actual backend `priority_queue`; visible `ranking_reason` |
| 13 | Admin/Security interfaces plus backend endpoint role checks |
| 14 | Backend-filtered incident register and durable event timeline |
| 15 | stacked Critical toasts, audio cue, all open alerts retained; acknowledge clears demand |
| 16 | mixed-state cards use color + icon + text; explicit Offline and last-known state |

## Section D — Database (20)

| TC | Evidence |
|---|---|
| 17 | `docs/DATABASE.md`, collection validators and ER diagram |
| 18 | transactions, unique/partial indexes, zone archive guard, late timestamp handling |
| 19 | index verification/explain scripts and 10,000+ reading seed |
| 20 | `db:backup`, guarded restore to `_test`, documented recovery gap |
| 21 | 90-day raw/prediction retention; Admin raw access; Staff summary access |

## Section E — Integration (15)

| TC | Evidence |
|---|---|
| 22 | `npm run test:tc22` and continuous two-zone live demonstration |
| 23 | show sensor disconnect, three-zone Critical ranking, browser reconnect, invalid negative water |
| 24 | rapid Safe→Warning→Critical→Safe while other zones continue posting |
| 25 | pause on Critical: Wokwi red/buzzer/relay, API state and dashboard all agree |

## Section F — Documentation (20)

- Circuit diagrams: five `diagram.json` files plus `docs/CIRCUIT_PINOUTS.md`.
- Software architecture: `docs/ARCHITECTURE.md` Mermaid diagram.
- API: `docs/API.md` and `openapi.yaml`.
- Database ERD: `docs/DATABASE.md`.
- Risk formula and rationale: `docs/ARCHITECTURE.md`.
- Video: follow `docs/VIDEO_DEMO_SCRIPT.md`, maximum seven minutes.

## Bonuses

- **Bonus 1:** not claimed; GPIO 21 is explicitly a development cross-check, not ESP32-CAM image processing.
- **Bonus 2:** `trend-service` and the separate trend display.
- **Bonus 3:** `scripts/train-risk-model.ts`, `models/risk-model-v1.json`, `models/metrics-v1.json`, separate advisory prediction panel; never connected to actuator logic.
- **Bonus 4:** free-text report page, AI/local parser, deterministic validation and bounded incident-matching priority bonus.
