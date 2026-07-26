import { NextRequest, NextResponse } from "next/server";
import { acknowledge } from "@/src/server/services/incident-service";
import { assertCsrf, requireUser, AuthError } from "@/src/server/auth/session";

export async function POST(request: NextRequest, ctx: { params: Promise<{ incidentId: string }> }) {
  try {
    const user = await requireUser(["ADMIN", "SECURITY_STAFF"]);
    await assertCsrf(request);
    const { incidentId } = await ctx.params;
    return NextResponse.json({ incident: await acknowledge(incidentId, user.id) });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; status?: number; httpStatus?: number };
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : err.code || "ACKNOWLEDGMENT_FAILED", message: err.message },
      { status: e instanceof AuthError ? e.status : (err.httpStatus || 409) }
    );
  }
}

