import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
    const c = await collections();

    const incidents = await c.incidents
      .find({}, {
        projection: { _id: 0 },
        sort: { startedAt: -1 },
        limit: 200,
      })
      .toArray();

    return NextResponse.json({ incidents, count: incidents.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.code : "ERROR" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
