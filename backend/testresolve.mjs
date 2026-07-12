import { db } from "./src/lib/db.js";
import { skuForInventoryItem } from "./src/services/syncEngine.js";

const shopify = await db.connection.findFirst({ where: { type: "shopify", baseUrl: { contains: "menina" }, active: true } });

// Get a real inventory_item_id from a catalog item, test if it resolves back to a SKU
const item = await db.catalogItem.findFirst({ where: { tenantId: shopify.tenantId, source: "shopify" } });
console.log("Testing with catalog item:", item?.sku, "shopifyVariantId:", item?.shopifyVariantId);

// The webhook receives inventory_item_id. Does skuForInventoryItem resolve it?
// We need a real inventory_item_id - let's pull one from Shopify for this SKU
import { shopifyGraphQL } from "./src/services/shopify.js";
const q = `query { productVariants(first: 3) { nodes { sku inventoryItem { id } } } }`;
const data = await shopifyGraphQL(shopify, q, {});
console.log("\n=== Real Shopify variants + their inventory_item_ids ===");
for (const v of (data?.productVariants?.nodes ?? [])) {
  const invId = v.inventoryItem?.id?.split("/").pop();
  console.log(`  sku=${v.sku}  inventoryItemId=${invId}`);
  if (invId) {
    const resolved = await skuForInventoryItem(shopify.tenantId, invId);
    console.log(`     -> skuForInventoryItem returned: ${resolved ?? "NULL (this forces FULL sync!)"}`);
  }
}
process.exit(0);
