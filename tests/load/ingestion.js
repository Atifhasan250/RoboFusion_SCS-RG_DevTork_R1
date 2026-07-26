import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 30,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

const base = __ENV.BASE_URL || "http://localhost:3000";
const bootId = `k6-${Date.now()}`;

function sensorValues() {
  const r = Math.random();
  if (r < 0.70) return { fire: false, gas: 1200, water: 0, pir: false };
  if (r < 0.90) return { fire: false, gas: 2100, water: 20, pir: true };
  return { fire: Math.random() > 0.7, gas: 3300, water: 85, pir: true };
}

export default function loadIngestion() {
  const zone = `PHANTOM_${__VU}`;
  const values = sensorValues();
  const body = JSON.stringify({
    bootId,
    sequence: __ITER,
    timestamp: new Date().toISOString(),
    ...values,
    sensorHealth: "HEALTHY",
    sensorStatus: { fire: "ONLINE", gas: "ONLINE", water: "ONLINE", pir: "ONLINE" },
    deviceUptimeSeconds: 90,
    sampleIntervalMs: 500,
    replayed: false,
    replayBatchLast: false,
  });
  const response = http.post(`${base}/api/v1/readings/${zone}`, body, {
    headers: { "Content-Type": "application/json", "x-zone-api-key": `${zone}-demo-key` },
  });
  check(response, { "reading accepted": r => r.status === 201 || r.status === 200 });
  sleep(0.5);
}
