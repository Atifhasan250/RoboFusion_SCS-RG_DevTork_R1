import { NextRequest, NextResponse } from "next/server";
import { requireUser, assertCsrf, AuthError } from "@/src/server/auth/session";
import { parseIncidentNote } from "@/src/server/services/ai-service";
import { collections } from "@/src/server/db/collections";
import { nlpLimiter } from "@/src/server/utils/rate-limiter";
import { id } from "@/src/server/utils/id";
import { noteSchema } from "@/src/server/validation/schemas";
import type { HazardType } from "@/src/server/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    await assertCsrf(request);
    if (!nlpLimiter.allow(user.id)) {
      return NextResponse.json({ error: "RATE_LIMITED", message: "Too many report submissions. Please wait." }, { status: 429 });
    }

    const { text } = noteSchema.parse(await request.json());
    const { signal, provider } = await parseIncidentNote(text);
    const c = await collections();
    const now = new Date();
    const zone = await c.zones.findOne({ code: signal.zoneCode, configured: true });
    if (!zone) return NextResponse.json({ error: "INVALID_ZONE_CODE" }, { status: 422 });

    const activeIncident = await c.incidents.findOne({
      zoneId: zone.id,
      active: true,
      primaryHazard: signal.hazard as HazardType,
    });
    const zoneState = await c.zone_states.findOne({ zoneId: zone.id });
    const mayAffectRanking = !!activeIncident && zoneState?.safetyState === "CRITICAL";
    const rankingBoost = !mayAffectRanking ? 0 : signal.severity === "HIGH" ? 7 : signal.severity === "MEDIUM" ? 3 : 0;

    const reportDoc = {
      id: id(),
      userId: user.id,
      rawText: text,
      provider: provider as "gemini" | "openrouter" | "deterministic",
      parsedZoneCode: signal.zoneCode,
      parsedHazard: signal.hazard as HazardType,
      estimatedSeverity: signal.severity as "LOW" | "MEDIUM" | "HIGH",
      summary: signal.summary,
      validationStatus: "ACCEPTED" as const,
      linkedIncidentId: activeIncident?.id ?? null,
      rankingBoost,
      createdAt: now,
    };
    await c.natural_language_reports.insertOne(reportDoc);
    await c.incident_events.insertOne({
      id: id(),
      incidentId: activeIncident?.id ?? null,
      zoneId: zone.id,
      eventType: "NATURAL_LANGUAGE_REPORT_ACCEPTED",
      eventSource: "NLP",
      actorUserId: user.id,
      description: `Validated natural-language report: ${signal.summary}`,
      metadata: { provider, hazard: signal.hazard, severity: signal.severity, rankingBoost },
      occurredAt: now,
    });
    await c.audits.insertOne({
      id: id(),
      type: "NATURAL_LANGUAGE_REPORT_ACCEPTED",
      zoneId: zone.id,
      incidentId: activeIncident?.id,
      actorId: user.id,
      metadata: { provider, hazard: signal.hazard, severity: signal.severity, rankingBoost },
      createdAt: now,
    });

    return NextResponse.json({
      signal,
      validated: true,
      provider,
      report_id: reportDoc.id,
      linked_incident_id: activeIncident?.id ?? null,
      ranking_boost: rankingBoost,
      advisory: rankingBoost > 0
        ? "The validated, recent, matching report adds a bounded advisory priority bonus. It cannot change live risk or issue an actuator command."
        : "The validated report is stored as advisory evidence only. It cannot change live risk or issue an actuator command.",
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.code }, { status: error.status });
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "INVALID_INPUT", message: "Report text is invalid" }, { status: 422 });
    }
    return NextResponse.json(
      { error: "NLP_VALIDATION_REJECTED", message: error instanceof Error ? error.message : "Validation failed" },
      { status: 422 },
    );
  }
}
