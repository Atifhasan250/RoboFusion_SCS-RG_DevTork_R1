import { Db, MongoClient } from "mongodb";
import { env } from "../config/env";
declare global { var mongoClientPromise: Promise<MongoClient> | undefined; }
const client = global.mongoClientPromise ?? new MongoClient(env.MONGODB_URI).connect();
if (env.APP_ENV !== "production") global.mongoClientPromise = client;
export async function db(): Promise<Db> { return (await client).db(env.MONGODB_DB); }
export async function mongoClient() { return client; }
