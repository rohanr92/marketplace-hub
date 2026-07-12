import { db } from "./src/lib/db.js";
import { refreshCatalogFromShopify } from "./src/services/syncEngine.js";

// Lucila 42's GID-sku (that's what the webhook would pass)
const lucila = await db.catalogItem.findFirst({ where: { barcode: "810221398691" } });
console.log(`BEFORE: Lucila 42 stored inv = ${lucila.inventory}`);

// Run the refresh exactly as the webhook does - passing the GID-sku
console.log("Running refreshCatalogFromShopify with Lucila's sku...");
const r = await refreshCatalogFromShopify(lucila.tenantId, [lucila.sku]);
console.log("refresh result:", JSON.stringify(r));

// Check the new stored value
const after = await db.catalogItem.findFirst({ where: { barcode: "810221398691" } });
console.log(`AFTER:  Lucila 42 stored inv = ${after.inventory}`);
console.log(after.inventory === lucila.inventory ? "\n*** STILL STALE - refresh did NOT update it (bug remains)" : "\n*** UPDATED - refresh pulled fresh Shopify stock (fix works)");
process.exit(0);
