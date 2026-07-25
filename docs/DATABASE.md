# Database Schema — SCS-RG

## Collections Overview

| Collection | Purpose | Key Index |
|---|---|---|
| `zones` | Zone identity and config | `code` unique |
| `zone_states` | Durable live state (authoritative) | `zoneId` unique |
| `sensors` | Sensor calibration per zone | `(zoneId, sensorType)` unique |
| `readings` | Raw sensor readings (90-day TTL) | `(zoneId, bootId, sequence)` unique |
| `incidents` | Incident lifecycle | `(zoneId, active:true)` partial unique |
| `incident_events` | Event timeline per incident | `(incidentId, occurredAt)` |
| `acknowledgments` | One per incident, race-safe | `incidentId` unique |
| `actuator_commands` | Persisted commands per state version | `(zoneId, commandVersion)` unique |
| `manual_overrides` | Admin override records | `(zoneId, active)` |
| `predictions` | ML/AI advisory predictions | `(zoneId, predictedAt)` |
| `natural_language_reports` | NLP incident reports | `(userId, createdAt)` |
| `users` | User accounts | `email` unique |
| `sessions` | HttpOnly session tokens | `expiresAt` TTL |
| `audits` | Audit log | `(zoneId, createdAt)` |
| `schema_migrations` | Migration tracking | `id` unique |

## MongoDB Integrity Strategy

MongoDB does not have cross-collection foreign keys. Integrity is enforced by:

1. **JSON Schema Validators** — `readings` and `incidents` collections have strict validators.
2. **Unique Indexes** — prevent duplicate readings, sessions, acknowledgments.
3. **Partial Unique Index** — `{zoneId: 1, active: 1}` with `partialFilterExpression: {active: true}` enforces one active incident per zone.
4. **Multi-document Transactions** — reading + zone_state + incident + command written atomically.
5. **Application-level Reference Checks** — service layer verifies referenced IDs exist before writing.
6. **Integrity Check Script** — `npm run db:integrity:check` verifies zero orphan documents.

## Key Collections

### `zone_states` — Authoritative live state

```json
{
  "zoneId": "uuid",
  "safetyState": "CRITICAL",
  "connectivityState": "ONLINE",
  "riskScore": 88.5,
  "riskComponents": { "fire": 70, "gas": 8.5, "water": 0, "occupancy": 10 },
  "primaryHazard": "FIRE",
  "occupied": true,
  "criticalSince": "2026-07-25T08:20:10Z",
  "consecutiveCriticalReadings": 5,
  "fireConfirmed": true,
  "commandVersion": 42,
  "updatedAt": "2026-07-25T08:20:45Z"
}
```

### `incidents` — Active incident

```json
{
  "id": "uuid",
  "zoneId": "uuid",
  "status": "OPEN",
  "active": true,
  "severity": "CRITICAL",
  "primaryHazard": "FIRE",
  "initialRiskScore": 70,
  "peakRiskScore": 88.5,
  "startedAt": "2026-07-25T08:20:10Z",
  "acknowledgedAt": null,
  "resolvedAt": null,
  "version": 1
}
```

### `actuator_commands` — Persisted command

```json
{
  "id": "uuid",
  "zoneId": "uuid",
  "incidentId": "uuid",
  "commandVersion": 42,
  "safetyState": "CRITICAL",
  "led": "RED",
  "buzzer": true,
  "relayCutoff": true,
  "commandSource": "SENSOR_STATE",
  "createdAt": "2026-07-25T08:20:45Z",
  "acknowledgedAt": null,
  "appliedAt": null
}
```

## Data Retention Policy

| Data | Retention |
|---|---|
| Raw readings | 90 days (TTL index on `observedAt`) |
| Incidents | Minimum 1 year (no TTL) |
| Audit logs | Minimum 1 year (no TTL) |
| Predictions | 90 days (TTL index on `predictedAt`) |
| Sessions | 8 hours (TTL index on `expiresAt`) |

## Backup Strategy

- Daily `mongodump --gzip` to separate storage
- Last 7 daily backups retained
- Manual backup before each demo
- Restore: `mongorestore --gzip --drop`, then `npm run db:integrity:check`
- Atlas automated daily backup with point-in-time recovery recommended for production
