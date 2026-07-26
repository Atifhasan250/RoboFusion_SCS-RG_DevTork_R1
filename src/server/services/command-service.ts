import type { ClientSession } from "mongodb";
import { collections } from "../db/collections";
import { id } from "../utils/id";
import type {
  ActuatorCommand,
  CommandSource,
  ConnectivityState,
  Incident,
  LedState,
  SafetyState,
} from "../types";

export class CommandError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/**
 * Allocates a command version atomically inside the caller's transaction.
 * Every command writer (sensor ingestion, override, recovery) must use this.
 */
export async function allocateCommandVersion(zoneId: string, session: ClientSession): Promise<number> {
  const c = await collections();
  const updated = await c.zones.findOneAndUpdate(
    { id: zoneId },
    { $inc: { commandVersion: 1 }, $set: { updatedAt: new Date() } },
    { session, returnDocument: "after" },
  );

  if (!updated) {
    throw new CommandError(404, "ZONE_NOT_FOUND", "Zone not found while allocating command version");
  }
  return updated.commandVersion;
}

export function outputForState(
  safetyState: SafetyState,
  connectivityState: ConnectivityState,
): { commandState: SafetyState | "OFFLINE"; led: LedState; buzzer: boolean; relayCutoff: boolean } {
  if (connectivityState === "OFFLINE") {
    // A sensor/network fault must never silently reset a previously confirmed hazard.
    if (safetyState === "CRITICAL") {
      return { commandState: "OFFLINE", led: "RED", buzzer: true, relayCutoff: true };
    }
    if (safetyState === "WARNING") {
      return { commandState: "OFFLINE", led: "YELLOW", buzzer: false, relayCutoff: false };
    }
    return { commandState: "OFFLINE", led: "OFF", buzzer: false, relayCutoff: false };
  }
  if (safetyState === "CRITICAL") {
    return { commandState: "CRITICAL", led: "RED", buzzer: true, relayCutoff: true };
  }
  if (safetyState === "WARNING") {
    return { commandState: "WARNING", led: "YELLOW", buzzer: false, relayCutoff: false };
  }
  return { commandState: "SAFE", led: "GREEN", buzzer: false, relayCutoff: false };
}

export function buildActuatorCommand(input: {
  zoneId: string;
  incident: Incident | null;
  commandVersion: number;
  safetyState: SafetyState;
  connectivityState: ConnectivityState;
  source: CommandSource;
  buzzer?: boolean;
  relayCutoff?: boolean;
  led?: LedState;
  now?: Date;
}): Omit<ActuatorCommand, "_id"> {
  const base = outputForState(input.safetyState, input.connectivityState);
  return {
    id: id(),
    zoneId: input.zoneId,
    incidentId: input.incident?.id ?? null,
    commandVersion: input.commandVersion,
    safetyState: base.commandState,
    led: input.led ?? base.led,
    buzzer: input.buzzer ?? base.buzzer,
    relayCutoff: input.relayCutoff ?? base.relayCutoff,
    commandSource: input.source,
    createdAt: input.now ?? new Date(),
    acknowledgedAt: null,
    appliedAt: null,
  };
}

export function actuatorStateChanged(
  previous: ActuatorCommand | null,
  next: Pick<ActuatorCommand, "led" | "buzzer" | "relayCutoff" | "safetyState">,
): boolean {
  return !previous
    || previous.led !== next.led
    || previous.buzzer !== next.buzzer
    || previous.relayCutoff !== next.relayCutoff
    || previous.safetyState !== next.safetyState;
}
