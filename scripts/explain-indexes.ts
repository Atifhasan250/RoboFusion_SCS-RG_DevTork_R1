/**
 * explain-indexes.ts — Generate explain("executionStats") evidence
 * for the two most important queries (PDF Test Case 26).
 *
 * Output is printed as JSON and can be saved for demo evidence.
 * Run: npm run db:indexes:explain > docs/evidence/index-explain.json
 */
import "dotenv/config";
import { db } from "../src/server/db/client";

async function main() {
  const d = await db();
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const evidence: Record<string, unknown> = {};

  // ── PDF Test Case 26, Query 1: Critical incidents in last 24 hours ────────
  const incidentExplain = await d
    .collection("incidents")
    .find({ severity: "CRITICAL", startedAt: { $gte: last24Hours } })
    .sort({ startedAt: -1 })
    .explain("executionStats");

  const incidentStats = (incidentExplain as { executionStats?: { totalDocsExamined: number; totalKeysExamined: number; executionTimeMillis: number; nReturned: number } }).executionStats;
  evidence["incidents_critical_24h"] = {
    query: { severity: "CRITICAL", startedAt: { $gte: "$last24Hours" } },
    sort: { startedAt: -1 },
    expected_winning_index: "{ severity: 1, startedAt: -1 }",
    totalDocsExamined: incidentStats?.totalDocsExamined,
    totalKeysExamined: incidentStats?.totalKeysExamined,
    executionTimeMillis: incidentStats?.executionTimeMillis,
    nReturned: incidentStats?.nReturned,
    winningPlan: (incidentExplain as { queryPlanner?: { winningPlan?: unknown } }).queryPlanner?.winningPlan,
  };

  // ── Query 2: Readings by zone ordered by time ─────────────────────────────
  const zones = await d.collection("zones").find({ configured: true }).limit(1).toArray();
  if (zones.length > 0) {
    const readingExplain = await d
      .collection("readings")
      .find({ zoneId: zones[0].id })
      .sort({ observedAt: -1 })
      .limit(100)
      .explain("executionStats");

    const readingStats = (readingExplain as { executionStats?: { totalDocsExamined: number; totalKeysExamined: number; executionTimeMillis: number; nReturned: number } }).executionStats;
    evidence["readings_by_zone"] = {
      query: { zoneId: "$firstZoneId" },
      sort: { observedAt: -1 },
      totalDocsExamined: readingStats?.totalDocsExamined,
      totalKeysExamined: readingStats?.totalKeysExamined,
      executionTimeMillis: readingStats?.executionTimeMillis,
      nReturned: readingStats?.nReturned,
      winningPlan: (readingExplain as { queryPlanner?: { winningPlan?: unknown } }).queryPlanner?.winningPlan,
    };
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const output = {
    generated_at: new Date().toISOString(),
    mongodb_collection_sizes: {
      readings: await d.collection("readings").countDocuments(),
      incidents: await d.collection("incidents").countDocuments(),
    },
    explain_stats: evidence,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");

  const incStats = evidence["incidents_critical_24h"] as { totalDocsExamined?: number; totalKeysExamined?: number };
  if (incStats?.totalDocsExamined !== undefined && incStats?.totalKeysExamined !== undefined) {
    const ratio = incStats.totalDocsExamined / Math.max(1, incStats.totalKeysExamined);
    if (ratio > 10) {
      process.stderr.write("WARNING: docsExamined >> keysExamined — index may not be used correctly\n");
    } else {
      process.stderr.write("Index efficiency OK\n");
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
