import { db } from "./src/lib/db.js";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.js";

// 1. What's stored in DB RIGHT NOW for Lucila 42?
const item = await db.catalogItem.findFirst({ where: { barcode: "810221398691" } });
console.log(`1. DB stored inventory: ${item.inventory}`);
console.log(`   sku field: ${item.sku}`);
console.log(`   barcode: ${item.barcode}`);

// 2. What does Shopify have live?
const shopify = await db.connection.findFirst({ where: { type: "shopify", active: true } });
const live = await fetchShopifyByIdentifiers(shopify, ["810221398691"], "barcode");
console.log(`2. Shopify live (by barcode): ${live.found[0]?.inventory}`);

// 3. Are there DUPLICATE catalog rows for this barcode? (would explain reading wrong one)
const dupes = await db.catalogItem.findMany({ where: { barcode: "810221398691" } });
console.log(`3. Number of catalog rows with barcode 810221398691: ${dupes.length}`);
for (const d of dupes) {
  console.log(`   row: inv=${d.inventory} sku=${d.sku.slice(0,45)} id=${d.id}`);
}

// 4. Is there a row where sku is the plain barcode or a different format?
const bySku = await db.catalogItem.findMany({ where: { tenantId: item.tenantId, OR: [{ sku: "810221398691" }, { title: { contains: "Lucila Ivory - 42" } }] } });
console.log(`4. Rows matching by sku=barcode OR title 'Lucila Ivory - 42': ${bySku.length}`);
for (const d of bySku) {
  console.log(`   inv=${d.inventory} sku=${d.sku.slice(0,45)} barcode=${d.barcode} title=${d.title}`);
}
process.exit(0);
