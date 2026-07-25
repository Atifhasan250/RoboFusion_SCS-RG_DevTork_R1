import { NextRequest, NextResponse } from "next/server";
import { acknowledge } from "@/src/server/services/incident-service";
import { assertCsrf, requireUser, AuthError } from "@/src/server/auth/session";
export async function POST(request: NextRequest, ctx: { params: Promise<{ incidentId: string }> }) { try { const user = await requireUser(["ADMIN", "SECURITY_STAFF"]); await assertCsrf(request); const { incidentId } = await ctx.params; return NextResponse.json({ incident: await acknowledge(incidentId, user.id) }); } catch (e) { return NextResponse.json({ error: e instanceof AuthError ? e.code : "ACKNOWLEDGMENT_FAILED", message: e instanceof Error ? e.message : undefined }, { status: e instanceof AuthError ? e.status : 409 }); } }
