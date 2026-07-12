import { db } from "./src/lib/db.js";

console.log("Watching sync logs. Now go change ONE product's stock in Shopify admin.");
console.log("I'll show any new sync activity for 90 seconds...\n");

const start = new Date();
let lastSeen = start;

for (let i = 0; i < 18; i++) {  // 18 x 5s = 90s
  const logs = await db.syncLog.findMany({
    where: { createdAt: { gt: lastSeen } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  for (const l of logs) {
    console.log(`  ${l.createdAt.toISOString()} | ${l.offerSku ?? ""} | sent=${l.quantitySent ?? "-"} | ${l.status} ${l.message ?? ""}`);
    lastSeen = l.createdAt;
  }
  await new Promise(r => setTimeout(r, 5000));
}
console.log("\nDone watching. If you saw rows above, the sync fired. If empty, the webhook did NOT trigger a sync.");
process.exit(0);
