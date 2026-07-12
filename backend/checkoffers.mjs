import { db } from "./src/lib/db.js";
const conns = await db.connection.findMany({ where: { type: "mirakl" } });
for (const c of conns) {
  const total = await db.channelOffer.count({ where: { connectionId: c.id } });
  const withUpc = await db.channelOffer.count({ where: { connectionId: c.id, offerUpc: { not: null } } });
  console.log(`${c.label.padEnd(28)} offers=${total}  withUPC=${withUpc}`);
}
process.exit(0);
