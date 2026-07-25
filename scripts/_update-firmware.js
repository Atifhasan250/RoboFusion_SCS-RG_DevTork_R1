const fs = require('fs');

const dirs = [
  'wokwi-simulation/zone-1-iot-lab/sketch.ino',
  'wokwi-simulation/zone-2-robotics-lab/sketch.ino',
  'wokwi-simulation/zone-3-server-room/sketch.ino',
  'wokwi-simulation/zone-4-data-science-lab/sketch.ino',
  'wokwi-simulation/zone-5-software-lab/sketch.ino'
];

for (const p of dirs) {
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(
    /bool fault = \(digitalRead\(PIN_FAULT\) == LOW\);\s*doc\["sensorHealth"\] = fault \? "OFFLINE" : "HEALTHY";/,
    `bool fault = (digitalRead(PIN_FAULT) == LOW);
  doc["sensorHealth"] = fault ? "DEGRADED" : "HEALTHY";
  JsonObject sensorStatus = doc.createNestedObject("sensorStatus");
  sensorStatus["fire"] = fault ? "OFFLINE" : "ONLINE";
  sensorStatus["gas"] = fault ? "OFFLINE" : "ONLINE";
  sensorStatus["water"] = fault ? "OFFLINE" : "ONLINE";
  sensorStatus["pir"] = fault ? "OFFLINE" : "ONLINE";`
  );
  fs.writeFileSync(p, content);
  console.log(`Updated ${p}`);
}
