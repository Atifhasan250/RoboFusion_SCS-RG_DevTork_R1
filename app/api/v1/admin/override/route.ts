import { NextRequest, NextResponse } from "next/server";
import { requireUser, assertCsrf, AuthError } from "@/src/server/auth/session";
import { overrideSchema } from "@/src/server/validation/schemas";
import { applyOverride, clearOverride } from "@/src/server/services/override-service";
import { overrideLimiter } from "@/src/server/utils/rate-limiter";

export const runtime = "nodejs";

/** POST /api/v1/admin/override — Apply a manual override */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(["ADMIN"]);
    await assertCsrf(request);

    if (!overrideLimiter.allow(user.id)) {
      return NextResponse.json({ error: "RATE_LIMITED", message: "Too many override attempts" }, { status: 429 });
    }

    const input = overrideSchema.parse(await request.json());
    const result = await applyOverride(input, user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : "INVALID_OVERRIDE", message: e instanceof Error ? e.message : undefined },
      { status: e instanceof AuthError ? e.status : (e as { httpStatus?: number }).httpStatus ?? 422 }
    );
  }
}

/** DELETE /api/v1/admin/override?zone=ZONE_CODE — Clear a manual override */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(["ADMIN"]);
    await assertCsrf(request);
    const zoneCode = request.nextUrl.searchParams.get("zone");
    if (!zoneCode) return NextResponse.json({ error: "MISSING_ZONE" }, { status: 422 });
    const result = await clearOverride(zoneCode, user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : "ERROR", message: e instanceof Error ? e.message : undefined },
      { status: e instanceof AuthError ? e.status : (e as { httpStatus?: number }).httpStatus ?? 500 }
    );
  }
}
