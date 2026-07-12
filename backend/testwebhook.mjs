import { db } from "./src/lib/db.js";
import { skuForInventoryItem } from "./src/services/syncEngine.js";

// Pick a real Menina SKU that exists on the marketplaces, find its Shopify inventory_item_id
const shopify = await db.connection.findFirst({ where: { type: "shopify", baseUrl: { contains: "menina" }, active: true } });
console.log("Shopify conn:", shopify.label, "\n");

// Find a catalog item with a known inventory_item_id
const items = await db.catalogItem.findMany({
  where: { tenantId: shopify.tenantId, shopifyInventoryItemId: { not: null } },
  take: 3,
  select: { sku: true, barcode: true, shopifyInventoryItemId: true, inventory: true },
});
console.log("=== Sample catalog items with inventory_item_id ===");
for (const it of items) {
  console.log(`  sku=${it.sku}  barcode=${it.barcode ?? "none"}  invItemId=${it.shopifyInventoryItemId}  stock=${it.inventory}`);
}

if (items[0]) {
  console.log(`\n=== Testing skuForInventoryItem lookup for invItemId ${items[0].shopifyInventoryItemId} ===`);
  const sku = await skuForInventoryItem(shopify.tenantId, items[0].shopifyInventoryItemId);
  console.log(`  resolved SKU: ${sku ?? "NULL - this would break propagation!"}`);
}
process.exit(0);
