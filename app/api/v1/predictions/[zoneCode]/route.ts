import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/src/server/auth/session";
import { collections } from "@/src/server/db/collections";
import { calculateZonePrediction } from "@/src/server/services/prediction-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ zoneCode: string }> }) {
  try {
    await requireUser();
    const { zoneCode } = await ctx.params;
    const c = await collections();
    const zone = await c.zones.findOne({ code: zoneCode, configured: true });
    if (!zone) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const persist = new URL(request.url).searchParams.get("persist") === "true";
    const result = await calculateZonePrediction(zone.id, persist);
    if (!result) return NextResponse.json({ error: "NO_DATA" }, { status: 404 });

    return NextResponse.json({
      prediction: result,
      safety: "Predicted Risk is advisory only and can never issue a relay, buzzer or LED command.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthError ? error.code : "ERROR" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
