import { NextResponse } from "next/server";
import { db } from "@/src/server/db/client";
import { modelReady } from "@/src/server/ml/inference";

export async function GET() {
  try {
    await (await db()).command({ ping: 1 });
    const model = await modelReady();
    return NextResponse.json({
      status: "ready",
      database: "healthy",
      websocket: "in_process_gateway",
      ml_model: model,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "not_ready", database: "unhealthy_or_model_missing", message: error instanceof Error ? error.message : undefined },
      { status: 503 },
    );
  }
}
