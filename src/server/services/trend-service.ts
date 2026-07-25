import { collections } from "../db/collections";

export async function riskTrend(zoneId: string) {
  const readings = await (await collections()).readings.find({ zoneId }).sort({ observedAt: -1 }).limit(8).toArray();
  
  if (readings.length < 5) return { status: "INSUFFICIENT_DATA", slope: 0, window: readings.length };
  
  const ordered = [...readings].reverse();
  const n = ordered.length;
  const meanX = (n - 1) / 2;
  const meanY = ordered.reduce((s, r) => s + r.riskScore, 0) / n;
  
  let top = 0, bottom = 0;
  ordered.forEach((r, i) => {
    top += (i - meanX) * (r.riskScore - meanY);
    bottom += (i - meanX) ** 2;
  });
  
  const slope = bottom ? top / bottom : 0;
  const latestRisk = ordered.at(-1)!.riskScore;
  
  let status = "STABLE";
  if (slope >= 3) {
    // If the risk is elevated but not yet critical, flag it as trending toward critical
    if (latestRisk >= 40 && latestRisk < 65) {
      status = "TRENDING_TOWARD_CRITICAL";
    } else {
      status = "RISING";
    }
  } else if (slope <= -3) {
    status = "FALLING";
  }
  
  return {
    status,
    slope: Math.round(slope * 100) / 100,
    window: n,
    latestRisk
  };
}
