import { NextResponse } from "next/server";
import { currentAuth } from "@/src/server/auth/session";

export async function GET() {
  const auth = await currentAuth();
  if (!auth) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
    },
    csrfToken: auth.session.csrfToken,
  });
}
