import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";
export async function GET() { try { await requireUser(); const zones = await (await collections()).zones.find({ configured: true }, { projection: { _id: 0, apiKeyHash: 0 } }).sort({ code: 1 }).toArray(); return NextResponse.json({ zones }); } catch (e) { return NextResponse.json({ error: e instanceof AuthError ? e.code : "ERROR" }, { status: e instanceof AuthError ? e.status : 500 }); } }
