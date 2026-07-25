import { NextResponse } from "next/server";
import { currentUser } from "@/src/server/auth/session";
export async function GET() { const user = await currentUser(); return user ? NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role }) : NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 }); }
