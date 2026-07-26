import { NextResponse } from "next/server";
import { currentAuth } from "@/src/server/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await currentAuth();
  if (!auth) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const { user, session } = auth;
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    csrfToken: session.csrfToken,
  }, { headers: { "Cache-Control": "no-store" } });
}
