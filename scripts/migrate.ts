import "dotenv/config";
import { createHash } from "crypto";
import { db } from "../src/server/db/client";

const ALL_COLLECTIONS = [
  "zones", "zone_states", "sensors",
  "readings", "incidents", "incident_events",
  "acknowledgments", "actuator_commands", "manual_overrides",
  "predictions", "natural_language_reports",
  "users", "sessions", "audits", "schema_migrations",
];

const migrations = [
  // ── 001: Create all collections ─────────────────────────────────────────────
  {
    id: "001-core-collections",
    run: async () => {
      const d = await db();
      const existing = await d.listCollections().toArray();
      const names = new Set(existing.map(c => c.name));
      for (const name of ALL_COLLECTIONS) {
        if (!names.has(name)) await d.createCollection(name);
      }
    },
  },

  // ── 002: Core indexes ────────────────────────────────────────────────────────
  {
    id: "002-indexes",
    run: async () => {
      const d = await db();
      await Promise.all([
        // zones
        d.collection("zones").createIndex({ code: 1 }, { unique: true }),
        d.collection("zones").createIndex({ commandVersion: 1 }),
        // zone_states — one state doc per zone
        d.collection("zone_states").createIndex({ zoneId: 1 }, { unique: true }),
        d.collection("zone_states").createIndex({ connectivityState: 1 }),
        // sensors
        d.collection("sensors").createIndex({ zoneId: 1, sensorType: 1 }, { unique: true }),
        // readings — duplicate prevention
        d.collection("readings").createIndex({ zoneId: 1, bootId: 1, sequence: 1 }, { unique: true }),
        d.collection("readings").createIndex({ zoneId: 1, observedAt: -1 }),
        d.collection("readings").createIndex({ observedAt: -1 }),
        // incidents — one active per zone
        d.collection("incidents").createIndex({ zoneId: 1, active: 1 }, {
          unique: true,
          partialFilterExpression: { active: true },
        }),
        d.collection("incidents").createIndex({ status: 1, startedAt: -1 }),
        d.collection("incidents").createIndex({ zoneId: 1, startedAt: -1 }),
        // PDF Test Case 19: Critical incident query index
        d.collection("incidents").createIndex({ severity: 1, startedAt: -1 }),
        // incident_events
        d.collection("incident_events").createIndex({ incidentId: 1, occurredAt: 1 }),
        d.collection("incident_events").createIndex({ zoneId: 1, occurredAt: -1 }),
        d.collection("incident_events").createIndex({ eventType: 1, occurredAt: -1 }),
        // acknowledgments — unique per incident
        d.collection("acknowledgments").createIndex({ incidentId: 1 }, { unique: true }),
        // actuator_commands — unique per zone+version
        d.collection("actuator_commands").createIndex({ zoneId: 1, commandVersion: 1 }, { unique: true }),
        d.collection("actuator_commands").createIndex({ zoneId: 1, createdAt: -1 }),
        // manual_overrides
        d.collection("manual_overrides").createIndex({ zoneId: 1, active: 1 }),
        d.collection("manual_overrides").createIndex({ expiresAt: 1 }),
        // predictions
        d.collection("predictions").createIndex({ zoneId: 1, predictedAt: -1 }),
        // natural_language_reports
        d.collection("natural_language_reports").createIndex({ userId: 1, createdAt: -1 }),
        // users
        d.collection("users").createIndex({ email: 1 }, { unique: true }),
        // sessions TTL
        d.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        // audits
        d.collection("audits").createIndex({ createdAt: -1 }),
        d.collection("audits").createIndex({ zoneId: 1, createdAt: -1 }),
      ]);
    },
  },

  // ── 003: JSON Schema validators + TTL retention ──────────────────────────────
  {
    id: "003-validation-retention",
    run: async () => {
      const d = await db();

      // Readings validator
      await d.command({
        collMod: "readings",
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["id", "zoneId", "bootId", "sequence", "observedAt", "riskScore"],
            properties: {
              id: { bsonType: "string" },
              zoneId: { bsonType: "string" },
              bootId: { bsonType: "string" },
              sequence: { bsonType: ["int", "long", "double"] },
              observedAt: { bsonType: "date" },
              riskScore: { bsonType: ["double", "int", "long"] },
              sensorHealth: { enum: ["HEALTHY", "DEGRADED", "OFFLINE"] },
            },
          },
        },
        validationLevel: "strict",
        validationAction: "error",
      });

      // Incidents validator
      await d.command({
        collMod: "incidents",
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["id", "zoneId", "status", "active", "severity", "primaryHazard"],
            properties: {
              id: { bsonType: "string" },
              zoneId: { bsonType: "string" },
              status: { enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED"] },
              active: { bsonType: "bool" },
              severity: { enum: ["CRITICAL"] },
              primaryHazard: { enum: ["FIRE", "GAS", "FLOOD", "OCCUPANCY", "NONE"] },
            },
          },
        },
        validationLevel: "strict",
        validationAction: "error",
      });

      // TTL: readings retained 90 days
      await d.collection("readings").createIndex(
        { observedAt: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60 }
      );

      // TTL: predictions retained 90 days
      await d.collection("predictions").createIndex(
        { predictedAt: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60 }
      );

      // TTL: expired sessions cleaned up
      // (already created in 002, this ensures it exists)
    },
  },

  // ── 004: zone_states schema validation ───────────────────────────────────────
  {
    id: "004-zone-states-validator",
    run: async () => {
      const d = await db();
      await d.command({
        collMod: "zone_states",
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: [
              "zoneId",
              "safetyState",
              "connectivityState",
              "riskScore",
              "riskComponents",
              "fireConfirmed",
              "firePositiveCount",
              "fireClearCount",
              "stateVersion",
              "lastObservedAt",
              "updatedAt"
            ],
            properties: {
              zoneId: { bsonType: "string" },
              safetyState: { enum: ["SAFE", "WARNING", "CRITICAL"] },
              connectivityState: { enum: ["ONLINE", "DEGRADED", "OFFLINE", "NOT_CONFIGURED"] },
              riskScore: { bsonType: ["int", "double", "long"] },
              riskComponents: {
                bsonType: "object",
                required: ["fire", "gas", "water", "occupancy"]
              },
              fireConfirmed: { bsonType: "bool" },
              firePositiveCount: { bsonType: ["int", "double", "long"] },
              fireClearCount: { bsonType: ["int", "double", "long"] },
              stateVersion: { bsonType: ["int", "double", "long"] },
              lastObservedAt: { bsonType: ["date", "null"] },
              updatedAt: { bsonType: ["date", "null"] },
            }
          }
        },
        validationLevel: "strict",
        validationAction: "error",
      });
    }
  },

  // ── 005: Add commandVersion index to zones ─────────────────────────────────
  {
    id: "005-command-version-index",
    run: async () => {
      const d = await db();
      await d.collection("zones").createIndex({ commandVersion: 1 });
    }
  },

  // ── 006: Five-zone / replay / NLP ranking support ──────────────────────────
  {
    id: "006-five-zone-integrity-and-advisory-indexes",
    run: async () => {
      const d = await db();
      await Promise.all([
        d.collection("schema_migrations").createIndex({ id: 1 }, { unique: true }),
        d.collection("natural_language_reports").createIndex({ linkedIncidentId: 1, createdAt: -1 }),
        d.collection("natural_language_reports").createIndex({ parsedZoneCode: 1, parsedHazard: 1, createdAt: -1 }),
        d.collection("readings").createIndex({ replayed: 1, receivedAt: -1 }),
        d.collection("zones").createIndex({ configured: 1, connectivityState: 1 }),
      ]);

      await d.command({
        collMod: "sensors",
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: [
              "id", "zoneId", "sensorType", "rawMin", "rawMax", "baselineRaw", "criticalRaw",
              "direction", "warmupSeconds", "debounceCount", "isRequired", "isEnabled", "status",
              "lastSeenAt", "createdAt", "updatedAt"
            ],
            properties: {
              id: { bsonType: "string" },
              zoneId: { bsonType: "string" },
              sensorType: { enum: ["FIRE", "GAS", "WATER", "PIR", "CAMERA"] },
              status: { enum: ["ONLINE", "OFFLINE", "DEGRADED", "WARMING_UP", "NOT_CONFIGURED"] },
              isRequired: { bsonType: "bool" },
              isEnabled: { bsonType: "bool" },
              lastSeenAt: { bsonType: ["date", "null"] },
            }
          }
        },
        validationLevel: "strict",
        validationAction: "error",
      });
    }
  },

  // ── 007: Tighten reading advisory fields without breaking old rows ─────────
  {
    id: "007-reading-replay-validator",
    run: async () => {
      const d = await db();
      await d.command({
        collMod: "readings",
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["id", "zoneId", "bootId", "sequence", "observedAt", "riskScore"],
            properties: {
              id: { bsonType: "string" },
              zoneId: { bsonType: "string" },
              bootId: { bsonType: "string" },
              sequence: { bsonType: ["int", "long", "double"] },
              observedAt: { bsonType: "date" },
              riskScore: { bsonType: ["double", "int", "long"] },
              replayed: { bsonType: "bool" },
              replayBatchLast: { bsonType: "bool" },
              sensorHealth: { enum: ["HEALTHY", "DEGRADED", "OFFLINE"] },
            }
          }
        },
        validationLevel: "moderate",
        validationAction: "error",
      });
    }
  }
];

async function main() {
  const d = await db();
  for (const migration of migrations) {
    const checksum = createHash("sha256").update(migration.id).digest("hex");
    const done = await d.collection("schema_migrations").findOne({ id: migration.id });
    if (!done) {
      await migration.run();
      await d.collection("schema_migrations").insertOne({
        id: migration.id,
        checksum,
        appliedAt: new Date(),
      });
      console.log(`✓ Applied ${migration.id}`);
    } else {
      console.log(`  Skipped ${migration.id} (already applied)`);
    }
  }
  console.log("Migration complete.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
