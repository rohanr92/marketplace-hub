import { db } from "./src/lib/db.js";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.js";

const shopify = await db.connection.findFirst({ where: { type: "shopify", active: true } });

// The 3 unmatched Nordstrom products - check if their UPCs match Shopify barcodes
const upcs = ["810221398691"]; // Lucila Ivory 42 from the offer dump
for (const upc of upcs) {
  const r = await fetchShopifyByIdentifiers(shopify, [upc], "barcode");
  console.log(`UPC ${upc} -> ${r.found[0] ? "MATCH variant "+r.found[0].shopifyVariantId : "no barcode match in Shopify"}`);
}
process.exit(0);
