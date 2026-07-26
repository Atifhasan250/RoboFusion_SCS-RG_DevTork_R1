import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { collections } from "../db/collections";
import { token } from "../utils/id";
import type { Role, User } from "../types";

const COOKIE = "scs_session";

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: User) {
  const c = await collections();
  const session = {
    id: token(),
    userId: user.id,
    csrfToken: token(),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    createdAt: new Date(),
  };
  await c.sessions.insertOne(session);
  const jar = await cookies();
  jar.set(COOKIE, session.id, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.APP_ENV === "production",
    expires: session.expiresAt,
    path: "/",
  });
  return session;
}

export async function currentAuth() {
  const sessionId = (await cookies()).get(COOKIE)?.value;
  if (!sessionId) return null;
  const c = await collections();
  const session = await c.sessions.findOne({ id: sessionId, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await c.users.findOne({ id: session.userId, active: true });
  return user ? { session, user } : null;
}

export async function currentUser() {
  return (await currentAuth())?.user ?? null;
}

export async function requireUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) throw new AuthError(401, "AUTH_REQUIRED");
  if (roles && !roles.includes(user.role)) throw new AuthError(403, "FORBIDDEN");
  return user;
}

export class AuthError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function assertCsrf(request: Request) {
  const sessionId = (await cookies()).get(COOKIE)?.value;
  const csrf = request.headers.get("x-csrf-token");
  if (!sessionId || !csrf) throw new AuthError(403, "CSRF_REJECTED");
  const c = await collections();
  const valid = await c.sessions.findOne({
    id: sessionId,
    csrfToken: csrf,
    expiresAt: { $gt: new Date() },
  });
  if (!valid) throw new AuthError(403, "CSRF_REJECTED");
}

export async function logout() {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (value) await (await collections()).sessions.deleteOne({ id: value });
  jar.delete(COOKIE);
}
