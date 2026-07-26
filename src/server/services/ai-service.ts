import { z } from "zod";
import { env } from "../config/env";
import { noteSchema } from "../validation/schemas";
import { log } from "../utils/logger";

const signalSchema = z.object({
  zoneCode: z.enum(["IOT_LAB", "ROBOTICS_LAB", "SERVER_ROOM", "DATA_SCIENCE_LAB", "SOFTWARE_LAB"]),
  hazard: z.enum(["FIRE", "GAS", "FLOOD", "OCCUPANCY"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  summary: z.string().min(1).max(300),
});

const prompt = (text: string) =>
  `Extract an incident report. Return JSON only with these exact fields:
- zoneCode: one of IOT_LAB, ROBOTICS_LAB, SERVER_ROOM, DATA_SCIENCE_LAB, SOFTWARE_LAB
- hazard: one of FIRE, GAS, FLOOD, OCCUPANCY
- severity: one of LOW, MEDIUM, HIGH
- summary: concise description (max 200 chars)

Report: ${text}`;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(text: string): Promise<z.infer<typeof signalSchema>> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_NOT_CONFIGURED");
  const r = await withTimeout(async (signal) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt(text) }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal
      }
    );
    if (!res.ok) throw new Error(`GEMINI_${res.status}`);
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
  }, env.AI_TIMEOUT_MS);
  return signalSchema.parse(r);
}

async function callOpenRouter(text: string): Promise<z.infer<typeof signalSchema>> {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_NOT_CONFIGURED");
  const r = await withTimeout(async (signal) => {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENROUTER_PRIMARY_MODEL,
        messages: [{ role: "user", content: prompt(text) }],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      signal
    });
    if (!res.ok) throw new Error(`OPENROUTER_${res.status}`);
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  }, env.AI_TIMEOUT_MS);
  return signalSchema.parse(r);
}

function deterministicParse(text: string): z.infer<typeof signalSchema> {
  const zoneCode =
    /server/i.test(text) ? "SERVER_ROOM"
    : /robot/i.test(text) ? "ROBOTICS_LAB"
    : /data.science/i.test(text) ? "DATA_SCIENCE_LAB"
    : /software/i.test(text) ? "SOFTWARE_LAB"
    : /iot/i.test(text) ? "IOT_LAB"
    : "UNKNOWN";
  const hazard =
    /gas|smell|fume|carbon/i.test(text) ? "GAS"
    : /water|leak|flood|wet/i.test(text) ? "FLOOD"
    : /fire|smoke|flame|burn/i.test(text) ? "FIRE"
    : /occupancy|person|people|intruder/i.test(text) ? "OCCUPANCY"
    : "UNKNOWN";
  const severity =
    /urgent|strong|heavy|critical|emergency/i.test(text) ? "HIGH"
    : /moderate|medium|some|possible/i.test(text) ? "MEDIUM"
    : "LOW";
  return { zoneCode: zoneCode as any, hazard: hazard as any, severity, summary: text.slice(0, 200).trim() };
}

export async function parseIncidentNote(text: string): Promise<{ signal: z.infer<typeof signalSchema>; provider: string }> {
  noteSchema.parse({ text });

  const providers: Array<[string, (t: string) => Promise<z.infer<typeof signalSchema>>]> = [
    ["gemini", callGemini],
    ["openrouter", callOpenRouter],
  ];

  for (const [name, call] of providers) {
    try {
      const signal = await call(text);
      
      const { collections } = await import("../db/collections");
      const c = await collections();
      const zoneExists = await c.zones.findOne({ code: signal.zoneCode, configured: true });
      if (!zoneExists) {
        throw new Error("INVALID_ZONE_CODE");
      }

      log("NLP_VALIDATED", { provider: name, status: "accepted" });
      return { signal, provider: name };
    } catch (error) {
      log("NLP_PROVIDER_FAILED", { provider: name, error_code: error instanceof Error ? error.message : "unknown" });
    }
  }

  // Deterministic fallback — never throws
  const signal = deterministicParse(text);
  if (signal.zoneCode as string === "UNKNOWN" || signal.hazard as string === "UNKNOWN") {
    throw new Error("AMBIGUOUS_REPORT");
  }
  const { collections } = await import("../db/collections");
  const c = await collections();
  const zoneExists = await c.zones.findOne({ code: signal.zoneCode, configured: true });
  if (!zoneExists) {
    throw new Error("INVALID_ZONE_CODE");
  }

  log("NLP_VALIDATED", { provider: "deterministic", status: "accepted" });
  return { signal, provider: "deterministic" };
}
