import "dotenv/config";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { env } from "../src/server/config/env";

const archive = process.argv[2];
const targetDb = process.env.RESTORE_TARGET_DB;
if (!archive || !existsSync(archive)) {
  throw new Error("Usage: RESTORE_TARGET_DB=robofusion_restore_test npm run db:restore -- backups/file.archive.gz");
}
if (!targetDb?.endsWith("_test")) {
  throw new Error("Safety stop: RESTORE_TARGET_DB must be set and end with _test. Main/demo DB restore is intentionally blocked.");
}
const result = spawnSync("mongorestore", [
  `--uri=${env.MONGODB_URI}`,
  `--archive=${archive}`,
  "--gzip",
  "--drop",
  `--nsFrom=${env.MONGODB_DB}.*`,
  `--nsTo=${targetDb}.*`,
], { stdio: "inherit", shell: process.platform === "win32" });
if (result.error) {
  console.error("mongorestore could not start. Install MongoDB Database Tools and ensure mongorestore is on PATH.");
  throw result.error;
}
process.exit(result.status ?? 1);
