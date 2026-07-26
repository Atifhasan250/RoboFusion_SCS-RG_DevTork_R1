import "dotenv/config";
import { mongoClient } from "../src/server/db/client";
import { collections } from "../src/server/db/collections";
import { id } from "../src/server/utils/id";

async function main() {
  const c = await collections();
  const client = await mongoClient();
  const session = client.startSession();
  const probeId = id();
  try {
    await session.withTransaction(async () => {
      await c.audits.insertOne({ id: probeId, type: "TRANSACTION_PROBE", createdAt: new Date() }, { session });
      const found = await c.audits.findOne({ id: probeId }, { session });
      if (!found) throw new Error("Transaction probe was not visible inside its transaction");
    });
    const committed = await c.audits.findOne({ id: probeId });
    if (!committed) throw new Error("Transaction probe did not commit");
    await c.audits.deleteOne({ id: probeId });
    console.log("✓ MongoDB multi-document transaction support verified.");
  } finally {
    await session.endSession();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
