import { db } from "./src/lib/db.js";

console.log("Watching for 90 seconds. Change TWO products' stock in Shopify now.\n");
console.log("Each burst of sync activity is grouped so you can see if it's SURGICAL (few items) or FULL (hundreds).\n");

let lastSeen = new Date();
const bursts = [];

for (let i = 0; i < 18; i++) {
  const logs = await db.syncLog.findMany({
    where: { createdAt: { gt: lastSeen } },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  if (logs.length) {
    lastSeen = logs[logs.length - 1].createdAt;
    // group by the second they fired in (a burst)
    const bySecond = {};
    for (const l of logs) {
      const key = l.createdAt.toISOString().slice(0, 19);
      (bySecond[key] ??= []).push(l);
    }
    for (const [sec, rows] of Object.entries(bySecond)) {
      const uniqueSkus = new Set(rows.map(r => r.offerSku));
      const label = uniqueSkus.size > 20 ? "*** FULL CATALOG SYNC (scheduled reconcile) ***" : ">>> SURGICAL (your change)";
      console.log(`\n[${sec}] ${rows.length} rows, ${uniqueSkus.size} unique SKUs  ${label}`);
      if (uniqueSkus.size <= 20) {
        for (const sku of uniqueSkus) console.log(`      ${sku}`);
      }
    }
  }
  await new Promise(r => setTimeout(r, 5000));
}
console.log("\n=== Done. ===");
console.log("If your 2 changes showed as SURGICAL bursts with just those SKUs -> one change syncs ONLY that item (correct).");
console.log("If changing 2 items produced a FULL CATALOG SYNC -> that's the bug you suspected.");
process.exit(0);
