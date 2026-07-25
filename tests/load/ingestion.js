import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 30, duration: '30s' };
const base = __ENV.BASE_URL || 'http://localhost:3000';
export default function loadIngestion() { const zone = `PHANTOM_${__VU}`; const body = JSON.stringify({ sequence: __ITER, timestamp: new Date().toISOString(), fire: false, gas: Math.random()*100, water: Math.random()*30, pir: __ITER%4===0, sensorHealth:'HEALTHY', deviceUptimeSeconds:90 }); const r = http.post(`${base}/api/v1/readings/${zone}`, body, { headers: { 'Content-Type':'application/json', 'x-zone-api-key': `${zone}-demo-key` } }); check(r, { 'reading accepted': x => x.status === 201 || x.status === 200 }); }
