import { db } from "./src/lib/db.js";
import { fetchMiraklOrderById, fetchOfferUpcByProductSku } from "./src/services/mirakl.js";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.js";

const shopifyConn = await db.connection.findFirst({ where: { type: "shopify", active: true } });

// One order to test per marketplace (the ones that were failing)
const tests = [
  ["Nordstrom", "1049076950-50000-A"],  // LUCI-IVO-W42, needs offer-UPC
  ["Macys",     "4743239045-B"],         // GRT-BLK-39, needs UPC prefix
  ["Kohls",     "6705884551_1-A"],       // needs product_sku as barcode/sku
];

// Replicate the exact matching logic from orderPush
async function resolveLine(miraklConn, l) {
  const sku = (l.offer_sku ?? l.product_shop_sku ?? l.product_sku ?? "").trim();
  let variantId = null;
  if (sku) { const b = await fetchShopifyByIdentifiers(shopifyConn, [sku], "sku"); if (b.found[0]) return `SKU ${sku} -> ${b.found[0].shopifyVariantId}`; }
  const candidates = [];
  const refs = l.product_references ?? [];
  const refUpc = refs.find(r => /UPC|EAN|GTIN|UID_CODE/i.test(r.reference_type ?? r.type ?? ""))?.reference;
  if (refUpc) candidates.push(String(refUpc).trim());
  if (l.product_sku && String(l.product_sku).includes("_")) candidates.push(String(l.product_sku).split("_")[0].trim());
  if (l.product_sku && !String(l.product_sku).includes("_")) candidates.push(String(l.product_sku).trim());
  for (const upc of candidates) { const b = await fetchShopifyByIdentifiers(shopifyConn, [upc], "barcode"); if (b.found[0]) return `barcode ${upc} -> ${b.found[0].shopifyVariantId}`; }
  if (l.product_sku) {
    const offerUpc = await fetchOfferUpcByProductSku(miraklConn, String(l.product_sku).trim());
    if (offerUpc) { const b = await fetchShopifyByIdentifiers(shopifyConn, [offerUpc], "barcode"); if (b.found[0]) return `offer-UPC ${offerUpc} -> ${b.found[0].shopifyVariantId}`; }
  }
  return `NO MATCH (sku=${sku}, product_sku=${l.product_sku})`;
}

for (const [name, oid] of tests) {
  const conn = await db.connection.findFirst({ where: { type: "mirakl", baseUrl: { contains: name.toLowerCase().replace("'","") } } });
  if (!conn) { console.log(`${name}: connection not found`); continue; }
  const raw = await fetchMiraklOrderById(conn, oid);
  if (!raw) { console.log(`${name} ${oid}: order not found`); continue; }
  console.log(`\n=== ${name} ${oid} (${raw.order_state}) ===`);
  for (const l of (raw.order_lines ?? [])) {
    const result = await resolveLine(conn, l);
    console.log(`  ${result}`);
  }
}
process.exit(0);
