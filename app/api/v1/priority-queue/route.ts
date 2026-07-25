import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { priorityQueue } from "@/src/server/services/incident-service";
export async function GET() { try { await requireUser(); return NextResponse.json({ queue: await priorityQueue() }); } catch (e) { return NextResponse.json({ error: e instanceof AuthError ? e.code : "ERROR" }, { status: e instanceof AuthError ? e.status : 500 }); } }
