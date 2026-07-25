import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, logout } from "@/src/server/auth/session";
export async function POST(request: NextRequest) { try { await assertCsrf(request); await logout(); return new NextResponse(null, { status: 204 }); } catch { return NextResponse.json({ error: "CSRF_REJECTED" }, { status: 403 }); } }
