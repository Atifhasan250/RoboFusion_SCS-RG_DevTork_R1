import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/src/server/validation/schemas";
import { collections } from "@/src/server/db/collections";
import { createSession, verifyPassword } from "@/src/server/auth/session";
import { loginLimiter } from "@/src/server/utils/rate-limiter";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Rate limiting: key by IP (X-Forwarded-For or remote addr)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";

  if (!loginLimiter.allow(ip)) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many login attempts. Please wait 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  try {
    const input = loginSchema.parse(await request.json());
    const c = await collections();
    const user = await c.users.findOne({ email: input.email.toLowerCase(), active: true });

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS", message: "Email or password is incorrect" }, { status: 401 });
    }

    // Update last login time
    await c.users.updateOne({ id: user.id }, { $set: { lastLoginAt: new Date() } });

    const session = await createSession(user);
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      csrfToken: session.csrfToken,
    });
  } catch (error) {
    console.error("[login] unexpected error:", error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : error);
    return NextResponse.json({ error: "INVALID_LOGIN", message: "Invalid request" }, { status: 422 });
  }
}
