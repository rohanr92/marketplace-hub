import { db } from "./src/lib/db.ts";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.ts";

const shopify = await db.connection.findFirst({ where: { type: "shopify", active: true } });

console.log("By SKU SIEN-TAU-W39:", (await fetchShopifyByIdentifiers(shopify, ["SIEN-TAU-W39"], "sku")).found.length);
console.log("By UPC 810221396420:", (await fetchShopifyByIdentifiers(shopify, ["810221396420"], "barcode")).found.length);

const offer = await db.channelOffer.findFirst({
  where: { offerSku: "SIEN-TAU-W39" },
  include: { catalogItem: true },
});
console.log("Local mapping:", offer?.catalogItem?.shopifyVariantId ?? "none", "| barcode:", offer?.catalogItem?.barcode ?? "n/a");
process.exit(0);
