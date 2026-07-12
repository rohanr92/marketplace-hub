import { db } from "./src/lib/db.js";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.js";
import { refreshCatalogFromShopify } from "./src/services/syncEngine.js";

const shopify = await db.connection.findFirst({ where: { type: "shopify", active: true } });

// 1. What does Shopify LIVE have for Lucila 42 right now?
const live = await fetchShopifyByIdentifiers(shopify, ["810221398691"], "barcode");
console.log(`1. Shopify LIVE stock for Lucila 42 (barcode): ${live.found[0]?.inventory ?? "NOT FOUND BY BARCODE"}`);

// 2. What's stored in DB now?
const before = await db.catalogItem.findFirst({ where: { barcode: "810221398691" } });
console.log(`2. DB stored before refresh: ${before.inventory}  (sku=${before.sku.slice(0,40)})`);

// 3. Run refresh, check after
await refreshCatalogFromShopify(before.tenantId, [before.sku]);
const after = await db.catalogItem.findFirst({ where: { barcode: "810221398691" } });
console.log(`3. DB stored AFTER refresh: ${after.inventory}`);

console.log(`\nShopify=${live.found[0]?.inventory}, DB after refresh=${after.inventory}`);
console.log(live.found[0]?.inventory === after.inventory ? "MATCH - refresh works" : "MISMATCH - refresh is NOT pulling live Shopify stock");
process.exit(0);
