import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { dashboardSnapshot } from "@/src/server/services/dashboard-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/dashboard/snapshot - authoritative reconnect/bootstrap payload. */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(await dashboardSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthError ? error.code : "ERROR" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
