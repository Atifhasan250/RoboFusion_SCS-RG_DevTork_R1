import { env } from "../config/env";

export function assertTestDatabase() {
  if (!env.MONGODB_DB.endsWith("_test")) {
    throw new Error(`Destructive integration tests are blocked for database '${env.MONGODB_DB}'. Use a database name ending in _test.`);
  }
}
