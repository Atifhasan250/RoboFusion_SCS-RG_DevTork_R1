import { randomBytes, createHash, timingSafeEqual } from "crypto";
export const id = () => crypto.randomUUID();
export const token = () => randomBytes(32).toString("base64url");
export const hashSecret = (value: string, pepper: string) => createHash("sha256").update(`${pepper}:${value}`).digest("hex");
export const safeEqual = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
