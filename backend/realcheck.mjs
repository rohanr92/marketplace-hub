import { db } from "./src/lib/db.js";

// Find ALL tables that might hold offers - check counts properly
const conns = await db.connection.findMany({ where: { type: "mirakl" } });
for (const c of conns) {
  const offers = await db.channelOffer.findMany({ where: { connectionId: c.id }, take: 3 });
  const count = await db.channelOffer.count({ where: { connectionId: c.id } });
  console.log(`\n${c.label}: ${count} offers in channelOffer`);
  for (const o of offers) console.log(`   sku=${o.offerSku} upc=${o.offerUpc} catalogItemId=${o.catalogItemId ?? "unmatched"}`);
}

// Check recent sync logs to see if pushes are happening/failing
console.log("\n=== RECENT SYNC LOGS ===");
const logs = await db.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []);
for (const l of logs) console.log(`  ${l.createdAt?.toISOString?.() ?? ""} ${l.channel ?? ""} ${l.status ?? ""} ${l.message ?? ""}`);
process.exit(0);
