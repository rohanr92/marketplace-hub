import { db } from "./src/lib/db.js";
import { pushOrderToShopify } from "./src/services/orderPush.js";

// Amelie order that SHOULD push cleanly (single matched line)
const oid = "1048969997-50000-A";
const order = await db.order.findFirst({ where: { channelOrderId: oid } });
console.log(`Order ${oid}: state=${order?.state} shopifyId=${order?.shopifyOrderId ?? "none"}\n`);
console.log("Attempting push... (this will show the REAL error if it fails)\n");

try {
  const r = await pushOrderToShopify(order.id, order.tenantId);
  console.log("RESULT:", JSON.stringify(r, null, 2));
} catch (e) {
  console.log("=== PUSH FAILED WITH ERROR ===");
  console.log(e.message);
  console.log("\n=== FULL STACK ===");
  console.log(e.stack);
}
process.exit(0);
