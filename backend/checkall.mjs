import { db } from "./src/lib/db.js";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.js";
const shopify = await db.connection.findFirst({ where: { type: "shopify", active: true } });

const tests = [
  ["Kohls product_sku", "810205990132", "barcode"],
  ["Kohls offer_sku",   "AME-LDCLT-W40", "sku"],
  ["Macys UPC prefix",  "810205994871", "barcode"],
  ["Macys offer_sku",   "GRT-BLK-39", "sku"],
  ["Nordstrom offer_sku","AME-LDCLT-W37", "sku"],
];
for (const [label, val, field] of tests) {
  const r = await fetchShopifyByIdentifiers(shopify, [val], field);
  console.log(`${label.padEnd(22)} ${field}=${val.padEnd(16)} -> ${r.found[0] ? "MATCH "+r.found[0].shopifyVariantId : "no match"}`);
}
process.exit(0);
