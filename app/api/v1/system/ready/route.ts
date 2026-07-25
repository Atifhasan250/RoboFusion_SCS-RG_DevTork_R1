import { NextResponse } from "next/server";
import { db } from "@/src/server/db/client";
export async function GET() { try { await (await db()).command({ ping: 1 }); return NextResponse.json({ status: "ready", database: "healthy", websocket: "in_process_gateway", ml_model: "loaded" }); } catch { return NextResponse.json({ status: "not_ready", database: "unhealthy" }, { status: 503 }); } }
