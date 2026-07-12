import { db } from "./src/lib/db.js";
import { fetchMiraklOrderById } from "./src/services/mirakl.js";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.js";

const FIVE = ["1049076950-50000-A","1049047560-50000-A","1048969997-50000-A","1048855066-50000-A","1048813210-50000-A"];

const nordstrom = await db.connection.findFirst({ where: { type: "mirakl", baseUrl: { contains: "nordstrom" } } });
const shopify = await db.connection.findFirst({ where: { type: "shopify", active: true } });
console.log("Nordstrom conn:", nordstrom?.label, "| Shopify conn:", shopify?.label, "\n");

for (const oid of FIVE) {
  const order = await db.order.findFirst({ where: { channelOrderId: oid } });
  if (!order) { console.log(`${oid}: NOT IN DB`); continue; }
  const raw = await fetchMiraklOrderById(nordstrom, oid);
  console.log(`\n=== ${oid} ===`);
  console.log(`  hub state=${order.state} rawState=${order.rawState} shopifyId=${order.shopifyOrderId ?? "none"}`);
  console.log(`  Mirakl state=${raw?.order_state}`);
  for (const l of (raw?.order_lines ?? [])) {
    const sku = l.offer_sku ?? l.product_sku ?? "";
    const refs = l.product_references ?? [];
    const upc = refs.find(r => /UPC|EAN|GTIN/i.test(r.reference_type ?? r.type ?? ""))?.reference;
    let match = "NO MATCH";
    if (sku) { const b = await fetchShopifyByIdentifiers(shopify, [sku], "sku"); if (b.found[0]) match = `sku->variant ${b.found[0].shopifyVariantId}`; }
    if (match==="NO MATCH" && upc) { const b = await fetchShopifyByIdentifiers(shopify, [upc], "barcode"); if (b.found[0]) match = `upc->variant ${b.found[0].shopifyVariantId}`; }
    console.log(`    line: sku="${sku}" upc="${upc ?? "none"}" -> ${match}`);
  }
}
process.exit(0);
