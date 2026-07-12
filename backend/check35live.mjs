import { db } from "./src/lib/db.js";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.js";
import { refreshCatalogFromShopify } from "./src/services/syncEngine.js";

const shopify = await db.connection.findFirst({ where: { type: "shopify", active: true } });

// Size 35 - what does Shopify actually have?
const live = await fetchShopifyByIdentifiers(shopify, ["810221398622"], "barcode");
console.log(`Size 35 Shopify LIVE stock: ${live.found[0]?.inventory ?? "NOT FOUND BY BARCODE"}`);

const before = await db.catalogItem.findFirst({ where: { barcode: "810221398622" } });
console.log(`Size 35 DB before refresh: ${before.inventory}`);

await refreshCatalogFromShopify(before.tenantId, [before.sku]);
const after = await db.catalogItem.findFirst({ where: { barcode: "810221398622" } });
console.log(`Size 35 DB after refresh: ${after.inventory}`);
process.exit(0);
