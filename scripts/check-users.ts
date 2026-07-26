import "dotenv/config";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

async function main() {
  const uri = process.env.MONGODB_URI!;
  const dbName = process.env.MONGODB_DB ?? "robofusion";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const users = await db.collection("users").find(
    {},
    { projection: { email: 1, role: 1, active: 1, passwordHash: 1, _id: 0 } }
  ).toArray();

  console.log(`\nFound ${users.length} user(s) in DB:\n`);
  for (const u of users) {
    const match = await bcrypt.compare("scs-grid", u.passwordHash ?? "");
    console.log(`  email: ${u.email}`);
    console.log(`  role: ${u.role}`);
    console.log(`  active: ${u.active}`);
    console.log(`  passwordHash exists: ${!!u.passwordHash}`);
    console.log(`  "scs-grid" matches hash: ${match}`);
    console.log();
  }

  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
