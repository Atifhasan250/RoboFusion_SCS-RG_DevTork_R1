import { NextRequest, NextResponse } from "next/server";
import { requireUser, assertCsrf, AuthError } from "@/src/server/auth/session";
import { parseIncidentNote } from "@/src/server/services/ai-service";
import { collections } from "@/src/server/db/collections";
import { nlpLimiter } from "@/src/server/utils/rate-limiter";
import { id } from "@/src/server/utils/id";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    await assertCsrf(request);

    if (!nlpLimiter.allow(user.id)) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Too many report submissions. Please wait." },
        { status: 429 }
      );
    }

    const body = await request.json() as { text?: string };
    const text = body?.text;
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Report text must be at least 5 characters" },
        { status: 422 }
      );
    }

    const { signal, provider } = await parseIncidentNote(text);
    const c = await collections();

    // Persist the NLP report
    const reportDoc = {
      id: id(),
      userId: user.id,
      rawText: text,
      provider: provider as "gemini" | "openrouter" | "deterministic",
      parsedZoneCode: signal.zoneCode,
      parsedHazard: signal.hazard as import("@/src/server/types").HazardType,
      estimatedSeverity: signal.severity as "LOW" | "MEDIUM" | "HIGH",
      summary: signal.summary,
      validationStatus: "ACCEPTED" as const,
      createdAt: new Date(),
    };
    await c.natural_language_reports.insertOne(reportDoc);

    await c.audits.insertOne({
      id: id(), type: "NATURAL_LANGUAGE_REPORT_ACCEPTED",
      actorId: user.id, metadata: { provider, zoneCode: signal.zoneCode, hazard: signal.hazard }, createdAt: new Date(),
    });

    return NextResponse.json({
      signal,
      validated: true,
      provider,
      report_id: reportDoc.id,
      advisory: "Validated report is advisory only. It cannot trigger an actuator or override sensor state.",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json(
      { error: "NLP_VALIDATION_REJECTED", message: e instanceof Error ? e.message : "Validation failed" },
      { status: 422 }
    );
  }
}
