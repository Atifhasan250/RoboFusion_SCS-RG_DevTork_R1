/**
 * Integration tests: acknowledgment race condition
 * Tests that two simultaneous acknowledge requests result in exactly one success.
 *
 * Run: npx tsx tests/integration/acknowledge-race.ts
 */
import "dotenv/config";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function login(email: string, password: string): Promise<{ cookie: string; csrfToken: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json() as { csrfToken: string };
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  return { cookie, csrfToken: body.csrfToken };
}

async function acknowledgeIncident(
  incidentId: string,
  auth: { cookie: string; csrfToken: string }
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}/api/v1/incidents/${incidentId}/acknowledge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": auth.cookie,
      "x-csrf-token": auth.csrfToken,
    },
    body: JSON.stringify({}),
  });
  return { status: res.status, body: await res.json() };
}

async function getOpenIncident(): Promise<string | null> {
  const adminAuth = await login("admin@scs.local", process.env.DEMO_PASSWORD ?? "ChangeMe123!");
  const res = await fetch(`${BASE_URL}/api/v1/incidents?status=OPEN`, {
    headers: { "Cookie": adminAuth.cookie },
  });
  const body = await res.json() as { incidents: Array<{ id: string }> };
  return body.incidents?.[0]?.id ?? null;
}

async function main() {
  console.log("Integration Test: Acknowledgment Race Condition");
  console.log("─".repeat(60));

  // Login as two different staff users simultaneously
  const [auth1, auth2] = await Promise.all([
    login("admin@scs.local", process.env.DEMO_PASSWORD ?? "ChangeMe123!"),
    login("staff@scs.local", process.env.DEMO_PASSWORD ?? "ChangeMe123!"),
  ]);

  const incidentId = await getOpenIncident();
  if (!incidentId) {
    console.log("⚠ No open incident found. Trigger one by sending CRITICAL readings first.");
    console.log("  Example: POST /api/v1/readings/IOT_LAB with fire=true + high gas");
    process.exit(1);
  }

  console.log(`Testing with incident: ${incidentId}`);
  console.log("Sending 2 simultaneous acknowledge requests...");

  const [result1, result2] = await Promise.all([
    acknowledgeIncident(incidentId, auth1),
    acknowledgeIncident(incidentId, auth2),
  ]);

  console.log(`Response 1: ${result1.status} — ${JSON.stringify(result1.body).slice(0, 80)}`);
  console.log(`Response 2: ${result2.status} — ${JSON.stringify(result2.body).slice(0, 80)}`);

  const successCount = [result1, result2].filter(r => r.status === 200).length;
  const conflictCount = [result1, result2].filter(r => r.status === 409).length;

  console.log("─".repeat(60));

  if (successCount === 1 && conflictCount === 1) {
    console.log("✓ Race condition handled correctly: exactly 1 success, 1 conflict (409)");
    process.exit(0);
  } else if (successCount === 2) {
    console.error("✗ FAIL: Both requests succeeded — race condition NOT prevented!");
    process.exit(1);
  } else if (successCount === 0) {
    console.error("✗ FAIL: Neither request succeeded");
    process.exit(1);
  } else {
    console.error(`✗ Unexpected: ${successCount} successes, ${conflictCount} conflicts`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
