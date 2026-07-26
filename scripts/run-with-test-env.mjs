import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { config } from "dotenv";

if (!existsSync(".env.test")) {
  console.error("Missing .env.test. Copy .env.test.example and configure the Atlas test database first.");
  process.exit(1);
}
config({ path: ".env.test", override: true });
if (!process.env.MONGODB_DB?.endsWith("_test")) {
  console.error("Safety stop: MONGODB_DB in .env.test must end with '_test'.");
  process.exit(1);
}
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/run-with-test-env.mjs <command> [...args]");
  process.exit(1);
}
const child = spawn(command, args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
child.on("exit", code => process.exit(code ?? 1));
