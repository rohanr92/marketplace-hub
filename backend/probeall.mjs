import { db } from "./src/lib/db.js";
import { decrypt } from "./src/lib/crypto.js";

const conns = await db.connection.findMany({ where: { type: "mirakl", active: true } });

for (const conn of conns) {
  console.log(`\n\n========== ${conn.label} (${conn.baseUrl}) ==========`);
  const apiKey = decrypt(conn.apiKeyEnc);

  // Fetch 2 recent orders
  const res = await fetch(`${conn.baseUrl}/api/orders?max=2`, { headers: { Authorization: apiKey, Accept: "application/json" } });
  if (!res.ok) { console.log(`  orders fetch failed: HTTP ${res.status}`); continue; }
  const data = await res.json();
  const orders = data.orders ?? [];
  if (!orders.length) { console.log("  no orders"); continue; }

  for (const o of orders.slice(0, 2)) {
    console.log(`\n  --- Order ${o.order_id} (state ${o.order_state}) ---`);
    for (const l of (o.order_lines ?? []).slice(0, 2)) {
      // show the SKU/identifier fields on the ORDER LINE
      console.log(`    LINE FIELDS:`);
      console.log(`      offer_sku       = ${l.offer_sku ?? "(none)"}`);
      console.log(`      product_shop_sku= ${l.product_shop_sku ?? "(none)"}`);
      console.log(`      product_sku     = ${l.product_sku ?? "(none)"}`);
      console.log(`      product_references (order line) = ${JSON.stringify(l.product_references ?? [])}`);

      // now fetch the OFFER for this product_sku to see if UPC is there
      if (l.product_sku) {
        const ores = await fetch(`${conn.baseUrl}/api/offers?product_id=${encodeURIComponent(l.product_sku)}&max=2`, { headers: { Authorization: apiKey, Accept: "application/json" } });
        if (ores.ok) {
          const od = await ores.json();
          const offer = (od.offers ?? [])[0];
          if (offer) {
            console.log(`    OFFER FIELDS (for product_sku ${l.product_sku}):`);
            console.log(`      shop_sku        = ${offer.shop_sku ?? "(none)"}`);
            console.log(`      product_references (offer) = ${JSON.stringify(offer.product_references ?? [])}`);
          } else {
            console.log(`    OFFER: none found for ${l.product_sku}`);
          }
        } else {
          console.log(`    OFFER fetch failed: HTTP ${ores.status}`);
        }
      }
      await new Promise(r => setTimeout(r, 200)); // gentle pacing
    }
  }
}
process.exit(0);
