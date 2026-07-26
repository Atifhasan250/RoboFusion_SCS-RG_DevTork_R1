import { NextRequest, NextResponse } from "next/server";
import { requireUser, assertCsrf, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";
import { mongoClient } from "@/src/server/db/client";
import { id } from "@/src/server/utils/id";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ zoneCode: string }> }) {
  try {
    const user = await requireUser();
    const { zoneCode } = await ctx.params;
    const c = await collections();
    const zone = await c.zones.findOne({ code: zoneCode }, { projection: { _id: 0, apiKeyHash: 0 } });
    if (!zone) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const readings = user.role === "ADMIN"
      ? await c.readings.find({ zoneId: zone.id }, { projection: { _id: 0 } }).sort({ observedAt: -1 }).limit(50).toArray()
      : [];
    return NextResponse.json({ zone, readings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthError ? error.code : "ERROR" }, { status: error instanceof AuthError ? error.status : 500 });
  }
}

/**
 * DELETE archives a zone instead of physically deleting historical references.
 * The transaction conflicts safely with concurrent ingestion, and a zone with an
 * active incident cannot be archived.
 */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ zoneCode: string }> }) {
  try {
    const user = await requireUser(["ADMIN"]);
    await assertCsrf(request);
    const { zoneCode } = await ctx.params;
    const c = await collections();
    const client = await mongoClient();
    const session = client.startSession();
    let archived = false;

    try {
      await session.withTransaction(async () => {
        const zone = await c.zones.findOne({ code: zoneCode }, { session });
        if (!zone) throw Object.assign(new Error("Zone not found"), { httpStatus: 404, code: "NOT_FOUND" });
        if (!zone.configured) throw Object.assign(new Error("Zone is already archived"), { httpStatus: 409, code: "ALREADY_ARCHIVED" });
        if (await c.incidents.findOne({ zoneId: zone.id, active: true }, { session })) {
          throw Object.assign(new Error("Zone has an active incident"), { httpStatus: 409, code: "CANNOT_ARCHIVE_ACTIVE_INCIDENT" });
        }

        const now = new Date();
        const zoneUpdate = await c.zones.updateOne(
          { id: zone.id, configured: true },
          { $set: { configured: false, connectivityState: "NOT_CONFIGURED", updatedAt: now } },
          { session },
        );
        if (zoneUpdate.matchedCount !== 1) {
          throw Object.assign(new Error("Zone changed concurrently"), { httpStatus: 409, code: "ARCHIVE_CONFLICT" });
        }
        await c.zone_states.updateOne(
          { zoneId: zone.id },
          { $set: { connectivityState: "NOT_CONFIGURED", updatedAt: now } },
          { session },
        );
        await c.sensors.updateMany(
          { zoneId: zone.id },
          { $set: { status: "NOT_CONFIGURED", isEnabled: false, updatedAt: now } },
          { session },
        );
        await c.audits.insertOne({
          id: id(),
          type: "ZONE_ARCHIVED",
          zoneId: zone.id,
          actorId: user.id,
          metadata: { zoneCode },
          createdAt: now,
        }, { session });
        archived = true;
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({ archived, zone_code: zoneCode });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : (error as { httpStatus?: number }).httpStatus ?? 500;
    const code = error instanceof AuthError ? error.code : (error as { code?: string }).code ?? "ERROR";
    return NextResponse.json(
      { error: code, message: error instanceof Error ? error.message : undefined },
      { status },
    );
  }
}
