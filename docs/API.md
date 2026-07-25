# API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/readings/:zoneCode` | Ingest raw reading; requires `x-zone-api-key` |
| POST | `/api/v1/auth/login` | Start HttpOnly session and receive CSRF token |
| GET | `/api/v1/zones` | Authenticated current zone state |
| GET | `/api/v1/incidents` | Filterable incident history |
| POST | `/api/v1/incidents/:incidentId/acknowledge` | Race-safe incident acknowledgement |
| GET | `/api/v1/priority-queue` | Ranked open incidents |
| GET | `/api/v1/trends/:zoneCode` | Advisory short-term risk slope |
| GET | `/api/v1/predictions/:zoneCode` | Advisory ML probability, never an actuator input |
| POST | `/api/v1/admin/override` | Admin-only audited command |
| GET | `/api/v1/system/events` | Server-sent real-time updates |

The persistent WebSocket gateway is available at `ws(s)://HOST/ws`; it sends a `snapshot` on connection followed by `zone.updated` and `incident.acknowledged` events. SSE is retained as a browser-compatible fallback.

Example reading:
```json
{"sequence":41,"timestamp":"2026-07-25T12:00:00Z","fire":false,"gas":72,"water":10,"pir":true,"sensorHealth":"HEALTHY","deviceUptimeSeconds":120}
```

Every browser mutation requires `x-csrf-token`, and session-based RBAC is enforced at the endpoint.
