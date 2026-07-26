import "dotenv/config";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { env } from "../src/server/config/env";

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const directory = path.resolve("backups");
mkdirSync(directory, { recursive: true });
const archive = path.join(directory, `${env.MONGODB_DB}-${stamp}.archive.gz`);
const result = spawnSync("mongodump", [
  `--uri=${env.MONGODB_URI}`,
  `--db=${env.MONGODB_DB}`,
  `--archive=${archive}`,
  "--gzip",
], { stdio: "inherit", shell: process.platform === "win32" });
if (result.error) {
  console.error("mongodump could not start. Install MongoDB Database Tools and ensure mongodump is on PATH.");
  throw result.error;
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Backup created: ${archive}`);
