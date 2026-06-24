import { db } from "./src/lib/db.ts";
import { fetchMiraklOrderById } from "./src/services/mirakl.ts";
import { fetchShopifyByIdentifiers } from "./src/services/shopify.ts";

const o = await db.order.findFirst({ where: { channelOrderId: "4763828303-A" } });
const conn = await db.connection.findUnique({ where: { id: o.connectionId } });
const raw = await fetchMiraklOrderById(conn, "4763828303-A");

console.log("=== MIRAKL ORDER LINE FIELDS ===");
for (const l of raw.order_lines ?? []) {
  console.log(JSON.stringify(l, null, 2));
}
process.exit(0);
