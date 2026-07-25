import { NextRequest, NextResponse } from "next/server";
import { readingSchema } from "@/src/server/validation/schemas";
import { ingest, IngestionError } from "@/src/server/services/ingestion-service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ zoneCode: string }> }
) {
  try {
    const { zoneCode } = await ctx.params;
    const body = await request.json();
    const payload = readingSchema.parse(body);
    const result = await ingest(zoneCode, request.headers.get("x-zone-api-key"), payload);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof IngestionError) {
      return NextResponse.json(
        { accepted: false, error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    // Zod validation error
    if (error && typeof error === "object" && "issues" in error) {
      const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
      return NextResponse.json(
        {
          accepted: false,
          error: {
            code: "INVALID_READING",
            field: issues[0]?.path.join("."),
            message: issues[0]?.message ?? "Payload validation failed",
          },
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { accepted: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
