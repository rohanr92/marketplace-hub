import { db } from "./src/lib/db.js";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.js";
import { shopifyGraphQL } from "./src/services/shopify.js";

const shopify = await db.connection.findFirst({ where: { type: "shopify", active: true } });

// Method 1: what fetchShopifyByIdentifiers returns by barcode
const byBarcode = await fetchShopifyByIdentifiers(shopify, ["810221398691"], "barcode");
console.log(`fetchShopifyByIdentifiers (barcode) says: ${byBarcode.found[0]?.inventory}`);
console.log(`  -> matched variant: ${byBarcode.found[0]?.sku ?? "?"} / ${byBarcode.found[0]?.barcode}`);
console.log(`  -> found ${byBarcode.found.length} variants for this barcode`);

// Method 2: query Shopify DIRECTLY for this exact variant by its GID
const item = await db.catalogItem.findFirst({ where: { barcode: "810221398691" } });
const q = `query($id: ID!) { productVariant(id: $id) { sku barcode inventoryQuantity title } }`;
const data = await shopifyGraphQL(shopify, q, { id: item.shopifyVariantId });
console.log(`\nDirect query of variant ${item.shopifyVariantId.slice(-16)}:`);
console.log(`  inventoryQuantity = ${data?.productVariant?.inventoryQuantity}`);
console.log(`  barcode = ${data?.productVariant?.barcode}, title = ${data?.productVariant?.title}`);

// Method 3: does barcode 810221398691 match MULTIPLE variants? (the bug if so)
console.log("\n=== Checking if this barcode is on multiple variants ===");
console.log(`fetchShopifyByIdentifiers returned ${byBarcode.found.length} match(es):`);
for (const f of byBarcode.found) {
  console.log(`  variant sku=${f.sku} barcode=${f.barcode} inv=${f.inventory} title=${f.title}`);
}
process.exit(0);
