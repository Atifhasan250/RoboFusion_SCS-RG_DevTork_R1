# Seven-Minute Demonstration Runbook

Record one continuous 6:30–6:50 video. Keep the browser dashboard, selected Wokwi tabs and Serial Monitor ready before recording.

## 0:00–0:25 — Architecture and idle state

State: five Wokwi zones → authenticated raw API → backend risk/incident/priority → MongoDB Atlas → live dashboard → commands back to each node. Show all zones Safe/Online and empty priority queue.

## 0:25–1:20 — Sensor tests

On IoT Lab: brief flame flicker under one second (no trigger), then sustained flame (Critical, red LED/buzzer/relay). Remove flame and mention recovery window. Briefly move gas and water controls to show graded contributions. Toggle PIR and sensor fault to show occupancy and explicit Offline rather than false empty/Safe.

## 1:20–2:25 — Simultaneous multi-zone priority

Trigger IoT Lab and Server Room within seconds, with IoT occupied and higher combined risk. Show both Critical, independent local actuation, and backend queue order. Read the visible ranking reasons aloud. Acknowledge rank 1; show it remains in the queue but stops demanding attention.

## 2:25–3:10 — Incident lifecycle

Open the rank-1 timeline and show trigger/state/ack events. Clear both hazards, wait for Warning→Safe recovery, then show both incidents Resolved and the system returning to idle.

## 3:10–3:55 — Frontend reliability and RBAC

Show incident date/zone/hazard filters. Sign in as Security Staff and show Admin-only override/system health unavailable. Reconnect/refresh the browser during an incident and show the full current snapshot is restored. Mention WebSocket plus REST fallback.

## 3:55–4:40 — Validation and resilience

Show a malformed/impossible request (negative water or gas >4095) returning 422. Mention duplicate `(zone, bootId, sequence)` is idempotent. Briefly stop/restart the backend or show the restart test/log and explain current state reconstructs from Atlas. Show Sensor Fault preserving last known Critical state.

## 4:40–5:25 — Database and concurrency evidence

Show ER diagram, indexes and test output for simultaneous writes/acknowledgment race. State raw readings are Admin-only and retained 90 days; incidents/events at least one year; daily backup and guarded restore path.

## 5:25–6:15 — Bonuses

Show trend toward Critical. Open zone details and show separate two-minute ML probability, model version and advisory-only safety statement. Submit a natural-language report, show parsed zone/hazard/severity and explain deterministic validation before bounded ranking impact.

## 6:15–6:45 — Cross-component consistency and close

Trigger one final Critical zone. Pause with Wokwi red LED/buzzer/relay, dashboard Critical state and API/backend state aligned. Close by stating five zones, backend-computed risk, durable Atlas state, deterministic priority and role-controlled response.

## Recording checklist

- Do not exceed seven minutes.
- Label sections on screen or in narration by test case group.
- Show actual behavior, not only documentation.
- Keep credentials/secrets and Atlas URI hidden.
- Do not claim ESP32-CAM Bonus 1.
