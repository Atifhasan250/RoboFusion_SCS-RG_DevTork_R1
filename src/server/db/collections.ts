import { db } from "./client";
import type {
  AuditEvent, Incident, IncidentEvent, Acknowledgment,
  ActuatorCommand, ManualOverride, Prediction, NaturalLanguageReport,
  Reading, Session, User, Zone, ZoneStateDoc, SensorCalibration
} from "../types";

export async function collections() {
  const database = await db();
  return {
    zones: database.collection<Zone>("zones"),
    zone_states: database.collection<ZoneStateDoc>("zone_states"),
    readings: database.collection<Reading>("readings"),
    sensors: database.collection<SensorCalibration>("sensors"),
    incidents: database.collection<Incident>("incidents"),
    incident_events: database.collection<IncidentEvent>("incident_events"),
    acknowledgments: database.collection<Acknowledgment>("acknowledgments"),
    actuator_commands: database.collection<ActuatorCommand>("actuator_commands"),
    manual_overrides: database.collection<ManualOverride>("manual_overrides"),
    predictions: database.collection<Prediction>("predictions"),
    natural_language_reports: database.collection<NaturalLanguageReport>("natural_language_reports"),
    users: database.collection<User>("users"),
    sessions: database.collection<Session>("sessions"),
    audits: database.collection<AuditEvent>("audits"),
    migrations: database.collection<{ id: string; checksum: string; appliedAt: Date }>("schema_migrations"),
  };
}
