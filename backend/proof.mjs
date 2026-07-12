import { db } from "./src/lib/db.js";
import { refreshCatalogFromShopify } from "./src/services/syncEngine.js";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.js";

const lucila = await db.catalogItem.findFirst({ where: { barcode: "810221398691" } });
const shopify = await db.connection.findFirst({ where: { tenantId: lucila.tenantId, type: "shopify", active: true } });

// What does Shopify ACTUALLY have right now for this barcode?
const live = await fetchShopifyByIdentifiers(shopify, ["810221398691"], "barcode");
console.log(`Shopify LIVE stock for Lucila 42: ${live.found[0]?.inventory ?? "not found"}`);
console.log(`DB stored BEFORE refresh:         ${lucila.inventory}`);

await refreshCatalogFromShopify(lucila.tenantId, [lucila.sku]);

const after = await db.catalogItem.findFirst({ where: { barcode: "810221398691" } });
console.log(`DB stored AFTER refresh:          ${after.inventory}`);
console.log(after.inventory === (live.found[0]?.inventory) ? "\nMATCH - refresh pulled the correct live Shopify stock. FIX WORKS." : "\nMISMATCH - refresh did not pull live stock.");
process.exit(0);
