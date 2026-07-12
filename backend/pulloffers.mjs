import { db } from "./src/lib/db.js";
import { fetchMiraklOffers } from "./src/services/mirakl.js";

const conns = await db.connection.findMany({ where: { type: "mirakl", active: true } });
for (const conn of conns) {
  console.log(`\nPulling offers for ${conn.label}...`);
  try {
    const offers = await fetchMiraklOffers(conn);
    let upcCount = 0;
    for (const o of offers) {
      if (o.offerUpc) upcCount++;
      await db.channelOffer.upsert({
        where: { connectionId_offerSku: { connectionId: conn.id, offerSku: o.offerSku } },
        create: { tenantId: conn.tenantId, connectionId: conn.id, offerSku: o.offerSku, offerUpc: o.offerUpc, title: o.title },
        update: { offerUpc: o.offerUpc, title: o.title },
      });
    }
    console.log(`  ${conn.label}: pulled ${offers.length} offers, ${upcCount} with UPC`);
  } catch (e) {
    console.log(`  ${conn.label}: FAILED - ${e.message}`);
  }
}
process.exit(0);
