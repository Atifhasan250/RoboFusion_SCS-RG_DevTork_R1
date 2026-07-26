import "dotenv/config";
import { collections } from "../src/server/db/collections";

const REQUIRED_ZONES = ["IOT_LAB", "ROBOTICS_LAB", "SERVER_ROOM", "DATA_SCIENCE_LAB", "SOFTWARE_LAB"] as const;
const REQUIRED_SENSORS = ["FIRE", "GAS", "WATER", "PIR"] as const;

async function main() {
  const c = await collections();
  const zones = await c.zones.find({ code: { $in: [...REQUIRED_ZONES] }, configured: true }).toArray();
  const configuredCount = await c.zones.countDocuments({ configured: true });
  if (configuredCount !== REQUIRED_ZONES.length) {
    throw new Error(`Expected exactly ${REQUIRED_ZONES.length} configured zones after the main seed; found ${configuredCount}`);
  }
  const foundCodes = new Set(zones.map(zone => zone.code));
  const missingZones = REQUIRED_ZONES.filter(code => !foundCodes.has(code));
  if (missingZones.length) throw new Error(`Missing configured zones: ${missingZones.join(", ")}`);

  for (const zone of zones) {
    const sensors = await c.sensors.find({ zoneId: zone.id, isEnabled: true }).toArray();
    const types = new Set(sensors.map(sensor => sensor.sensorType));
    const missing = REQUIRED_SENSORS.filter(type => !types.has(type));
    if (missing.length) throw new Error(`${zone.code} missing sensors: ${missing.join(", ")}`);
    const state = await c.zone_states.findOne({ zoneId: zone.id });
    if (!state) throw new Error(`${zone.code} has no zone_states document`);
  }

  const officialSensorCount = await c.sensors.countDocuments({
    zoneId: { $in: zones.map(zone => zone.id) },
    sensorType: { $in: [...REQUIRED_SENSORS] },
    isEnabled: true,
  });
  if (officialSensorCount !== REQUIRED_ZONES.length * REQUIRED_SENSORS.length) {
    throw new Error(`Expected exactly 20 enabled core sensor records; found ${officialSensorCount}`);
  }

  console.log(`✓ Exactly five official configured zones verified: ${REQUIRED_ZONES.join(", ")}`);
  console.log(`✓ Exactly twenty required sensor records verified (${REQUIRED_SENSORS.join(", ")} per zone).`);
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
